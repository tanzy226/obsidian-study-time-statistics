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

export function reportToMarkdown(report: StudyReport): string {
	const minutes = (milliseconds: number) => (milliseconds / 60_000).toFixed(1);
	return [
		"# Study Time Statistics report",
		"",
		`- Period: ${new Date(report.period.startAt).toLocaleDateString()} – ${new Date(report.period.endAt - 1).toLocaleDateString()}`,
		`- Total: ${minutes(report.summary.duration)} minutes`,
		`- Sessions: ${report.summary.sessions}`,
		`- Notes: ${report.summary.notes}`,
		`- Anonymized: ${report.anonymized ? "yes" : "no"}`,
		"",
		"| Note | Minutes | Sessions | Average minutes |",
		"| --- | ---: | ---: | ---: |",
		...report.rows.map(row => `| ${row.note.replaceAll("|", "\\|")} | ${minutes(row.duration)} | ${row.sessions} | ${minutes(row.averageDuration)} |`)
	].join("\n");
}
