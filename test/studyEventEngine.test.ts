import test from "node:test";
import assert from "node:assert/strict";
import {buildStudyEventIndex, latestEventsByEntity, mergeStudyEvents, StudyEvent} from "../src/core/studyEventEngine";

const event = (id: string, timestamp: number, deviceId = "a", operation: StudyEvent["operation"] = "upsert"): StudyEvent => ({id, timestamp, deviceId, entity: "session", entityId: "session-1", operation, fileId: "note-1"});

test("event merge is deterministic and removes duplicate event ids", () => {
	const a = event("a", 20);
	const b = event("b", 10, "b");
	assert.deepEqual(mergeStudyEvents([a], [b, a]).map(item => item.id), ["b", "a"]);
	assert.deepEqual(mergeStudyEvents([b, a], [a]).map(item => item.id), ["b", "a"]);
});

test("latest event and indexes retain deterministic tombstones", () => {
	const upsert = event("a", 10);
	const deletion = event("b", 20, "b", "delete");
	assert.equal(latestEventsByEntity([deletion, upsert]).get("session:session-1")?.operation, "delete");
	const index = buildStudyEventIndex([upsert, deletion]);
	assert.equal(index.count, 2);
	assert.equal(index.byFileId.get("note-1")?.length, 2);
});
