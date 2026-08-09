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
