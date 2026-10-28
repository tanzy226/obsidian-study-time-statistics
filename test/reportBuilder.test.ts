import test from "node:test";
import assert from "node:assert/strict";
import {buildStudyReport, reportDateRange, reportToCsv, reportToMarkdown} from "../src/util/reportBuilder";
import type {StudySession} from "../src/interface/studySession";

const session = (id: string, filePath: string, openedAt: number, duration: number): StudySession => ({id, fileId: id, filePath, openedAt, closedAt: openedAt + duration, duration, source: "automatic", createdAt: openedAt, updatedAt: openedAt + duration});

test("anonymous reports contain no source note paths", () => {
	const report = buildStudyReport([session("1", "Private/Example.md", 10, 100)], {startAt: 0, endAt: 200, anonymize: true}, 300);
	const outputs = [JSON.stringify(report), reportToCsv(report), reportToMarkdown(report)].join("\n");
	assert.equal(outputs.includes("Private/Example.md"), false);
	assert.equal(report.rows[0]?.note, "Note 001");
});

test("identified reports aggregate sessions by note", () => {
	const report = buildStudyReport([session("1", "Example.md", 10, 100), session("2", "Example.md", 20, 200)], {startAt: 0, endAt: 500, anonymize: false}, 600);
	assert.deepEqual(report.rows[0], {note: "Example.md", duration: 300, sessions: 2, averageDuration: 150});
});

test("identified CSV reports neutralize spreadsheet formulas", () => {
	const report = buildStudyReport([session("1", "=HYPERLINK(\"https://example.invalid\")", 10, 100)], {startAt: 0, endAt: 200, anonymize: false}, 300);
	assert.match(reportToCsv(report), /\n"'=HYPERLINK/u);
});

test("report dates reject empty, impossible, and reversed ranges", () => {
	assert.equal(reportDateRange("", "2026-10-28"), undefined);
	assert.equal(reportDateRange("2026-02-30", "2026-10-28"), undefined);
	assert.equal(reportDateRange("2026-10-29", "2026-10-28"), undefined);
	assert.deepEqual(reportDateRange("2026-10-28", "2026-10-28"), {
		startAt: new Date(2026, 9, 28).getTime(),
		endAt: new Date(2026, 9, 29).getTime()
	});
});

test("Markdown report follows the selected language", () => {
	const report = buildStudyReport([session("1", "Example.md", 10, 100)], {startAt: 0, endAt: 200, anonymize: true}, 300);
	assert.match(reportToMarkdown(report, "zh"), /^# 学习时间统计报告/u);
	assert.match(reportToMarkdown(report, "en"), /^# Study Time Statistics report/u);
});
