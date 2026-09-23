import test from "node:test";
import assert from "node:assert/strict";
import {buildStudyCockpitSummary} from "../src/util/studyCockpitUtils";
import {StudySession} from "../src/interface/studySession";

function session(id: string, openedAt: number, duration: number, engagement: StudySession["engagement"]): StudySession {
	return {id, fileId: id, filePath: `${id}.md`, openedAt, closedAt: openedAt + duration, duration, source: "automatic", createdAt: openedAt, updatedAt: openedAt, engagement};
}

test("study cockpit calculates comparison, quality, timing, and revisit queue", () => {
	const now = new Date(2026, 7, 20, 12);
	const result = buildStudyCockpitSummary([
		session("today", new Date(2026, 7, 20, 9).getTime(), 10 * 60_000, "interactive"),
		session("week", new Date(2026, 7, 18, 9).getTime(), 20 * 60_000, "uncertain"),
		session("previous", new Date(2026, 7, 12, 8).getTime(), 15 * 60_000, "quiet-study")
	], [{fileId: "old", filePath: "Old.md", duration: 1000, openCount: 1, lastOpenedAt: new Date(2026, 7, 1).getTime()}], [], now);
	assert.equal(result.todayDuration, 10 * 60_000);
	assert.equal(result.thisWeekDuration, 30 * 60_000);
	assert.equal(result.previousWeekDuration, 15 * 60_000);
	assert.equal(result.weekChange, 1);
	assert.equal(result.bestHour, 9);
	assert.equal(result.needsReviewCount, 1);
	assert.equal(result.revisitNotes[0]?.filePath, "Old.md");
});
