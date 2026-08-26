import test from "node:test";
import assert from "node:assert/strict";
import {FEEDBACK_LINKS} from "../src/util/feedbackLinks";

test("feedback links stay on the public project repository", () => {
	for (const link of Object.values(FEEDBACK_LINKS)) {
		const url = new URL(link);
		assert.equal(url.protocol, "https:");
		assert.equal(url.hostname, "github.com");
		assert.equal(url.pathname.startsWith("/tanzy226/obsidian-study-time-statistics/"), true);
	}
});

test("structured feedback buttons open the intended issue forms", () => {
	assert.equal(new URL(FEEDBACK_LINKS.bug).searchParams.get("template"), "bug_report.yml");
	assert.equal(new URL(FEEDBACK_LINKS.accuracy).searchParams.get("template"), "data_accuracy.yml");
	assert.equal(new URL(FEEDBACK_LINKS.feature).searchParams.get("template"), "feature_request.yml");
});
