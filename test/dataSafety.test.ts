import test from "node:test";
import assert from "node:assert/strict";
import type {Plugin} from "obsidian";
import {PluginDataManager} from "../src/core/pluginDataManager";
import {DataSafetyError, type DataSafetyReason} from "../src/core/dataSafetyError";
import {localDateKey} from "../src/util/timeBuckets";

function fixture(data: unknown = {readData: {}, dailyData: {}}) {
	const store = {
		raw: structuredClone(data),
		writes: 0,
		fail: false,
		exists: false,
		manifest: {dir: ".obsidian/plugins/example"},
		app: {vault: {adapter: {exists: async (): Promise<boolean> => store.exists}}},
		loadData: async (): Promise<unknown> => structuredClone(store.raw),
		saveData: async (value: unknown): Promise<void> => {
			store.writes++;
			if (store.fail) throw new Error("Storage unavailable");
			store.raw = structuredClone(value);
		}
	};
	return {manager: new PluginDataManager(store as unknown as Plugin), store};
}

const reason = (expected: DataSafetyReason) => (error: unknown): boolean => error instanceof DataSafetyError && error.reason === expected;
const start = new Date(2026, 10, 20, 12).getTime();

test("two independent IDs for the same path cannot silently overwrite each other", async () => {
	const left = fixture();
	const right = fixture();
	await left.manager.createManualSession({fileId: "left", filePath: "A.md", openedAt: start, duration: 60_000});
	await right.manager.createManualSession({fileId: "right", filePath: "A.md", openedAt: start, duration: 120_000});
	const a = structuredClone(left.store.raw);
	const b = structuredClone(right.store.raw);
	await assert.rejects(left.manager.mergeData(b), reason("ambiguous"));
	await assert.rejects(right.manager.mergeData(a), reason("ambiguous"));
	assert.deepEqual(left.store.raw, a);
	assert.deepEqual(right.store.raw, b);
});

test("an identical paused midnight snapshot is a true no-op; unsafe date corrections do not write", async () => {
	const {manager, store} = fixture();
	const openedAt = new Date(2026, 10, 20, 23, 58).getTime();
	const closedAt = new Date(2026, 10, 21, 0, 2).getTime();
	await manager.recordFileOpened("A.md", "a", openedAt);
	await manager.addTrackedTime("A.md", "a", 60_000, closedAt);
	await manager.recordCompletedSession({id: "paused", fileId: "a", filePath: "A.md", openedAt, closedAt,
		duration: 60_000, source: "automatic", createdAt: openedAt, updatedAt: closedAt});
	const snapshot = manager.exportData();
	const writes = store.writes;
	await manager.mergeData(snapshot, async () => { assert.fail("A no-op should not create a backup"); });
	await assert.rejects(manager.deleteSession("paused"), reason("ambiguous"));
	await assert.rejects(manager.updateSession("paused", {fileId: "a", filePath: "A.md", openedAt, duration: 2000}), reason("ambiguous"));
	const other = fixture();
	await other.manager.createManualSession({fileId: "b", filePath: "B.md", openedAt: start, duration: 60_000});
	await assert.rejects(manager.mergeData(other.store.raw), reason("ambiguous"));
	assert.deepEqual(store.raw, snapshot);
	assert.equal(store.writes, writes);
	assert.equal(manager.getDailyReadData(localDateKey(closedAt))?.dailyReadData.a?.duration, 60_000);
});

test("a refused restore write cannot publish a replacement in memory", async () => {
	const {manager, store} = fixture();
	await manager.createManualSession({fileId: "a", filePath: "A.md", openedAt: start, duration: 60_000});
	const before = manager.exportData();
	const revision = manager.getRevision();
	store.fail = true;
	await assert.rejects(manager.importData({readData: {}, dailyData: {}}, async snapshot => {
		assert.deepEqual(snapshot, before);
	}), reason("write"));
	assert.equal(manager.getRevision(), revision);
	assert.deepEqual(manager.exportData(), before);
	assert.deepEqual(store.raw, before);
});

test("an external change while making the verified backup blocks the pending replacement", async () => {
	const {manager, store} = fixture();
	await manager.loadData();
	const external = {readData: {}, dailyData: {}, settings: {strictMode: false}};
	await assert.rejects(manager.importData({readData: {}, dailyData: {}, settings: {dailyGoalMinutes: 90}}, async () => {
		store.raw = external;
	}), reason("changed"));
	assert.equal(store.writes, 0);
	assert.deepEqual(store.raw, external);
});

test("startup and tracking never overwrite unknown versions or unreadable existing data", async () => {
	const raw = {dataVersion: 999, readData: {}, dailyData: {}, newField: "preserve"};
	const future = fixture(raw);
	await future.manager.loadData();
	future.manager.ensureDeviceId();
	await assert.rejects(future.manager.setStrictMode(false), reason("future-version"));
	assert.equal(future.manager.getWriteProtection()?.reason, "future-version");
	assert.equal(future.store.writes, 0);
	assert.deepEqual(future.store.raw, raw);
	const unreadable = fixture(null);
	unreadable.store.exists = true;
	await unreadable.manager.loadData();
	await assert.rejects(unreadable.manager.setStrictMode(false), reason("unreadable"));
	assert.equal(unreadable.store.writes, 0);
});

test("legacy migration backs up the exact old shape before its first write", async () => {
	const raw = {readData: {"A.md": {fileId: "a", filePath: "A.md", duration: 20_000, openCount: 1}}};
	const {manager, store} = fixture(raw);
	let backups = 0;
	manager.setMigrationBackup(async snapshot => {
		backups++;
		assert.deepEqual(snapshot, raw);
		assert.equal(store.writes, 0);
	});
	await manager.loadData();
	await manager.setStrictMode(false);
	await manager.setStrictMode(true);
	assert.equal(backups, 1);
	assert.equal(store.writes, 2);
	assert.equal(manager.getReadRecord("A.md")?.duration, 20_000);
});

test("unsafe import numbers and mismatched event entities are rejected before saving", async () => {
	const {manager, store} = fixture();
	for (const snapshot of [
		{readData: {"A.md": {fileId: "a", duration: "10000", openCount: -1}}, dailyData: {}},
		{readData: {}, dailyData: {"2026-2-30": {dailyReadData: {}, sessions: []}}},
		{readData: {}, dailyData: {}, eventLog: [{id: "event", deviceId: "peer", timestamp: start, entity: "progress",
			entityId: "different", operation: "upsert", payload: {id: "p", fileId: "a", filePath: "A.md", recordedAt: start, percent: 20}}]}
	]) await assert.rejects(manager.importData(snapshot), reason("invalid-snapshot"));
	assert.equal(store.writes, 0);
});

test("ID-less legacy progress has one stable identity across retries", async () => {
	const {manager, store} = fixture();
	const snapshot = {readData: {}, dailyData: {}, progressEntries: [{fileId: "a", filePath: "A.md", recordedAt: start, percent: 20, characterCount: 1000}]};
	await manager.mergeData(snapshot);
	const first = manager.getProgressEntries()[0];
	await manager.mergeData(snapshot);
	assert.equal(manager.getProgressEntries().length, 1);
	assert.equal(manager.getProgressEntries()[0]?.id, first?.id);
	assert.equal(store.writes, 1);
});

test("an explicit rename survives a peer writing to the stale path and repeated merge", async () => {
	const {manager, store} = fixture();
	const first = await manager.createManualSession({fileId: "a", filePath: "A.md", openedAt: start, duration: 60_000});
	await manager.renameFilePath("A.md", "B.md");
	const peer = fixture();
	const second = await peer.manager.createManualSession({fileId: "a", filePath: "A.md", openedAt: start, duration: 120_000});
	await manager.mergeData(peer.store.raw);
	const once = structuredClone(store.raw);
	await manager.mergeData(peer.store.raw);
	assert.equal(manager.getReadRecord("B.md")?.duration, 180_000);
	assert.equal(manager.getReadRecord("A.md"), undefined);
	assert.equal(manager.getSession(second.id)?.filePath, "B.md");
	assert.equal(manager.getSession(first.id)?.filePath, "B.md");
	assert.deepEqual(store.raw, once);
});

test("folder moves update sessions and progress together and refuse collisions", async () => {
	const {manager, store} = fixture();
	const session = await manager.createManualSession({fileId: "a", filePath: "Pre/A.md", openedAt: start, duration: 60_000});
	await manager.createProgressEntry({fileId: "b", filePath: "Pre/B.md", recordedAt: start, percent: 20, characterCount: 1000, activeDuration: 2000});
	await manager.renameFilePath("Pre", "Post", true);
	assert.equal(manager.getReadRecord("Post/A.md")?.duration, 60_000);
	assert.equal(manager.getSession(session.id)?.filePath, "Post/A.md");
	assert.equal(manager.getProgressEntries("Post/B.md").length, 1);
	assert.equal(manager.getDailyReadData(localDateKey(start))?.dailyReadData.a?.filePath, "Post/A.md");
	await manager.createManualSession({fileId: "other", filePath: "Existing/A.md", openedAt: start, duration: 1000});
	const before = structuredClone(store.raw);
	await assert.rejects(manager.renameFilePath("Post", "Existing", true), reason("ambiguous"));
	assert.deepEqual(store.raw, before);
});

test("duplicate repair records its chosen value so that stale imports cannot undo it", async () => {
	const first = {id: "duplicate", fileId: "a", filePath: "A.md", openedAt: start, closedAt: start + 5000, duration: 5000,
		source: "manual", createdAt: start, updatedAt: start + 5000};
	const winner = {...first, closedAt: start + 7000, duration: 7000, updatedAt: start + 7000};
	const event = {id: "old", deviceId: "peer", timestamp: start + 5000, entity: "session", entityId: first.id, fileId: "a", operation: "upsert", payload: first};
	const make = (sessions: unknown[], duration: number) => ({
		readData: {"A.md": {fileId: "a", filePath: "A.md", duration, openCount: sessions.length}},
		dailyData: {[localDateKey(start)]: {dailyReadData: {a: {fileId: "a", filePath: "A.md", duration, openCount: 0}}, sessions}},
		eventLog: [event]
	});
	const {manager} = fixture(make([first, winner], 12_000));
	await manager.repairSessionData();
	await manager.mergeData(make([first], 5000));
	assert.equal(manager.getSession(first.id)?.duration, 7000);
	assert.equal(manager.getReadRecord("A.md")?.duration, 7000);
});

test("overlapping legacy open totals without distinct IDs are not guessed", async () => {
	const left = fixture();
	const right = fixture();
	await left.manager.recordFileOpened("A.md", "a", start);
	await right.manager.recordFileOpened("A.md", "a", start + 1000);
	const before = structuredClone(left.store.raw);
	await assert.rejects(left.manager.mergeData(right.store.raw), reason("ambiguous"));
	assert.deepEqual(left.store.raw, before);
});

test("unfinished on-disk totals cannot be added to the same activity after it becomes a session", async () => {
	const {manager, store} = fixture();
	await manager.recordFileOpened("A.md", "a", start);
	await manager.addTrackedTime("A.md", "a", 1000, start + 1000);
	const partial = structuredClone(store.raw);
	await manager.addTrackedTime("A.md", "a", 1000, start + 2000);
	await manager.recordCompletedSession({id: "a-session", fileId: "a", filePath: "A.md", openedAt: start, closedAt: start + 2000,
		duration: 2000, source: "automatic", createdAt: start, updatedAt: start + 2000});
	const completed = structuredClone(store.raw);
	const peer = fixture(partial);
	await assert.rejects(manager.mergeData(partial), reason("ambiguous"));
	await assert.rejects(peer.manager.mergeData(completed), reason("ambiguous"));
	assert.deepEqual(store.raw, completed);
	assert.deepEqual(peer.store.raw, partial);
	await manager.deleteSession("a-session");
	await assert.rejects(manager.mergeData(partial), reason("ambiguous"));
	assert.equal(manager.getReadRecord("A.md")?.duration, 0);
});

test("an invalid automatic session is rejected without poisoning the stored tracked totals", async () => {
	const {manager, store} = fixture();
	await manager.recordFileOpened("A.md", "a", start);
	await manager.addTrackedTime("A.md", "a", 1000, start + 1000);
	const before = structuredClone(store.raw);
	await assert.rejects(manager.recordCompletedSession({id: "clock", fileId: "a", filePath: "A.md",
		openedAt: start, closedAt: start - 1000, duration: 1000, source: "automatic", createdAt: start, updatedAt: start - 1000}), reason("invalid-snapshot"));
	assert.deepEqual(store.raw, before);
	await manager.recordFileOpened("B.md", "b", start + 3000);
	assert.equal(manager.getReadRecord("A.md")?.duration, 1000);
	assert.equal(manager.getReadRecord("B.md")?.openCount, 1);
});
