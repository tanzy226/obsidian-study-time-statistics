import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {attentionScore, buildAttentionNodes, buildStudyPath} from "../src/util/attentionMap";
import type {ReadRecord} from "../src/interface/readRecord";
import type {StudySession} from "../src/interface/studySession";

const record = (filePath: string, duration: number): ReadRecord => ({fileId: filePath, filePath, duration, openCount: 2, lastOpenedAt: 100});
const session = (id: string, filePath: string, openedAt: number): StudySession => ({id, fileId: id, filePath, openedAt, closedAt: openedAt + 1, duration: 1, source: "automatic", createdAt: openedAt, updatedAt: openedAt + 1});

test("attention nodes aggregate generic folder hierarchy", () => {
	const nodes = buildAttentionNodes({"Alpha/One.md": record("Alpha/One.md", 10), "Alpha/Two.md": record("Alpha/Two.md", 20), "Beta.md": record("Beta.md", 5)}, []);
	assert.deepEqual(nodes.find(node => node.path === "Alpha"), {path: "Alpha", label: "Alpha", duration: 30, opens: 4, coverage: 0, lastOpenedAt: 100, noteCount: 2});
	assert.equal(attentionScore(nodes[0]!, "opens"), nodes[0]!.opens);
});

test("attention nodes include unvisited vault notes", () => {
	const nodes = buildAttentionNodes({}, [], "", ["Folder/Unread.md", "Read.md"]);
	assert.equal(nodes.find(node => node.path === "Folder")?.noteCount, 1);
	assert.equal(nodes.find(node => node.path === "Folder")?.duration, 0);
	assert.equal(nodes.find(node => node.path === "Read.md")?.opens, 0);
});

test("attention coverage combines repeated reading entries", () => {
	const nodes = buildAttentionNodes(
		{"Study.md": record("Study.md", 10)},
		[
			{id: "1", fileId: "Study.md", filePath: "Study.md", percent: 10, recordedAt: 1, createdAt: 1, updatedAt: 1},
			{id: "2", fileId: "Study.md", filePath: "Study.md", percent: 25, recordedAt: 2, createdAt: 2, updatedAt: 2},
		]
	);
	assert.equal(nodes.find(node => node.path === "Study.md")?.coverage, 35);
});

test("study paths count repeated transitions", () => {
	const edges = buildStudyPath([session("1", "A.md", 1), session("2", "B.md", 2), session("3", "A.md", 3), session("4", "B.md", 4)]);
	assert.equal(edges.find(edge => edge.from === "A.md" && edge.to === "B.md")?.count, 2);
});

test("investment cards use wrapping metric cells without intensity styling", () => {
	const root = new URL("../", import.meta.url);
	const component = readFileSync(new URL("src/view/components/AttentionMapView.tsx", root), "utf8");
	const styles = readFileSync(new URL("styles.css", root), "utf8");
	assert.match(component, /attention-node-metrics/);
	assert.match(component, /attention-node-metric/);
	assert.doesNotMatch(component, /--attention-weight/);
	assert.match(styles, /\.attention-node-title[\s\S]*overflow-wrap: anywhere/);
	assert.match(styles, /\.attention-node-metrics[\s\S]*minmax\(64px, 1fr\)/);
});
