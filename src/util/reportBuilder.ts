import type {StudySession} from "../interface/studySession";
import {filterSessions, SessionFilter, summarizeSessions} from "./analysisFilters";

export interface StudyReportOptions {
	startAt: number;
	endAt: number;
	anonymize: boolean;
}

export interface StudyReportRow {
	note: string;
	duration: number;
	sessions: number;
	averageDuration: number;
}

export interface StudyReport {
	format: "study-time-statistics-report";
	version: 1;
	createdAt: number;
	period: {startAt: number; endAt: number};
	anonymized: boolean;
	summary: ReturnType<typeof summarizeSessions>;
	rows: StudyReportRow[];
}

function localMidnight(value: string): Date | undefined {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
	if (!match) return undefined;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export function reportDateRange(start: string, end: string): {startAt: number; endAt: number} | undefined {
	const first = localMidnight(start);
	const last = localMidnight(end);
	if (!first || !last || first > last) return undefined;
	last.setDate(last.getDate() + 1);
	return {startAt: first.getTime(), endAt: last.getTime()};
}

function aliases(paths: string[]): Map<string, string> {
	return new Map([...new Set(paths)].sort().map((path, index) => [path, `Note ${String(index + 1).padStart(3, "0")}`]));
}

export function buildStudyReport(sessions: StudySession[], options: StudyReportOptions, createdAt = Date.now()): StudyReport {
	const filter: SessionFilter = {startAt: options.startAt, endAt: options.endAt};
	const selected = filterSessions(sessions, filter);
	const names = aliases(selected.map(session => session.filePath));
	const grouped = new Map<string, StudySession[]>();
	for (const session of selected) {
		const list = grouped.get(session.filePath) ?? [];
		list.push(session);
		grouped.set(session.filePath, list);
	}
	const rows = [...grouped.entries()].map(([path, items]) => {
		const summary = summarizeSessions(items);
		return {note: options.anonymize ? names.get(path) ?? "Note" : path, duration: summary.duration, sessions: summary.sessions, averageDuration: summary.averageDuration};
	}).sort((a, b) => b.duration - a.duration);
	return {format: "study-time-statistics-report", version: 1, createdAt, period: {startAt: options.startAt, endAt: options.endAt}, anonymized: options.anonymize, summary: summarizeSessions(selected), rows};
}

function csvCell(value: string | number): string {
	const raw = String(value);
	const text = typeof value === "string" && /^[\t\r ]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
	return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reportToCsv(report: StudyReport): string {
	return ["note,duration_ms,sessions,average_duration_ms", ...report.rows.map(row => [row.note, row.duration, row.sessions, Math.round(row.averageDuration)].map(csvCell).join(","))].join("\n");
}

export function reportToMarkdown(report: StudyReport, language: "en" | "zh" = "en"): string {
	const minutes = (milliseconds: number) => (milliseconds / 60_000).toFixed(1);
	const zh = language === "zh";
	return [
		zh ? "# 学习时间统计报告" : "# Study Time Statistics report",
		"",
		`- ${zh ? "时段" : "Period"}: ${new Date(report.period.startAt).toLocaleDateString()} – ${new Date(report.period.endAt - 1).toLocaleDateString()}`,
		`- ${zh ? "总时长" : "Total"}: ${minutes(report.summary.duration)} ${zh ? "分钟" : "minutes"}`,
		`- ${zh ? "会话" : "Sessions"}: ${report.summary.sessions}`,
		`- ${zh ? "笔记" : "Notes"}: ${report.summary.notes}`,
		`- ${zh ? "已匿名" : "Anonymized"}: ${report.anonymized ? (zh ? "是" : "yes") : (zh ? "否" : "no")}`,
		"",
		zh ? "| 笔记 | 分钟 | 会话 | 平均分钟 |" : "| Note | Minutes | Sessions | Average minutes |",
		"| --- | ---: | ---: | ---: |",
		...report.rows.map(row => `| ${row.note.replaceAll("|", "\\|").replaceAll(/\r?\n/gu, " ")} | ${minutes(row.duration)} | ${row.sessions} | ${minutes(row.averageDuration)} |`)
	].join("\n");
}
