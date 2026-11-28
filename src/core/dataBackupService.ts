import type {App, TFile} from "obsidian";
import type {PluginDataManager} from "./pluginDataManager";
import {DataSafetyError} from "./dataSafetyError";

const BACKUP_FOLDER = "Study Time Statistics Backups";
const BACKUP_FORMAT = "study-time-statistics-backup";
const BACKUP_NAME = /^backup-\d{8}-\d{6}-\d{1,3}(?:-[a-z0-9]{8})?\.json$/u;
const BACKUP_LIMIT = 20;

interface BackupDocument {
	format: typeof BACKUP_FORMAT;
	version: 1;
	createdAt: number;
	pluginData: unknown;
}

interface BackupFile {
	file: TFile;
	backup: BackupDocument;
	content: string;
}

export interface BackupCandidate {
	path: string;
	createdAt: number;
	sessionCount: number;
	progressCount: number;
	content: string;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: undefined;
}

export function parseBackupDocument(value: unknown): BackupDocument | undefined {
	const source = asObject(value);
	if (!source || source.format !== BACKUP_FORMAT || source.version !== 1 || !("pluginData" in source) ||
		typeof source.createdAt !== "number" || !Number.isSafeInteger(source.createdAt) || source.createdAt <= 0 || source.createdAt > 8.64e15) return undefined;
	return {
		format: BACKUP_FORMAT,
		version: 1,
		createdAt: source.createdAt,
		pluginData: source.pluginData
	};
}

function backupFileName(timestamp: number, suffix: string): string {
	const date = new Date(timestamp);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${timestamp % 1000}-${suffix}.json`;
}

function compareBackups(a: Pick<BackupFile, "file"> & {createdAt: number}, b: Pick<BackupFile, "file"> & {createdAt: number}): number {
	return b.createdAt - a.createdAt || (a.file.path < b.file.path ? -1 : a.file.path === b.file.path ? 0 : 1);
}

export class DataBackupService {
	private backupQueue: Promise<unknown> = Promise.resolve();
	private readonly retainedPaths = new Set<string>();
	private restoringPath?: string;

	constructor(
		private readonly app: App,
		private readonly dataManager: PluginDataManager,
		private readonly withHistoryReplacement = (action: () => Promise<void>) => action()
	) {}

	public async createBackup(): Promise<string> {
		await this.dataManager.loadData();
		const protection = this.dataManager.getWriteProtection();
		if (protection) throw protection;
		const snapshot = this.dataManager.exportData();
		return this.withSafetyBackup(backup => backup(snapshot));
	}

	/** For use inside a queued data mutation. Do not load the data manager again here. */
	public createBackupFromData(snapshot: unknown): Promise<string> {
		return this.enqueueBackup(() => this.writeVerifiedBackup(snapshot));
	}

	public async withSafetyBackup<T>(operation: (backup: (snapshot: unknown) => Promise<string>) => Promise<T>): Promise<T> {
		const newPaths: string[] = [];
		try {
			const result = await operation(snapshot => this.enqueueBackup(async () => {
				const path = await this.writeVerifiedBackup(snapshot);
				this.retainedPaths.add(path);
				newPaths.push(path);
				return path;
			}));
			if (newPaths.length > 0) {
				await this.pruneBackups(BACKUP_LIMIT).catch(() => {
					console.warn("Study Time Statistics could not clean up old backups");
				});
			}
			return result;
		} finally {
			for (const path of newPaths) this.retainedPaths.delete(path);
		}
	}

	public pruneBackups(maximum: number): Promise<number> {
		return this.enqueueBackup(async () => {
			const files = this.getBackupFiles();
			if (files.length <= maximum) return 0;
			const managed: Array<{file: TFile; createdAt: number; modifiedAt: number; size: number}> = [];
			for (const file of files) {
				const parsed = await this.readValidBackup(file);
				if (parsed) managed.push({file, createdAt: parsed.backup.createdAt, modifiedAt: file.stat.mtime, size: file.stat.size});
			}
			let removed = 0;
			for (const {file, createdAt, modifiedAt, size} of managed.sort(compareBackups).slice(Math.max(0, maximum))) {
				if (this.retainedPaths.has(file.path) || this.restoringPath === file.path) continue;
				// Do not remove an entry that was replaced by sync after inspection.
				const current = await this.readValidBackup(file);
				if (!current || current.backup.createdAt !== createdAt || file.stat.mtime !== modifiedAt || file.stat.size !== size) continue;
				if (this.retainedPaths.has(file.path) || this.restoringPath === file.path) continue;
				await this.app.fileManager.trashFile(file);
				removed++;
			}
			return removed;
		});
	}

	public async createSafetyBackup(): Promise<void> {
		await this.createBackup();
	}

	public async findLatestBackup(): Promise<BackupCandidate | undefined> {
		let latest: BackupFile | undefined;
		for (const file of this.getBackupFiles()) {
			const parsed = await this.readValidBackup(file);
			if (parsed && (!latest || compareBackups({file, createdAt: parsed.backup.createdAt},
				{file: latest.file, createdAt: latest.backup.createdAt}) < 0)) latest = parsed;
		}
		if (!latest) return undefined;
		const snapshot = asObject(latest.backup.pluginData);
		let sessionCount = 0;
		for (const day of Object.values(asObject(snapshot?.dailyData) ?? {})) {
			const sessions = asObject(day)?.sessions;
			if (Array.isArray(sessions)) sessionCount += sessions.length;
		}
		return {
			path: latest.file.path,
			createdAt: latest.backup.createdAt,
			sessionCount,
			progressCount: Array.isArray(snapshot?.progressEntries) ? snapshot.progressEntries.length : 0,
			content: latest.content
		};
	}

	public async restoreBackup(candidate: BackupCandidate): Promise<string> {
		if (this.restoringPath) throw new DataSafetyError("changed");
		this.restoringPath = candidate.path;
		try {
			const file = this.getBackupFiles().find(item => item.path === candidate.path);
			const current = file ? await this.readBackup(file) : undefined;
			if (!current || current.content !== candidate.content) throw new DataSafetyError("changed");
			await this.withHistoryReplacement(() => this.withSafetyBackup(backup => this.dataManager.importData(current.backup.pluginData, backup)));
			return candidate.path;
		} finally {
			this.restoringPath = undefined;
		}
	}

	public getBackupFiles(): TFile[] {
		const prefix = `${BACKUP_FOLDER}/`;
		return this.app.vault.getFiles()
			.filter(file => file.path.startsWith(prefix) && BACKUP_NAME.test(file.path.slice(prefix.length)));
	}

	private enqueueBackup<T>(operation: () => Promise<T>): Promise<T> {
		const task = this.backupQueue.then(operation);
		this.backupQueue = task.catch(() => undefined);
		return task;
	}

	private async writeVerifiedBackup(snapshot: unknown): Promise<string> {
		try {
			if (!this.app.vault.getFolderByPath(BACKUP_FOLDER)) await this.app.vault.createFolder(BACKUP_FOLDER);
			const createdAt = Date.now();
			const suffix = Math.random().toString(36).slice(2, 10).padStart(8, "0");
			const path = `${BACKUP_FOLDER}/${backupFileName(createdAt, suffix)}`;
			const document: BackupDocument = {format: BACKUP_FORMAT, version: 1, createdAt, pluginData: snapshot};
			const content = JSON.stringify(document, null, 2);
			const file = await this.app.vault.create(path, content);
			if (await this.app.vault.read(file) !== content) throw new Error("Backup read-back did not match the original");
			return path;
		} catch (error) {
			throw new DataSafetyError("write", error);
		}
	}

	private async readBackup(file: TFile): Promise<BackupFile | undefined> {
		const content = await this.app.vault.read(file);
		try {
			const backup = parseBackupDocument(JSON.parse(content));
			if (backup) return {file, backup, content};
		} catch {
			// A malformed file is never treated as a valid restoration or retention candidate.
		}
		return undefined;
	}

	private async readValidBackup(file: TFile): Promise<BackupFile | undefined> {
		const parsed = await this.readBackup(file);
		if (!parsed) return undefined;
		try {
			await this.dataManager.validateImport(parsed.backup.pluginData);
			return parsed;
		} catch {
			// Unsupported and damaged backups must not be pruned or restored.
			return undefined;
		}
	}
}
