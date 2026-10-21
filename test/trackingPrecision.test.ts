import test from "node:test";
import assert from "node:assert/strict";
import {isIdle, normalizeTrackingPrecision, shouldKeepSession} from "../src/util/trackingPrecision";
import type {StudySession} from "../src/interface/studySession";

const session = (duration: number, source: StudySession["source"] = "automatic"): StudySession => ({id: "s", fileId: "f", filePath: "Example.md", openedAt: 0, closedAt: duration, duration, source, createdAt: 0, updatedAt: duration});

test("tracking precision settings are clamped to safe ranges", () => {
	assert.deepEqual(normalizeTrackingPrecision({idleTimeoutMinutes: 999, minimumSessionSeconds: -2}), {idleTimeoutMinutes: 120, minimumSessionSeconds: 0});
});

test("idle detection and minimum session rules preserve quiet study", () => {
	assert.equal(isIdle(0, 19 * 60_000, 20), false);
	assert.equal(isIdle(0, 20 * 60_000, 20), true);
	assert.equal(isIdle(0, 24 * 60 * 60_000, 0), false);
	assert.equal(shouldKeepSession(session(4_999), 5), false);
	assert.equal(shouldKeepSession(session(1, "manual"), 5), true);
});
