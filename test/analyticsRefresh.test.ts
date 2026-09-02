import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {App, Plugin} from "obsidian";
import {PluginDataManager} from "../src/core/pluginDataManager";
import {StudyAnalyticsService} from "../src/core/studyAnalyticsService";

class FakePluginDataStore {
	public loadCount = 0;

	constructor(private storedData: unknown) {}

	async loadData(): Promise<unknown> {
		this.loadCount += 1;
		return this.storedData;
	}

	async saveData(data: unknown): Promise<void> {
		this.storedData = data;
	}
}

test("extended analytics cache is reused until study data changes", async () => {
	const store = new FakePluginDataStore({
		readData: {"Note.md": {fileId: "note", filePath: "Note.md", duration: 1000, openCount: 1}},
		dailyData: {"2026-9-3": {dailyReadData: {note: {fileId: "note", filePath: "", duration: 1000, openCount: 0}}, sessions: []}},
		settings: {}
	});
	const manager = new PluginDataManager(store as unknown as Plugin);
	await manager.loadData();
	const app = {vault: {getFileByPath: (path: string) => path === "Note.md" ? {} : null}} as unknown as App;
	const service = new StudyAnalyticsService(app, manager);

	const loadsBeforeFirstAnalysis = store.loadCount;
	const first = await service.analyze();
	const loadsAfterFirstAnalysis = store.loadCount;
	assert.equal(loadsAfterFirstAnalysis, loadsBeforeFirstAnalysis + 1);
	const cached = await service.analyze();
	assert.strictEqual(cached, first);
	assert.equal(store.loadCount, loadsAfterFirstAnalysis);

	await manager.setReadRecord("Note.md", {fileId: "note", filePath: "Note.md", duration: 2000, openCount: 1});
	const afterChange = await service.analyze();
	assert.notStrictEqual(afterChange, first);
	assert.equal(afterChange.summary.totalTime, 2000);

	const forced = await service.analyze(true);
	assert.notStrictEqual(forced, afterChange);
});

test("closed analytics views have no periodic full-history refresh", () => {
	const root = new URL("../", import.meta.url);
	const noteBar = readFileSync(new URL("src/view/display/noteStatsBar/noteStatsBarManager.ts", root), "utf8");
	const analyticsView = readFileSync(new URL("src/view/components/StudyAnalyticsView.tsx", root), "utf8");
	assert.doesNotMatch(noteBar, /setInterval\([^\n]*refreshExtendedStats/);
	assert.doesNotMatch(analyticsView, /setInterval/);
	assert.match(analyticsView, /onDidChange/);
	assert.match(analyticsView, /refreshAnalytics/);
});
