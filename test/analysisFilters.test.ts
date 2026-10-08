import test from "node:test";
import assert from "node:assert/strict";
import {filterSessions, percentChange, previousPeriod, summarizeSessions} from "../src/util/analysisFilters";
import type {StudySession} from "../src/interface/studySession";

const make = (id: string, filePath: string, openedAt: number, duration: number): StudySession => ({
	id, fileId: id, filePath, openedAt, closedAt: openedAt + duration, duration,
	source: "automatic", createdAt: openedAt, updatedAt: openedAt + duration
});

test("analysis filters combine date, folder and search", () => {
	const sessions = [make("1", "Alpha/One.md", 100, 10), make("2", "Beta/Two.md", 150, 20), make("3", "Alpha/Other.md", 300, 30)];
	const result = filterSessions(sessions, {startAt: 0, endAt: 200, pathPrefix: "Alpha/", query: "one"});
	assert.deepEqual(result.map(item => item.id), ["1"]);
});

test("analysis summary and previous period are deterministic", () => {
	assert.deepEqual(summarizeSessions([make("1", "A.md", 10, 20), make("2", "A.md", 40, 40)]), {duration: 60, sessions: 2, notes: 1, averageDuration: 30});
	assert.deepEqual(previousPeriod({startAt: 100, endAt: 200}), {startAt: 0, endAt: 100});
	assert.equal(percentChange(150, 100), 50);
	assert.equal(percentChange(1, 0), undefined);
});
