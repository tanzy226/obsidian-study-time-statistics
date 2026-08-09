import test from "node:test";
import * as assert from "node:assert/strict";
import {buildStudyAnalytics, calculateStreaks} from "../src/core/studyAnalytics";
import {ReadRecord} from "../src/interface/readRecord";
import {StudySession} from "../src/interface/studySession";

function at(year: number, month: number, day: number, hour = 10) {
	return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

test("calculateStreaks handles current and longest consecutive runs", () => {
	const result = calculateStreaks(
		["2026-08-01", "2026-08-02", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"],
		new Date(2026, 7, 10, 12)
	);
	assert.deepEqual(result, {current: 6, longest: 6});
});

test("calculateStreaks keeps a streak active through yesterday", () => {
	const result = calculateStreaks(["2026-08-07", "2026-08-08", "2026-08-09"], new Date(2026, 7, 10, 12));
	assert.deepEqual(result, {current: 3, longest: 3});
});

test("calculateStreaks resets a stale current streak", () => {
	const result = calculateStreaks(["2026-08-01", "2026-08-02"], new Date(2026, 7, 10, 12));
	assert.deepEqual(result, {current: 0, longest: 2});
});

test("buildStudyAnalytics calculates summaries, rankings and distributions", () => {
	const records: ReadRecord[] = [
		{fileId: "a", filePath: "课程/A.md", duration: 4000, openCount: 4, lastOpenedAt: at(2026, 8, 10, 9)},
		{fileId: "b", filePath: "论文/B.md", duration: 6000, openCount: 2, lastOpenedAt: at(2026, 8, 10, 18)}
	];
	const sessions: StudySession[] = [
		{fileId: "a", filePath: "课程/A.md", openedAt: at(2026, 8, 9, 9), closedAt: at(2026, 8, 9, 9), duration: 1000},
		{fileId: "a", filePath: "课程/A.md", openedAt: at(2026, 8, 10, 9), closedAt: at(2026, 8, 10, 9), duration: 3000},
		{fileId: "b", filePath: "论文/B.md", openedAt: at(2026, 8, 10, 18), closedAt: at(2026, 8, 10, 18), duration: 5000}
	];
	const daily = [
		{date: "2026-8-9", totalTime: 1000, sessionCount: 1, noteCount: 1},
		{date: "2026-8-10", totalTime: 9000, sessionCount: 2, noteCount: 2}
	];
	const result = buildStudyAnalytics(records, daily, sessions, new Date(2026, 7, 10, 20));

	assert.equal(result.summary.noteCount, 2);
	assert.equal(result.summary.openCount, 6);
	assert.equal(result.summary.totalTime, 10000);
	assert.equal(result.summary.averageTime, 10000 / 6);
	assert.equal(result.summary.todayTime, 9000);
	assert.equal(result.summary.todaySessions, 2);
	assert.equal(result.summary.currentStreak, 2);
	assert.equal(result.rankings.byOpenCount[0].filePath, "课程/A.md");
	assert.equal(result.rankings.byTotalTime[0].filePath, "论文/B.md");
	assert.equal(result.rankings.byAverageTime[0].filePath, "论文/B.md");
	assert.equal(result.rankings.byLongestSession[0].longestSession, 5000);
	assert.equal(result.rankings.byActiveDays[0].activeDays, 2);
	assert.equal(result.hourly[9].count, 2);
	assert.equal(result.hourly[18].duration, 5000);
	assert.equal(result.sessionBuckets[0].count, 3);
	assert.equal(result.folders[0].noteCount, 1);
	assert.equal(result.recentSessions[0].filePath, "论文/B.md");
});

test("buildStudyAnalytics handles an empty vault", () => {
	const result = buildStudyAnalytics([], [], [], new Date(2026, 7, 10));
	assert.equal(result.summary.noteCount, 0);
	assert.equal(result.summary.totalTime, 0);
	assert.equal(result.summary.currentStreak, 0);
	assert.equal(result.hourly.length, 24);
	assert.equal(result.weekdays.length, 7);
	assert.equal(result.sessionBuckets.length, 6);
});
