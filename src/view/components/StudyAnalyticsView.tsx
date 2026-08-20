import * as React from "react";
import StudyTimeStatisticsPlugin from "../../main";
import {NoteStudyRow, StudyAnalyticsResult} from "../../core/studyAnalytics";
import {TimeUtils} from "../../util/timeUtils";
import I18n from "../../language/i18n";

interface Props {
	plugin: StudyTimeStatisticsPlugin;
	onSelect: (filePath: string) => void;
}

function localDateKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortName(path: string) {
	return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

function formatDateTime(timestamp: number) {
	return new Date(timestamp).toLocaleString(undefined, {
		month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
	});
}

export function StudyAnalyticsView({plugin, onSelect}: Props) {
	const [data, setData] = React.useState<StudyAnalyticsResult | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState("");

	React.useEffect(() => {
		let alive = true;
		const load = async () => {
			try {
				const result = await plugin.studyAnalyticsService.analyze();
				if (alive) setData(result);
			} catch (reason) {
				console.error("Failed to load study analytics", reason);
				if (alive) setError(I18n.t("analyticsLoadError"));
			} finally {
				if (alive) setLoading(false);
			}
		};
		void load();
		const timer = window.setInterval(() => { void load(); }, 15000);
		return () => {
			alive = false;
			window.clearInterval(timer);
		};
	}, [plugin]);

	if (loading) return <div className="stats-loading">{I18n.t("analyticsLoading")}</div>;
	if (error) return <div className="stats-no-data">{error}</div>;
	if (!data) return null;

	const summary = data.summary;
	const dailyMap = new Map(data.daily.map(point => [point.date, point]));
	const last365 = Array.from({length: 365}, (_, offset) => {
		const date = new Date();
		date.setHours(0, 0, 0, 0);
		date.setDate(date.getDate() - (364 - offset));
		const key = localDateKey(date);
		return dailyMap.get(key) || {date: key, totalTime: 0, sessionCount: 0, noteCount: 0};
	});
	const last30 = last365.slice(-30);

	return (
		<div className="study-analytics-view">
			<div className="study-analytics-header">
				<h2>{I18n.t("studyOverview")}</h2>
				<p>{I18n.t("studyOverviewDesc")}</p>
			</div>

			<div className="study-summary-grid">
				<SummaryCard label={I18n.t("todayReading")} value={TimeUtils.getPreciseFormattedReadingTime(summary.todayTime)} />
				<SummaryCard label={I18n.t("todaySessions")} value={I18n.t("times", {count: summary.todaySessions})} />
				<SummaryCard label={I18n.t("cumulativeReading")} value={TimeUtils.getPreciseFormattedReadingTime(summary.totalTime)} />
				<SummaryCard label={I18n.t("totalOpens")} value={I18n.t("times", {count: summary.openCount})} />
				<SummaryCard label={I18n.t("notesStudied")} value={I18n.t("notesCount", {count: summary.noteCount})} />
				<SummaryCard label={I18n.t("averagePerSession")} value={TimeUtils.getPreciseFormattedReadingTime(summary.averageTime)} />
				<SummaryCard label={I18n.t("currentStudyStreak")} value={I18n.t("days", {count: summary.currentStreak})} />
				<SummaryCard label={I18n.t("longestStudyStreak")} value={I18n.t("days", {count: summary.longestStreak})} />
			</div>

			<Section title={I18n.t("yearHeatmap")} subtitle={I18n.t("past365ActiveDays", {count: summary.activeDays})}>
				<Heatmap points={last365} />
			</Section>

			<div className="study-two-column">
				<Section title={I18n.t("last30ReadingTime")} subtitle={I18n.t("reviewTimeEquivalent")}>
					<SimpleBars labelStep={5} items={last30.map(point => ({label: point.date.slice(5), value: point.totalTime, title: `${point.date} · ${TimeUtils.getPreciseFormattedReadingTime(point.totalTime)}`}))} />
				</Section>
				<Section title={I18n.t("last30Sessions")} subtitle={I18n.t("reviewsEquivalent")}>
					<SimpleBars labelStep={5} items={last30.map(point => ({label: point.date.slice(5), value: point.sessionCount, title: `${point.date} · ${I18n.t("times", {count: point.sessionCount})}`}))} />
				</Section>
			</div>

			<div className="study-two-column">
				<Section title={I18n.t("hourlyDistribution")} subtitle={I18n.t("hourlyDistributionDesc")}>
					<SimpleBars labelStep={2} items={data.hourly.map(item => ({label: item.label, value: item.duration, title: `${item.label}:00 · ${I18n.t("times", {count: item.count})} · ${TimeUtils.getPreciseFormattedReadingTime(item.duration)}`}))} />
				</Section>
				<Section title={I18n.t("weekdayDistribution")} subtitle={I18n.t("weekdayDistributionDesc")}>
					<SimpleBars items={data.weekdays.map(item => ({label: I18n.t(item.label), value: item.duration, title: `${I18n.t(item.label)} · ${I18n.t("times", {count: item.count})} · ${TimeUtils.getPreciseFormattedReadingTime(item.duration)}`}))} />
				</Section>
			</div>

			<Section title={I18n.t("sessionLengthDistribution")} subtitle={I18n.t("sessionLengthDistributionDesc")}>
				<SimpleBars items={data.sessionBuckets.map(item => ({label: I18n.t(item.label), value: item.count, title: `${I18n.t(item.label)} · ${I18n.t("times", {count: item.count})}`}))} />
			</Section>

			<div className="study-ranking-grid">
				<RankingCard title={I18n.t("mostOpened")} rows={data.rankings.byOpenCount} value={row => I18n.t("times", {count: row.openCount})} onSelect={onSelect} />
				<RankingCard title={I18n.t("longestTotalReading")} rows={data.rankings.byTotalTime} value={row => TimeUtils.getPreciseFormattedReadingTime(row.totalTime)} onSelect={onSelect} />
				<RankingCard title={I18n.t("longestAverageVisit")} rows={data.rankings.byAverageTime} value={row => TimeUtils.getPreciseFormattedReadingTime(row.averageTime)} onSelect={onSelect} />
				<RankingCard title={I18n.t("longestSingleSession")} rows={data.rankings.byLongestSession} value={row => TimeUtils.getPreciseFormattedReadingTime(row.longestSession)} onSelect={onSelect} />
				<RankingCard title={I18n.t("mostActiveDays")} rows={data.rankings.byActiveDays} value={row => I18n.t("days", {count: row.activeDays})} onSelect={onSelect} />
			</div>

			<div className="study-two-column study-bottom-tables">
				<Section title={I18n.t("folderInvestment")} subtitle={I18n.t("folderInvestmentDesc")}>
					<div className="study-table-scroll"><table className="study-table"><thead><tr><th>{I18n.t("folder")}</th><th>{I18n.t("note")}</th><th>{I18n.t("opens")}</th><th>{I18n.t("duration")}</th></tr></thead><tbody>
						{data.folders.slice(0, 20).map(folder => <tr key={folder.folder}><td>{folder.folder === "__vault_root__" ? I18n.t("vaultRoot") : folder.folder}</td><td>{folder.noteCount}</td><td>{folder.openCount}</td><td>{TimeUtils.getPreciseFormattedReadingTime(folder.totalTime)}</td></tr>)}
					</tbody></table></div>
				</Section>
				<Section title={I18n.t("recentSessions")} subtitle={I18n.t("recentSessionsDesc")}>
					<div className="study-table-scroll"><table className="study-table"><thead><tr><th>{I18n.t("time")}</th><th>{I18n.t("note")}</th><th>{I18n.t("duration")}</th></tr></thead><tbody>
						{data.recentSessions.map((session, index) => <tr key={`${session.openedAt}-${index}`}><td>{formatDateTime(session.openedAt)}</td><td><button className="study-note-button" title={session.filePath} onClick={() => onSelect(session.filePath)}>{shortName(session.filePath)}</button></td><td>{TimeUtils.getPreciseFormattedReadingTime(session.duration)}</td></tr>)}
					</tbody></table></div>
				</Section>
			</div>
		</div>
	);
}

function SummaryCard({label, value}: {label: string; value: string}) {
	return <div className="study-summary-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Section({title, subtitle, children}: {title: string; subtitle?: string; children: React.ReactNode}) {
	return <section className="study-section"><div className="study-section-heading"><h3>{title}</h3>{subtitle && <span>{subtitle}</span>}</div>{children}</section>;
}

function SimpleBars({items, labelStep = 1}: {items: Array<{label: string; value: number; title: string}>; labelStep?: number}) {
	const max = Math.max(1, ...items.map(item => item.value));
	const scrollRef = React.useRef<HTMLDivElement>(null);
	React.useLayoutEffect(() => {
		const element = scrollRef.current;
		if (element) element.scrollLeft = element.scrollWidth;
	}, [items.length]);
	return <div className={`study-simple-bars ${items.length > 12 ? "is-dense" : ""}`} ref={scrollRef}>{items.map((item, index) => {
		const barHeight = Math.max(item.value ? 4 : 0, item.value / max * 100);
		const showLabel = index === 0 || index === items.length - 1 || index % labelStep === 0;
		return <div className="study-simple-bar-item" key={`${item.label}-${index}`} title={item.title}>
			<div className="study-simple-bar-track"><svg className="study-simple-bar-fill" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={item.title}><rect x="0" y={100 - barHeight} width="100" height={barHeight} rx="3" /></svg></div>
			<span className="study-simple-bar-label" aria-hidden={!showLabel}>{showLabel ? item.label : ""}</span>
		</div>;
	})}</div>;
}

function Heatmap({points}: {points: Array<{date: string; totalTime: number; sessionCount: number}>}) {
	const max = Math.max(1, ...points.map(point => point.totalTime));
	const scrollRef = React.useRef<HTMLDivElement>(null);
	React.useLayoutEffect(() => {
		const element = scrollRef.current;
		if (element) element.scrollLeft = element.scrollWidth;
	}, [points.length]);
	return <div className="study-heatmap" ref={scrollRef} aria-label={I18n.t("heatmapAriaLabel")}>{points.map(point => {
		const level = point.totalTime === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(point.totalTime / max * 4)));
		return <div key={point.date} className={`study-heatmap-cell level-${level}`} title={`${point.date} · ${I18n.t("times", {count: point.sessionCount})} · ${TimeUtils.getPreciseFormattedReadingTime(point.totalTime)}`} />;
	})}</div>;
}

function RankingCard({title, rows, value, onSelect}: {title: string; rows: NoteStudyRow[]; value: (row: NoteStudyRow) => string; onSelect: (path: string) => void}) {
	return <section className="study-ranking-card"><h3>{title}</h3>{rows.length === 0 ? <p className="leaderboard-no-data">{I18n.t("noDataAvailable")}</p> : <ol>{rows.map(row => <li key={row.filePath}>
		<button title={row.filePath} onClick={() => onSelect(row.filePath)}>{shortName(row.filePath)}</button><span>{value(row)}</span>
	</li>)}</ol>}</section>;
}
