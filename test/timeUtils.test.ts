import test from "node:test";
import assert from "node:assert/strict";
import {recentDayAxisLabel} from "../src/util/chartUtils";

test("30-day charts use a readable 1-to-30 relative axis", () => {
	assert.deepEqual(
		Array.from({length: 30}, (_, index) => recentDayAxisLabel(index, 30)).filter(Boolean),
		["1", "5", "10", "15", "20", "25", "30"]
	);
});

test("relative chart axes always include both endpoints", () => {
	assert.equal(recentDayAxisLabel(0, 12), "1");
	assert.equal(recentDayAxisLabel(11, 12), "12");
	assert.equal(recentDayAxisLabel(1, 12), "");
});
