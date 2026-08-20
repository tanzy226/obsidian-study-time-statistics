import test from "node:test";
import assert from "node:assert/strict";
import {createLegacySessionId, parseDurationInput} from "../src/util/sessionUtils";

test("legacy session ids are deterministic and distinguish sessions", () => {
	const base = {fileId: "a", filePath: "A.md", openedAt: 10, closedAt: 20, duration: 8};
	assert.equal(createLegacySessionId(base), createLegacySessionId(base));
	assert.notEqual(createLegacySessionId(base), createLegacySessionId({...base, openedAt: 11}));
});

test("duration input supports minutes, mm:ss, and hh:mm:ss", () => {
	assert.equal(parseDurationInput("25.5"), 1_530_000);
	assert.equal(parseDurationInput("05:30"), 330_000);
	assert.equal(parseDurationInput("01:02:03"), 3_723_000);
	assert.equal(parseDurationInput("01:60"), undefined);
	assert.equal(parseDurationInput("-1"), undefined);
	assert.equal(parseDurationInput(""), undefined);
});
