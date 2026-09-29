import test from "node:test";
import assert from "node:assert/strict";
import {adaptiveLevel, linearHeight} from "../src/util/visualScale";

test("adaptive levels preserve contrast when one day is much larger", () => {
	const values = [10, 20, 30, 40, 10_000];
	assert.equal(adaptiveLevel(values, 0), 0);
	assert.equal(adaptiveLevel(values, 10), 1);
	assert.equal(adaptiveLevel(values, 30), 3);
	assert.equal(adaptiveLevel(values, 10_000), 5);
});

test("linear heights keep zero days empty and small positive values visible", () => {
	assert.equal(linearHeight([0, 10, 100], 0), 0);
	assert.equal(linearHeight([0, 10, 100], 10), 10);
	assert.equal(linearHeight([0, 1, 100], 1), 4);
	assert.equal(linearHeight([0, 10, 100], 100), 100);
});
