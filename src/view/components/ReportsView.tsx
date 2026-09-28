import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {buildStudyReport, reportToCsv, reportToMarkdown} from "../../util/reportBuilder";
import I18n from "../../language/i18n";

function dateValue(timestamp: number): string {
	const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
	return date.toISOString().slice(0, 10);
}

function downloadHref(text: string, mime: string): string {
	return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
}

export function ReportsView({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	const text = (english: string, chinese: string) => I18n.local(english, chinese);
	const now = Date.now();
	const [start, setStart] = React.useState(dateValue(now - 29 * 86_400_000));
	const [end, setEnd] = React.useState(dateValue(now));
	const [anonymize, setAnonymize] = React.useState(true);
	const startAt = new Date(`${start}T00:00:00`).getTime();
	const endAt = new Date(`${end}T00:00:00`).getTime() + 86_400_000;
	const report = buildStudyReport(plugin.dataManager.getSessions(), {startAt, endAt, anonymize});
	const json = JSON.stringify(report, null, 2);
	const csv = reportToCsv(report);
	const markdown = reportToMarkdown(report);
	const copy = async () => { await navigator.clipboard.writeText(markdown); new Notice(text("Report copied", "报告已复制")); };

	return <div className="reports-view">
		<h2>{text("Reports and export", "报告导出")}</h2>
		<p className="setting-item-description">{text("Reports are generated locally. Note names are hidden by default.", "报告在本地生成，默认隐藏笔记名称。")}</p>
		<div className="analysis-filter-grid">
			<label>{text("From", "开始")}<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
			<label>{text("To", "结束")}<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
			<label className="report-checkbox"><input type="checkbox" checked={anonymize} onChange={event => setAnonymize(event.target.checked)} /> {text("Hide note names", "隐藏笔记名称")}</label>
		</div>
		<div className="data-health-actions">
			<a className="mod-cta" download="study-report.json" href={downloadHref(json, "application/json")}>JSON</a>
			<a download="study-report.csv" href={downloadHref(csv, "text/csv")}>CSV</a>
			<a download="study-report.md" href={downloadHref(markdown, "text/markdown")}>Markdown</a>
			<button onClick={() => { void copy(); }}>{text("Copy", "复制")}</button>
			<button onClick={() => window.print()}>{text("Print / PDF", "打印 / PDF")}</button>
		</div>
		<pre className="report-preview">{markdown}</pre>
	</div>;
}
