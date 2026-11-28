import test from "node:test";
import assert from "node:assert/strict";
import {MAX_STUDY_DURATION_MS} from "../src/util/sessionUtils";
import {splitDurationByLocalDay, splitSessionByLocalHour} from "../src/util/timeBuckets";

test("day and hour buckets reject unsafe input without returning partial data", () => {
	const openedAt = new Date(2026, 0, 15, 12).getTime();
	for (const [start, duration] of [
		[openedAt, Infinity], [openedAt, NaN], [openedAt, -1], [openedAt, 0.5], [openedAt, MAX_STUDY_DURATION_MS + 1],
		[Infinity, 1000], [NaN, 1000], [-1, 1000], [Date.UTC(9999, 11, 31, 23, 59), 60_000]
	] as const) {
		assert.deepEqual(splitDurationByLocalDay(start, duration), []);
		assert.deepEqual(splitSessionByLocalHour(start, duration), []);
	}
});

test("midnight splitting preserves legacy day keys and all elapsed milliseconds", () => {
	const openedAt = new Date(2026, 0, 15, 23, 59, 30).getTime();
	assert.deepEqual(splitDurationByLocalDay(openedAt, 120_001), [
		{key: "2026-1-15", duration: 30_000}, {key: "2026-1-16", duration: 90_001}
	]);
	assert.deepEqual(splitSessionByLocalHour(openedAt, 120_001), [
		{hour: 23, weekday: 4, duration: 30_000}, {hour: 0, weekday: 5, duration: 90_001}
	]);
});

test("local day and hour splits conserve time through both DST transitions", () => {
	const originalTZ = process.env.TZ;
	process.env.TZ = "America/New_York";
	try {
		const springStart = new Date(2026, 2, 8, 0).getTime();
		const fallStart = new Date(2026, 10, 1, 0).getTime();
		const hour = 3_600_000;
		const springHours = splitSessionByLocalHour(springStart, 23 * hour);
		const fallHours = splitSessionByLocalHour(fallStart, 25 * hour);
		assert.deepEqual(splitDurationByLocalDay(springStart, 24 * hour), [
			{key: "2026-3-8", duration: 23 * hour}, {key: "2026-3-9", duration: hour}
		]);
		assert.deepEqual(splitDurationByLocalDay(fallStart, 26 * hour), [
			{key: "2026-11-1", duration: 25 * hour}, {key: "2026-11-2", duration: hour}
		]);
		assert.equal(springHours.reduce((sum, item) => sum + item.duration, 0), 23 * hour);
		assert.equal(springHours.some(item => item.hour === 2), false);
		assert.equal(fallHours.reduce((sum, item) => sum + item.duration, 0), 25 * hour);
		assert.equal(fallHours.filter(item => item.hour === 1).reduce((sum, item) => sum + item.duration, 0), 2 * hour);
		assert.equal(splitSessionByLocalHour(fallStart, MAX_STUDY_DURATION_MS).reduce((sum, item) => sum + item.duration, 0), MAX_STUDY_DURATION_MS);
	} finally {
		if (originalTZ === undefined) delete process.env.TZ;
		else process.env.TZ = originalTZ;
	}
});
