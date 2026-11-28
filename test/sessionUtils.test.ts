import test from "node:test";
import assert from "node:assert/strict";
import {createLegacySessionId, isSafeStudyDuration, isSafeStudyInterval, isSafeStudyTimestamp, MAX_STUDY_DURATION_MS, parseDurationInput} from "../src/util/sessionUtils";

test("legacy session ids are deterministic and distinguish sessions", () => {
	const base = {fileId: "a", filePath: "A.md", openedAt: 10, closedAt: 20, duration: 8};
	assert.equal(createLegacySessionId(base), createLegacySessionId(base));
	assert.notEqual(createLegacySessionId(base), createLegacySessionId({...base, openedAt: 11}));
});

test("duration input supports minutes, mm:ss, and hh:mm:ss", () => {
	assert.equal(parseDurationInput("25.5"), 1_530_000);
	assert.equal(parseDurationInput(".5"), 30_000);
	assert.equal(parseDurationInput("05:30"), 330_000);
	assert.equal(parseDurationInput("05:30.5"), 330_500);
	assert.equal(parseDurationInput("01:02:03"), 3_723_000);
	assert.equal(parseDurationInput("01:60"), undefined);
	assert.equal(parseDurationInput("-1"), undefined);
	assert.equal(parseDurationInput(""), undefined);
});

test("duration input rejects ambiguous, non-finite, and oversized values", () => {
	for (const input of ["1e308", "1e100", "1e2", "Infinity", "NaN", "0xff", "1::2", "1:", ":5", "1.5:20", "1:2.5:03", "744:00:01", "9".repeat(1024)]) {
		assert.equal(parseDurationInput(input), undefined, input.slice(0, 40));
	}
	assert.equal(parseDurationInput("744:00:00"), MAX_STUDY_DURATION_MS);
	assert.equal(parseDurationInput("00:00"), 0);
});

test("persisted study interval guards reject numbers outside usable date and duration ranges", () => {
	for (const value of [Infinity, NaN, -1, 0.5, 1e100, "1", undefined]) {
		assert.equal(isSafeStudyTimestamp(value), false);
		assert.equal(isSafeStudyDuration(value), false);
	}
	assert.equal(isSafeStudyDuration(MAX_STUDY_DURATION_MS), true);
	assert.equal(isSafeStudyDuration(MAX_STUDY_DURATION_MS + 1), false);
	assert.equal(isSafeStudyInterval(0, MAX_STUDY_DURATION_MS), true);
	assert.equal(isSafeStudyInterval(Date.UTC(9999, 11, 31, 23, 59), 60_000), false);
});
