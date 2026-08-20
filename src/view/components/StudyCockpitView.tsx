import * as React from "react";
import StudyTimeStatisticsPlugin from "../../main";
import I18n from "../../language/i18n";
import {TimeUtils} from "../../util/timeUtils";
import {buildStudyCockpitSummary} from "../../util/studyCockpitUtils";
import {buildStudyGoalSummary} from "../../util/studyGoalUtils";

interface Props {
	plugin: StudyTimeStatisticsPlugin;
	onSelect: (filePath: string) => void;
}

function ratio(value: number): string {
	return `${Math.round(Math.max(0, value) * 100)}%`;
}

function signedRatio(value: number): string {
	const rounded = Math.round(value * 100);
	return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function shortName(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

export function StudyCockpitView({plugin, onSelect}: Props) {
	const [loading, setLoading] = React.useState(true);
	const [revision, setRevision] = React.useState(0);
	React.useEffect(() => {
		void plugin.dataManager.loadData().then(() => { setRevision(value => value + 1); setLoading(false); });
	}, [plugin]);
	if (loading) return <div className="stats-loading">{I18n.t("analyticsLoading")}</div>;
	const sessions = plugin.dataManager.getSessions();
	const goals = buildStudyGoalSummary(sessions, plugin.dataManager.getStudyGoals());
	const cockpit = buildStudyCockpitSummary(sessions, Object.values(plugin.dataManager.getReadData()), plugin.dataManager.getProgressEntries());
	return <div className="study-cockpit-view" data-revision={revision}>
		<div className="cockpit-hero"><div><span className="cockpit-eyebrow">{I18n.t("cockpitEyebrow")}</span><h2>{I18n.t("studyCockpit")}</h2><p>{I18n.t("studyCockpitDesc")}</p></div><div className="cockpit-today"><strong>{TimeUtils.getPreciseFormattedReadingTime(cockpit.todayDuration)}</strong><span>{I18n.t("todayReading")}</span></div></div>
		<div className="study-summary-grid">
			<Card label={I18n.t("weeklyReading")} value={TimeUtils.getPreciseFormattedReadingTime(cockpit.thisWeekDuration)} hint={`${I18n.t("versusPreviousWeek")} ${signedRatio(cockpit.weekChange)}`} />
			<Card label={I18n.t("dailyGoalProgress")} value={ratio(goals.todayRatio)} hint={`${Math.round(goals.todayDuration / 60_000)} / ${Math.round(goals.dailyTarget / 60_000)} min`} />
			<Card label={I18n.t("weeklyGoalProgress")} value={ratio(goals.weekRatio)} hint={`${Math.round(goals.weekDuration / 60_000)} / ${Math.round(goals.weeklyTarget / 60_000)} min`} />
			<Card label={I18n.t("medianSession")} value={TimeUtils.getPreciseFormattedReadingTime(cockpit.medianSessionDuration)} />
			<Card label={I18n.t("deepReadingShare")} value={ratio(cockpit.deepReadingRatio)} hint={I18n.t("deepReadingShareDesc")} />
			<Card label={I18n.t("verifiedStudyShare")} value={ratio(cockpit.verifiedDurationRatio)} hint={I18n.t("verifiedStudyShareDesc")} />
			<Card label={I18n.t("bestStudyHour")} value={cockpit.bestHour === undefined ? I18n.t("notAvailable") : `${String(cockpit.bestHour).padStart(2, "0")}:00–${String((cockpit.bestHour + 1) % 24).padStart(2, "0")}:00`} />
			<Card label={I18n.t("itemsNeedingReview")} value={String(cockpit.needsReviewCount)} hint={I18n.t("itemsNeedingReviewDesc")} />
		</div>
		<div className="study-two-column">
			<section className="study-section"><div className="study-section-heading"><h3>{I18n.t("goalPulse")}</h3><span>{I18n.t("goalPulseDesc")}</span></div><div className="cockpit-progress"><label>{I18n.t("today")}<progress max="1" value={Math.min(1, goals.todayRatio)} /></label><label>{I18n.t("viewWeek")}<progress max="1" value={Math.min(1, goals.weekRatio)} /></label></div><p>{I18n.t("goalPulseSummary", {days: goals.reachedDays, streak: goals.currentGoalStreak})}</p></section>
			<section className="study-section"><div className="study-section-heading"><h3>{I18n.t("dataPulse")}</h3><span>{I18n.t("dataPulseDesc")}</span></div><div className="cockpit-pulse-list"><span className="cockpit-pulse-row">{I18n.t("sessionHistory")}<strong>{sessions.length}</strong></span><span className="cockpit-pulse-row">{I18n.t("progressRecords")}<strong>{cockpit.coverageEntryCount}</strong></span><span className="cockpit-pulse-row">{I18n.t("itemsNeedingReview")}<strong>{cockpit.needsReviewCount}</strong></span></div></section>
		</div>
		<section className="study-section"><div className="study-section-heading"><h3>{I18n.t("revisitQueue")}</h3><span>{I18n.t("revisitQueueDesc")}</span></div>{cockpit.revisitNotes.length === 0 ? <p className="leaderboard-no-data">{I18n.t("noRevisitNotes")}</p> : <div className="cockpit-revisit-grid">{cockpit.revisitNotes.map(note => <button key={note.filePath} title={note.filePath} onClick={() => onSelect(note.filePath)}><strong>{shortName(note.filePath)}</strong><span className="cockpit-revisit-meta">{I18n.t("lastReadWithDate", {date: new Date(note.lastOpenedAt ?? 0).toLocaleDateString()})}</span></button>)}</div>}</section>
	</div>;
}

function Card({label, value, hint}: {label: string; value: string; hint?: string}) {
	return <div className="study-summary-card"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
