import test from "node:test";
import assert from "node:assert/strict";
import {classifySessionEngagement} from "../src/util/activityClassifier";
import {clampPercent, countReadableCharacters, summarizeNoteProgress, summarizeReadingIntake} from "../src/util/readingProgressUtils";
import {ReadingProgressEntry} from "../src/interface/readingProgress";

function entry(overrides: Partial<ReadingProgressEntry>): ReadingProgressEntry {
	return {
		id: "progress-1",
		fileId: "note-1",
		filePath: "Notes/A.md",
		percent: 10,
		recordedAt: 100,
		characterCount: 1_000,
		activeDuration: 60_000,
		readCharacters: Number.NaN,
		measurement: "estimated",
		createdAt: 100,
		updatedAt: 100,
		...overrides
	};
}

test("reading coverage is capped without claiming mastery", () => {
	const summaries = summarizeNoteProgress([
		entry({percent: 60}),
		entry({id: "progress-2", percent: 55, activeDuration: 120_000})
	]);
	assert.equal(summaries[0]?.coverage, 100);
	assert.equal(summaries[0]?.entryCount, 2);
	assert.equal(Math.round(summaries[0]?.estimatedCoveredCharacters ?? 0), 1_150);
	assert.equal(Math.round(summaries[0]?.charactersPerMinute ?? 0), 383);
	assert.equal(clampPercent(-1), 0);
	assert.equal(clampPercent(101), 100);
});

test("reading intake separates actual volume, unique reach, repetition, and current position", () => {
	const entries = [
		entry({id: "a", percent: 60, readCharacters: 600, measurement: "manual", startPosition: 0, endPosition: 60}),
		entry({id: "b", percent: 60, readCharacters: 700, measurement: "manual", startPosition: 40, endPosition: 100, recordedAt: 200})
	];
	const summary = summarizeReadingIntake(entries);
	const note = summarizeNoteProgress(entries)[0];
	assert.equal(summary.totalCharacters, 1_300);
	assert.equal(summary.uniqueCharacters, 1_000);
	assert.equal(summary.repeatedCharacters, 300);
	assert.equal(summary.equivalentPasses, 1.3);
	assert.equal(summary.manualEntryCount, 2);
	assert.equal(summary.notesAtEnd, 1);
	assert.equal(note?.currentPosition, 100);
});

test("readable character count ignores common Markdown markup", () => {
	assert.equal(countReadableCharacters("---\ntitle: X\n---\n# 标题\n[链接](https://example.com) **正文**"), 6);
});

test("activity signals preserve quiet study and flag only ambiguous long sessions", () => {
	assert.equal(classifySessionEngagement({duration: 600_000, interactionCount: 0}), "uncertain");
	assert.equal(classifySessionEngagement({duration: 600_000, interactionCount: 2, firstInteractionAt: 1, lastInteractionAt: 120_001}), "quiet-study");
	assert.equal(classifySessionEngagement({duration: 60_000, interactionCount: 4}), "interactive");
	assert.equal(classifySessionEngagement({duration: 30_000, interactionCount: 0}), "unclassified");
});
