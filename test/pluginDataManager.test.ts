import test from "node:test";
import assert from "node:assert/strict";
import type {Plugin} from "obsidian";
import {PluginDataManager} from "../src/core/pluginDataManager";

class FakePluginDataStore {
	public savedData: unknown;

	constructor(private storedData: unknown) {}

	async loadData(): Promise<unknown> {
		return this.storedData;
	}

	async saveData(data: unknown): Promise<void> {
		this.savedData = data;
		this.storedData = data;
	}
}

function createManager(data: unknown): {manager: PluginDataManager; store: FakePluginDataStore} {
	const store = new FakePluginDataStore(data);
	const manager = new PluginDataManager(store as unknown as Plugin);
	return {manager, store};
}

test("validates and normalizes persisted plugin data", async () => {
	const {manager} = createManager({
		readData: {
			"Notes/example.md": {
				fileId: "note-1",
				filePath: "Notes/example.md",
				duration: 12_345,
				openCount: 3,
				firstOpenedAt: 100,
				lastOpenedAt: 200
			},
			broken: {duration: "not-a-number"}
		},
		dailyData: {
			"2026-08-10": {
				dailyReadData: {
					"note-1": {fileId: "note-1", filePath: "", duration: 5000, openCount: 0}
				},
				sessions: [{fileId: "note-1", filePath: "Notes/example.md", openedAt: 100, closedAt: 200, duration: 100}]
			}
		},
		settings: {strictMode: false}
	});

	await manager.loadData();
	assert.equal(manager.getReadRecord("Notes/example.md")?.duration, 12_345);
	assert.equal(manager.getReadRecord("broken"), undefined);
	assert.equal(manager.getDailyReadData("2026-08-10")?.sessions.length, 1);
	assert.match(manager.getDailyReadData("2026-08-10")?.sessions[0]?.id ?? "", /^legacy-/);
	assert.equal(manager.getDailyReadData("2026-08-10")?.sessions[0]?.source, "automatic");
	assert.deepEqual(manager.getDailyReadDates(), ["2026-08-10"]);
	assert.equal(manager.getStrictMode(), false);
});

test("persists typed updates without losing other categories", async () => {
	const {manager, store} = createManager({
		readData: {},
		dailyData: {},
		settings: {strictMode: true}
	});

	await manager.loadData();
	await manager.setReadRecord("Example.md", {
		fileId: "note-2",
		filePath: "Example.md",
		duration: 9000,
		openCount: 2
	});
	await manager.setStrictMode(false);

	assert.equal(manager.getReadRecord("Example.md")?.openCount, 2);
	assert.equal(manager.getStrictMode(), false);
	assert.ok(store.savedData);
});

test("manual session create, edit, and delete keeps aggregates consistent", async () => {
	const {manager} = createManager({
		readData: {
			"Notes/example.md": {fileId: "note-1", filePath: "Notes/example.md", duration: 10_000, openCount: 2}
		},
		dailyData: {
			"2026-8-10": {
				dailyReadData: {"note-1": {fileId: "note-1", filePath: "", duration: 10_000, openCount: 0}},
				sessions: []
			}
		},
		settings: {strictMode: true}
	});

	await manager.loadData();
	const openedAt = new Date(2026, 7, 10, 10).getTime();
	const created = await manager.createManualSession({fileId: "note-1", filePath: "Notes/example.md", openedAt, duration: 5_000});
	assert.equal(manager.getReadRecord("Notes/example.md")?.duration, 15_000);
	assert.equal(manager.getReadRecord("Notes/example.md")?.openCount, 3);
	assert.equal(manager.getDailyReadData("2026-8-10")?.dailyReadData["note-1"]?.duration, 15_000);
	assert.equal(manager.getSessions().length, 1);

	await manager.updateSession(created.id, {fileId: "note-1", filePath: "Notes/example.md", openedAt, duration: 8_000});
	assert.equal(manager.getReadRecord("Notes/example.md")?.duration, 18_000);
	assert.equal(manager.getReadRecord("Notes/example.md")?.openCount, 3);

	assert.equal(await manager.deleteSession(created.id), true);
	assert.equal(manager.getReadRecord("Notes/example.md")?.duration, 10_000);
	assert.equal(manager.getReadRecord("Notes/example.md")?.openCount, 2);
	assert.equal(manager.getSessions().length, 0);
});

test("completed automatic sessions do not double-count time already tracked", async () => {
	const {manager} = createManager({
		readData: {"A.md": {fileId: "a", filePath: "A.md", duration: 6_000, openCount: 1}},
		dailyData: {"2026-8-10": {dailyReadData: {a: {fileId: "a", filePath: "", duration: 6_000, openCount: 0}}, sessions: []}},
		settings: {}
	});
	await manager.loadData();
	await manager.recordCompletedSession({
		id: "session-a",
		fileId: "a",
		filePath: "A.md",
		openedAt: new Date(2026, 7, 10, 10).getTime(),
		closedAt: new Date(2026, 7, 10, 10, 1).getTime(),
		duration: 6_000,
		source: "automatic",
		createdAt: 1,
		updatedAt: 2
	});
	assert.equal(manager.getReadRecord("A.md")?.duration, 6_000);
	assert.equal(manager.getReadRecord("A.md")?.openCount, 1);
	assert.equal(manager.getSessions().length, 1);
});

test("serialized mutations do not lose concurrently added sessions", async () => {
	const {manager} = createManager({readData: {}, dailyData: {}, settings: {}});
	await manager.loadData();
	const openedAt = new Date(2026, 7, 10, 10).getTime();
	await Promise.all([
		manager.createManualSession({fileId: "a", filePath: "A.md", openedAt, duration: 1_000}),
		manager.createManualSession({fileId: "b", filePath: "B.md", openedAt, duration: 2_000})
	]);
	assert.equal(manager.getSessions().length, 2);
	assert.equal(manager.getReadRecord("A.md")?.duration, 1_000);
	assert.equal(manager.getReadRecord("B.md")?.duration, 2_000);
});

test("export and import round-trip preserves sessions and settings", async () => {
	const {manager} = createManager({readData: {}, dailyData: {}, settings: {strictMode: false}});
	await manager.loadData();
	await manager.createManualSession({fileId: "a", filePath: "A.md", openedAt: new Date(2026, 7, 10).getTime(), duration: 3_000});
	const snapshot = manager.exportData();
	await manager.deleteSession(manager.getSessions()[0]?.id ?? "");
	assert.equal(manager.getSessions().length, 0);
	await manager.importData(snapshot);
	assert.equal(manager.getSessions().length, 1);
	assert.equal(manager.getReadRecord("A.md")?.duration, 3_000);
	assert.equal(manager.getStrictMode(), false);
});

test("invalid imports are rejected without replacing current data", async () => {
	const {manager} = createManager({
		readData: {"A.md": {fileId: "a", filePath: "A.md", duration: 4_000, openCount: 1}},
		dailyData: {},
		settings: {}
	});
	await manager.loadData();
	await assert.rejects(manager.importData({unexpected: true}));
	assert.equal(manager.getReadRecord("A.md")?.duration, 4_000);
});

test("1.1 data migrates with optional reading coverage disabled", async () => {
	const {manager} = createManager({
		dataVersion: 2,
		readData: {},
		dailyData: {},
		settings: {strictMode: true}
	});
	await manager.loadData();
	assert.equal(manager.getProgressTrackingEnabled(), false);
	assert.deepEqual(manager.getProgressEntries(), []);
});

test("1.2 data migrates with safe default study goals", async () => {
	const {manager} = createManager({dataVersion: 3, readData: {}, dailyData: {}, progressEntries: [], settings: {}});
	await manager.loadData();
	assert.deepEqual(manager.getStudyGoals(), {dailyMinutes: 30, weeklyMinutes: 180});
	await manager.setStudyGoals(45, 240);
	assert.deepEqual(manager.getStudyGoals(), {dailyMinutes: 45, weeklyMinutes: 240});
});

test("reading coverage entries can be created, edited, filtered, and deleted", async () => {
	const {manager} = createManager({readData: {}, dailyData: {}, settings: {}});
	await manager.loadData();
	await manager.setProgressTrackingEnabled(true);
	const created = await manager.createProgressEntry({
		fileId: "a",
		filePath: "A.md",
		percent: 12.5,
		recordedAt: 1_000,
		characterCount: 2_000,
		activeDuration: 60_000
	});
	assert.equal(manager.getProgressTrackingEnabled(), true);
	assert.equal(manager.getProgressEntries("A.md")[0]?.percent, 12.5);

	await manager.updateProgressEntry(created.id, {
		fileId: "a",
		filePath: "A.md",
		percent: 150,
		recordedAt: 2_000,
		characterCount: 2_100,
		activeDuration: 90_000
	});
	assert.equal(manager.getProgressEntries()[0]?.percent, 100);
	assert.equal(manager.getProgressEntries()[0]?.characterCount, 2_100);
	assert.equal(await manager.deleteProgressEntry(created.id), true);
	assert.deepEqual(manager.getProgressEntries(), []);
});

test("migrates a large legacy session history without losing or duplicating records", async () => {
	const sessions = Array.from({length: 10_000}, (_, index) => ({
		fileId: `note-${index % 100}`,
		filePath: `Notes/${index % 100}.md`,
		openedAt: index * 10_000,
		closedAt: index * 10_000 + 5_000,
		duration: 5_000
	}));
	const {manager} = createManager({
		readData: {},
		dailyData: {"2026-8-10": {dailyReadData: {}, sessions}},
		settings: {}
	});

	await manager.loadData();
	const migrated = manager.getSessions();
	assert.equal(migrated.length, sessions.length);
	assert.equal(new Set(migrated.map((session) => session.id)).size, sessions.length);
	assert.ok(migrated.every((session) => session.source === "automatic"));
});
