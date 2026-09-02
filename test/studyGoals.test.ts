import test from "node:test";
import assert from "node:assert/strict";
import {buildStudyGoalSummary} from "../src/util/studyGoalUtils";
import {StudySession} from "../src/interface/studySession";

function session(id: string, openedAt: number, duration: number, engagement: StudySession["engagement"] = "interactive"): StudySession {
	return {id, fileId: id, filePath: `${id}.md`, openedAt, closedAt: openedAt + duration, duration, source: "automatic", createdAt: openedAt, updatedAt: openedAt, engagement};
}

test("study goals summarize daily, weekly, streak, and review queue", () => {
	const now = new Date(2026, 7, 20, 12);
	const today = new Date(2026, 7, 20, 9).getTime();
	const yesterday = new Date(2026, 7, 19, 9).getTime();
	const result = buildStudyGoalSummary([
		session("a", today, 40 * 60_000, "uncertain"),
		session("b", yesterday, 35 * 60_000)
	], {dailyMinutes: 30, weeklyMinutes: 120}, now);
	assert.equal(result.todayDuration, 40 * 60_000);
	assert.equal(result.weekDuration, 75 * 60_000);
	assert.equal(result.reachedDays, 2);
	assert.equal(result.currentGoalStreak, 2);
	assert.equal(result.uncertainSessions.length, 1);
});

test("zero goals are valid and never report false completion", () => {
	const result = buildStudyGoalSummary([], {dailyMinutes: 0, weeklyMinutes: 0}, new Date(2026, 7, 20));
	assert.equal(result.todayRatio, 0);
	assert.equal(result.weekRatio, 0);
	assert.equal(result.reachedDays, 0);
});
