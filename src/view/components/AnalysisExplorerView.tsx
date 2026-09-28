import * as React from "react";
import StudyTimeStatisticsPlugin from "../../main";
import {filterSessions, percentChange, previousPeriod, SessionFilter, summarizeSessions} from "../../util/analysisFilters";
import {TimeUtils} from "../../util/timeUtils";
import I18n from "../../language/i18n";

function dateInput(timestamp: number): string {
	const date = new Date(timestamp);
	const offset = date.getTimezoneOffset() * 60_000;
	return new Date(timestamp - offset).toISOString().slice(0, 10);
}

function inputTimestamp(value: string, end = false): number {
	const timestamp = new Date(`${value}T00:00:00`).getTime();
	return timestamp + (end ? 86_400_000 : 0);
}

export function AnalysisExplorerView({plugin, onSelect}: {plugin: StudyTimeStatisticsPlugin; onSelect: (filePath: string) => void}) {
	const text = (english: string, chinese: string) => I18n.local(english, chinese);
	const now = Date.now();
	const [start, setStart] = React.useState(dateInput(now - 29 * 86_400_000));
	const [end, setEnd] = React.useState(dateInput(now));
	const [query, setQuery] = React.useState("");
	const [pathPrefix, setPathPrefix] = React.useState("");
	const filter: SessionFilter = {startAt: inputTimestamp(start), endAt: inputTimestamp(end, true), query, pathPrefix};
	const all = plugin.dataManager.getSessions();
	const current = filterSessions(all, filter);
	const previous = filterSessions(all, previousPeriod(filter));
	const summary = summarizeSessions(current);
	const previousSummary = summarizeSessions(previous);
	const change = percentChange(summary.duration, previousSummary.duration);
	const folderOptions = [...new Set(plugin.app.vault.getMarkdownFiles().map(file => file.parent?.path ?? "").filter(Boolean))].sort();

	return <div className="analysis-explorer">
		<h2>{text("Filter and compare", "筛选对比")}</h2>
		<p className="setting-item-description">{text("Filter locally, compare the previous period, and open the underlying sessions.", "本地筛选、对比上一周期，并查看原始会话。")}</p>
		<div className="analysis-filter-grid">
			<label>{text("From", "开始")}<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
			<label>{text("To", "结束")}<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
			<label>{text("Folder", "文件夹")}<select value={pathPrefix} onChange={event => setPathPrefix(event.target.value)}><option value="">{text("All", "全部")}</option>{folderOptions.map(path => <option key={path} value={`${path}/`}>{path}</option>)}</select></label>
			<label>{text("Search", "搜索")}<input value={query} onChange={event => setQuery(event.target.value)} placeholder={text("Note name or path", "笔记名称或路径")} /></label>
		</div>
		<div className="study-metric-grid">
			<div className="study-metric-card"><strong>{TimeUtils.getFormattedReadingTime(summary.duration)}</strong><span>{text("Total time", "总时长")}</span></div>
			<div className="study-metric-card"><strong>{summary.sessions}</strong><span>{text("Sessions", "会话")}</span></div>
			<div className="study-metric-card"><strong>{summary.notes}</strong><span>{text("Notes", "笔记")}</span></div>
			<div className="study-metric-card"><strong>{change === undefined ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</strong><span>{text("Previous period", "较上期")}</span></div>
		</div>
		<div className="study-table-scroll"><table className="study-table"><thead><tr><th>{text("Note", "笔记")}</th><th>{text("Time", "时间")}</th><th>{text("Duration", "时长")}</th></tr></thead><tbody>
			{current.slice(0, 250).map(session => <tr key={session.id}><td><button className="study-note-button" onClick={() => onSelect(session.filePath)}>{session.filePath}</button></td><td>{new Date(session.openedAt).toLocaleString()}</td><td>{TimeUtils.getFormattedReadingTime(session.duration)}</td></tr>)}
		</tbody></table></div>
	</div>;
}
