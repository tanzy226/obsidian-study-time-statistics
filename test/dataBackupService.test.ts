import test from "node:test";
import assert from "node:assert/strict";
import type {App, Plugin, TFile} from "obsidian";
import {DataBackupService, type BackupCandidate} from "../src/core/dataBackupService";
import {DataSafetyError} from "../src/core/dataSafetyError";
import {PluginDataManager} from "../src/core/pluginDataManager";

const backupFolder = "Study Time Statistics Backups";
const snapshot = (duration: number) => ({
	readData: {"Note.md": {fileId: "note", filePath: "Note.md", openCount: 1, duration}},
	dailyData: {}
});
const serializedBackup = (createdAt: number, pluginData: unknown) => JSON.stringify({
	format: "study-time-statistics-backup", version: 1, createdAt, pluginData
});
const backupPath = (suffix: number) => `${backupFolder}/backup-20260101-000000-${suffix}.json`;

class FakeVault {
	public trashed: string[] = [];
	public corruptNewBackup = false;
	private readonly files = new Map<string, {file: TFile; content: string}>();

	public put(path: string, content: string, modifiedAt = Date.now()): TFile {
		const file = {path, stat: {mtime: modifiedAt, ctime: modifiedAt, size: content.length}} as TFile;
		this.files.set(path, {file, content});
		return file;
	}

	public app(): App {
		return {
			vault: {
				getFiles: () => [...this.files.values()].map(entry => entry.file),
				getFolderByPath: () => ({}),
				create: async (path: string, content: string) => this.put(path, this.corruptNewBackup ? "" : content),
				read: async (file: TFile) => {
					const entry = this.files.get(file.path);
					if (!entry) throw new Error("File was removed");
					return entry.content;
				}
			},
			fileManager: {
				trashFile: async (file: TFile) => {
					this.trashed.push(file.path);
					this.files.delete(file.path);
				}
			}
		} as unknown as App;
	}
}

function fixture(initialData: unknown = snapshot(5000)) {
	const vault = new FakeVault();
	let stored = structuredClone(initialData);
	let attempts = 0;
	let failing = false;
	const manager = new PluginDataManager({
		loadData: async () => structuredClone(stored),
		saveData: async (value: unknown) => {
			attempts++;
			if (failing) throw Error("Mock save failure");
			stored = structuredClone(value);
		}
	} as unknown as Plugin);
	return {
		vault, manager, service: new DataBackupService(vault.app(), manager), attempts: () => attempts,
		disallowWrite: () => { failing = true; }
	};
}

function assertReason(reason: DataSafetyError["reason"]) {
	return (error: unknown) => error instanceof DataSafetyError && error.reason === reason;
}

async function latest(service: DataBackupService): Promise<BackupCandidate> {
	const candidate = await service.findLatestBackup();
	assert.ok(candidate);
	return candidate;
}

test("backup retention keeps unrelated, nested, corrupt, and unsupported files", async () => {
	const {vault, service} = fixture();
	vault.put(backupPath(1), serializedBackup(10, snapshot(10)), 500_000);
	vault.put(backupPath(2), serializedBackup(20, snapshot(20)), 1);
	vault.put(backupPath(3), serializedBackup(30, snapshot(30)), 2);
	vault.put(backupPath(4), "{ invalid", 99);
	vault.put(backupPath(5), serializedBackup(40, {...snapshot(40), dataVersion: 99}), 99);
	vault.put(`${backupFolder}/custom.json`, serializedBackup(5, snapshot(5)), 1);
	vault.put(`${backupFolder}/Other/backup-20260101-000000-1.json`, serializedBackup(5, snapshot(5)), 1);
	assert.equal(await service.pruneBackups(2), 1);
	assert.deepEqual(vault.trashed, [backupPath(1)]);
	assert.equal((await latest(service)).path, backupPath(3));
});

test("restore confirms the exact candidate, verifies a safety backup, and restores that snapshot", async () => {
	const {vault, manager, service, attempts} = fixture();
	await manager.loadData();
	vault.put(backupPath(1), serializedBackup(10, snapshot(10)));
	vault.put(backupPath(2), serializedBackup(20, snapshot(20)));
	const candidate = await latest(service);
	// A newer backup arrives after the candidate was shown. Do not switch to it silently.
	vault.put(backupPath(3), serializedBackup(30, snapshot(30)));
	assert.equal(await service.restoreBackup(candidate), backupPath(2));
	assert.equal(attempts(), 1);
	assert.equal(manager.getReadRecord("Note.md")?.duration, 20);
	assert.equal(service.getBackupFiles().length, 4);
	const rollback = await latest(service);
	const parsed = JSON.parse(rollback.content);
	assert.equal(parsed.pluginData.readData["Note.md"].duration, 5000);
});

test("a changed restore candidate is rejected before writing a backup or data", async () => {
	const {vault, service, attempts} = fixture();
	vault.put(backupPath(1), serializedBackup(10, snapshot(10)));
	const candidate = await latest(service);
	vault.put(backupPath(1), serializedBackup(10, snapshot(11)));
	await assert.rejects(service.restoreBackup(candidate), assertReason("changed"));
	assert.equal(attempts(), 0);
	assert.equal(service.getBackupFiles().length, 1);
});

test("a restore write failure skips neither to older backups nor to retention", async () => {
	const {vault, manager, service, attempts, disallowWrite} = fixture();
	await manager.loadData();
	for (let i = 1; i <= 22; i++) vault.put(backupPath(i), serializedBackup(i, snapshot(i)));
	const candidate = await latest(service);
	assert.equal(candidate.path, backupPath(22));
	disallowWrite();
	await assert.rejects(service.restoreBackup(candidate), assertReason("write"));
	assert.equal(attempts(), 1);
	assert.equal(manager.getReadRecord("Note.md")?.duration, 5000);
	assert.deepEqual(vault.trashed, []);
	assert.equal(service.getBackupFiles().length, 23);
});

test("failed backup verification prevents data replacement and pruning", async () => {
	const {vault, manager, service, attempts} = fixture();
	await manager.loadData();
	vault.put(backupPath(1), serializedBackup(10, snapshot(10)));
	const candidate = await latest(service);
	vault.corruptNewBackup = true;
	await assert.rejects(service.restoreBackup(candidate), assertReason("write"));
	assert.equal(attempts(), 0);
	assert.equal(manager.getReadRecord("Note.md")?.duration, 5000);
	assert.deepEqual(vault.trashed, []);
});

test("ordinary backup does not write an apparent empty snapshot of protected data", async () => {
	const {service} = fixture({...snapshot(5000), dataVersion: 99});
	await assert.rejects(service.createBackup(), assertReason("future-version"));
	assert.deepEqual(service.getBackupFiles(), []);
});
