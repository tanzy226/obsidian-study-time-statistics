import test from "node:test";
import assert from "node:assert/strict";
import {compactDateLabel} from "../src/util/chartUtils";

test("compact chart dates retain both month and day without leading zero noise", () => {
	assert.equal(compactDateLabel("2026-08-20"), "8/20");
	assert.equal(compactDateLabel("2026-09-01"), "9/1");
});

test("compact chart date formatter keeps an invalid label unchanged", () => {
	assert.equal(compactDateLabel("unknown"), "unknown");
});
