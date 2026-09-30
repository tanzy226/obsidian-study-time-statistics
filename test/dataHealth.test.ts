import test from "node:test";
import assert from "node:assert/strict";
import {inspectDataHealth, repairSessions} from "../src/util/dataHealth";
import type {StudySession} from "../src/interface/studySession";

const session = (id: string, patch: Partial<StudySession> = {}): StudySession => ({
	id, fileId: "f", filePath: "Notes/example.md", openedAt: 10, closedAt: 20,
	duration: 10, source: "automatic", createdAt: 10, updatedAt: 20, ...patch
});

test("data health finds duplicates, invalid sessions and missing notes", () => {
	const report = inspectDataHealth({}, [session("a"), session("a"), session("b", {duration: -1})], [], new Set(), 1);
	assert.equal(report.issues.filter(issue => issue.kind === "duplicate-session").length, 1);
	assert.equal(report.issues.filter(issue => issue.kind === "invalid-session").length, 1);
	assert.equal(report.issues.filter(issue => issue.kind === "missing-note").length, 3);
});

test("safe repair keeps the newest valid session for each id", () => {
	const repaired = repairSessions([session("a"), session("a", {updatedAt: 30}), session("b", {duration: -1})]);
	assert.equal(repaired.length, 1);
	assert.equal(repaired[0]?.updatedAt, 30);
});
