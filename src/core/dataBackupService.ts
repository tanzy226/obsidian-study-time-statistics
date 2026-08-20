import {App, normalizePath, TFile} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";

const BACKUP_FOLDER = "Study Time Statistics Backups";
const BACKUP_FORMAT = "study-time-statistics-backup";

interface BackupDocument {
	format: typeof BACKUP_FORMAT;
	version: 1;
	createdAt: number;
	pluginData: unknown;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: undefined;
}

export function parseBackupDocument(value: unknown): BackupDocument | undefined {
	const source = asObject(value);
	if (!source || source.format !== BACKUP_FORMAT || source.version !== 1 || !("pluginData" in source)) return undefined;
	return {
		format: BACKUP_FORMAT,
		version: 1,
		createdAt: typeof source.createdAt === "number" && Number.isFinite(source.createdAt) ? source.createdAt : 0,
		pluginData: source.pluginData
	};
}

function backupFileName(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${timestamp % 1000}.json`;
}

export class DataBackupService {
	private lastSafetyBackupAt = 0;

	constructor(private readonly app: App, private readonly dataManager: PluginDataManager) {}

	public async createBackup(): Promise<string> {
		await this.dataManager.loadData();
		await this.ensureBackupFolder();
		const createdAt = Date.now();
		const document: BackupDocument = {
			format: BACKUP_FORMAT,
			version: 1,
			createdAt,
			pluginData: this.dataManager.exportData()
		};
		const path = normalizePath(`${BACKUP_FOLDER}/${backupFileName(createdAt)}`);
		await this.app.vault.create(path, JSON.stringify(document, null, 2));
		this.lastSafetyBackupAt = createdAt;
		return path;
	}

	public async createSafetyBackup(): Promise<void> {
		if (Date.now() - this.lastSafetyBackupAt < 5 * 60 * 1000) return;
		await this.createBackup();
	}

	public async restoreLatestBackup(): Promise<string | undefined> {
		const latest = this.getBackupFiles()[0];
		if (!latest) return undefined;
		const content = await this.app.vault.read(latest);
		const parsedJson: unknown = JSON.parse(content);
		const backup = parseBackupDocument(parsedJson);
		if (!backup) throw new Error("Invalid Study Time Statistics backup");
		await this.dataManager.importData(backup.pluginData);
		return latest.path;
	}

	public getBackupFiles(): TFile[] {
		const prefix = `${normalizePath(BACKUP_FOLDER)}/`;
		return this.app.vault.getFiles()
			.filter(file => file.path.startsWith(prefix) && file.extension.toLowerCase() === "json")
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	private async ensureBackupFolder(): Promise<void> {
		const normalized = normalizePath(BACKUP_FOLDER);
		if (!this.app.vault.getFolderByPath(normalized)) await this.app.vault.createFolder(normalized);
	}
}
