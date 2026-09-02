import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import I18n from "../../language/i18n";
import {TimeUtils} from "../../util/timeUtils";
import {buildStudyGoalSummary} from "../../util/studyGoalUtils";
import {StudySessionEngagement} from "../../interface/studySession";

interface Props {
	plugin: StudyTimeStatisticsPlugin;
	onSelect: (filePath: string) => void;
}

function percent(value: number): string {
	return `${Math.round(Math.max(0, value) * 100)}%`;
}

function shortName(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

export function StudyGoalsView({plugin, onSelect}: Props) {
	const initial = plugin.dataManager.getStudyGoals();
	const [daily, setDaily] = React.useState(initial.dailyMinutes);
	const [weekly, setWeekly] = React.useState(initial.weeklyMinutes);
	const [revision, setRevision] = React.useState(0);
	const sessions = plugin.dataManager.getSessions();
	const summary = buildStudyGoalSummary(sessions, {dailyMinutes: daily, weeklyMinutes: weekly});

	const saveGoals = async () => {
		await plugin.dataManager.setStudyGoals(daily, weekly);
		new Notice(I18n.t("goalsSaved"));
	};
	const classify = async (id: string, engagement: StudySessionEngagement) => {
		await plugin.dataManager.setSessionEngagement(id, engagement);
		setRevision(value => value + 1);
	};

	return <div className="study-goals-view" data-revision={revision}>
		<div className="session-history-header">
			<div><h2>{I18n.t("studyGoals")}</h2><p>{I18n.t("studyGoalsDesc")}</p></div>
		</div>
		<div className="study-goal-editor">
			<label>{I18n.t("dailyGoalMinutes")}<input type="number" min="0" step="5" value={daily} onChange={event => setDaily(Math.max(0, Number(event.target.value) || 0))} /></label>
			<label>{I18n.t("weeklyGoalMinutes")}<input type="number" min="0" step="15" value={weekly} onChange={event => setWeekly(Math.max(0, Number(event.target.value) || 0))} /></label>
			<button className="mod-cta" onClick={() => { void saveGoals(); }}>{I18n.t("saveGoals")}</button>
		</div>
		<div className="study-summary-grid">
			<Summary label={I18n.t("todayGoalProgress")} value={`${TimeUtils.getPreciseFormattedReadingTime(summary.todayDuration)} · ${percent(summary.todayRatio)}`} />
			<Summary label={I18n.t("weeklyGoalProgress")} value={`${TimeUtils.getPreciseFormattedReadingTime(summary.weekDuration)} · ${percent(summary.weekRatio)}`} />
			<Summary label={I18n.t("goalDaysReached")} value={I18n.t("days", {count: summary.reachedDays})} />
			<Summary label={I18n.t("goalStreak")} value={I18n.t("days", {count: summary.currentGoalStreak})} />
		</div>
		<section className="study-section">
			<div className="study-section-heading"><h3>{I18n.t("goalTrend")}</h3><span>{I18n.t("goalTrendDesc")}</span></div>
			<div className="goal-day-grid">{summary.days.map(day => <div key={day.date} className={`goal-day ${day.reached ? "reached" : ""}`} title={`${day.date} · ${TimeUtils.getPreciseFormattedReadingTime(day.duration)}`}><span>{day.date.slice(5)}</span><strong>{Math.round(day.duration / 60_000)}</strong></div>)}</div>
		</section>
		<section className="study-section">
			<div className="study-section-heading"><h3>{I18n.t("dataQualityReview")}</h3><span>{I18n.t("dataQualityReviewDesc")}</span></div>
			{summary.uncertainSessions.length === 0 ? <p className="leaderboard-no-data">{I18n.t("noUncertainSessions")}</p> :
				<div className="study-table-scroll"><table className="study-table"><thead><tr><th>{I18n.t("time")}</th><th>{I18n.t("note")}</th><th>{I18n.t("duration")}</th><th>{I18n.t("actions")}</th></tr></thead><tbody>
					{summary.uncertainSessions.slice(0, 100).map(session => <tr key={session.id}><td>{new Date(session.openedAt).toLocaleString()}</td><td><button className="study-note-button" onClick={() => onSelect(session.filePath)}>{shortName(session.filePath)}</button></td><td>{TimeUtils.getPreciseFormattedReadingTime(session.duration)}</td><td><div className="session-row-actions"><button onClick={() => { void classify(session.id, "quiet-study"); }}>{I18n.t("confirmQuietStudy")}</button><button onClick={() => { void classify(session.id, "interactive"); }}>{I18n.t("confirmInteractive")}</button></div></td></tr>)}
				</tbody></table></div>}
		</section>
	</div>;
}

function Summary({label, value}: {label: string; value: string}) {
	return <div className="study-summary-card"><span>{label}</span><strong>{value}</strong></div>;
}
