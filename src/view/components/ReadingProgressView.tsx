import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {ReadingProgressEntry} from "../../interface/readingProgress";
import {NoteProgressSummary, summarizeNoteProgress} from "../../util/readingProgressUtils";
import {TimeUtils} from "../../util/timeUtils";
import I18n from "../../language/i18n";
import {ConfirmActionModal} from "../display/modal/sessionEditorModal";
import {ProgressEntryModal} from "../display/modal/progressEntryModal";

interface Props {
	plugin: StudyTimeStatisticsPlugin;
	onSelect: (filePath: string) => void;
}

function shortName(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

function localDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatPercent(value: number): string {
	return `${Math.round(value * 10) / 10}%`;
}

function formatSpeed(value: number): string {
	return value > 0 ? I18n.t("charactersPerMinute", {count: Math.round(value)}) : I18n.t("notAvailable");
}

export function ReadingProgressView({plugin, onSelect}: Props) {
	const [entries, setEntries] = React.useState<ReadingProgressEntry[]>([]);
	const [enabled, setEnabled] = React.useState(plugin.dataManager.getProgressTrackingEnabled());
	const [loading, setLoading] = React.useState(true);

	const load = React.useCallback(async () => {
		await plugin.dataManager.loadData();
		setEntries(plugin.dataManager.getProgressEntries());
		setEnabled(plugin.dataManager.getProgressTrackingEnabled());
		setLoading(false);
	}, [plugin]);
	React.useEffect(() => { void load(); }, [load]);

	const openEditor = (entry?: ReadingProgressEntry) => {
		new ProgressEntryModal(plugin.app, plugin, entry, undefined, () => { void load(); }).open();
	};
	const deleteEntry = (entry: ReadingProgressEntry) => {
		new ConfirmActionModal(
			plugin.app,
			I18n.t("deleteProgressEntry"),
			I18n.t("deleteProgressConfirm"),
			I18n.t("delete"),
			async () => {
				await plugin.backupService.createSafetyBackup();
				await plugin.dataManager.deleteProgressEntry(entry.id);
				new Notice(I18n.t("progressDeleted"));
				await load();
			}
		).open();
	};

	if (loading) return <div className="stats-loading">{I18n.t("loading")}</div>;
	if (!enabled) return <div className="progress-disabled">
		<h2>{I18n.t("readingCoverage")}</h2>
		<p>{I18n.t("progressDisabledDesc")}</p>
		<button className="mod-cta" onClick={() => {
			void plugin.dataManager.setProgressTrackingEnabled(true).then(load);
		}}>{I18n.t("enableProgressTracking")}</button>
	</div>;

	const notes = summarizeNoteProgress(entries).sort((a, b) => b.coverage - a.coverage);
	const totalCharacters = notes.reduce((sum, note) => sum + note.characterCount, 0);
	const weightedCoverage = totalCharacters > 0
		? notes.reduce((sum, note) => sum + note.characterCount * note.coverage, 0) / totalCharacters
		: notes.reduce((sum, note) => sum + note.coverage, 0) / Math.max(1, notes.length);
	const totalCovered = notes.reduce((sum, note) => sum + note.estimatedCoveredCharacters, 0);
	const totalDuration = notes.reduce((sum, note) => sum + note.totalActiveDuration, 0);
	const overallSpeed = totalDuration > 0 ? totalCovered / (totalDuration / 60_000) : 0;
	const now = new Date();
	const dailyMap = new Map<string, {percent: number; count: number}>();
	for (const entry of entries) {
		const key = localDateKey(entry.recordedAt);
		const point = dailyMap.get(key) ?? {percent: 0, count: 0};
		point.percent += entry.percent;
		point.count++;
		dailyMap.set(key, point);
	}
	const heatmap = Array.from({length: 365}, (_, offset) => {
		const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (364 - offset));
		const key = localDateKey(date.getTime());
		return {date: key, ...(dailyMap.get(key) ?? {percent: 0, count: 0})};
	});
	const hourly = Array.from({length: 24}, (_, hour) => ({label: String(hour).padStart(2, "0"), value: 0, count: 0}));
	for (const entry of entries) {
		const point = hourly[new Date(entry.recordedAt).getHours()];
		if (point) {
			point.value += entry.percent;
			point.count++;
		}
	}
	const folders = buildFolderSummaries(notes);

	return <div className="reading-progress-view">
		<div className="session-history-header">
			<div><h2>{I18n.t("readingCoverage")}</h2><p>{I18n.t("progressMeaning")}</p></div>
			<button className="mod-cta" onClick={() => openEditor()}>{I18n.t("recordProgress")}</button>
		</div>
		<div className="study-summary-grid">
			<Summary label={I18n.t("progressRecords")} value={I18n.t("times", {count: entries.length})} />
			<Summary label={I18n.t("notesWithProgress")} value={I18n.t("notesCount", {count: notes.length})} />
			<Summary label={I18n.t("weightedCoverage")} value={formatPercent(weightedCoverage)} />
			<Summary label={I18n.t("estimatedCoveredCharacters")} value={String(Math.round(totalCovered))} />
			<Summary label={I18n.t("progressActiveTime")} value={TimeUtils.getPreciseFormattedReadingTime(totalDuration)} />
			<Summary label={I18n.t("readingPace")} value={formatSpeed(overallSpeed)} />
		</div>
		<Section title={I18n.t("coverageHeatmap")} subtitle={I18n.t("coverageHeatmapDesc")}>
			<ProgressHeatmap points={heatmap} />
		</Section>
		<Section title={I18n.t("coverageHourly")} subtitle={I18n.t("coverageHourlyDesc")}>
			<ProgressBars items={hourly.map(point => ({label: point.label, value: point.value, title: `${point.label}:00 · ${point.count} · ${formatPercent(point.value)}`}))} />
		</Section>
		<div className="study-two-column">
			<Section title={I18n.t("noteCoverageRanking")} subtitle={I18n.t("noteCoverageRankingDesc")}>
				<ol className="progress-ranking">{notes.slice(0, 20).map(note => <li key={note.filePath}>
					<button title={note.filePath} onClick={() => onSelect(note.filePath)}>{shortName(note.filePath)}</button>
					<span>{formatPercent(note.coverage)} · {formatSpeed(note.charactersPerMinute)}</span>
				</li>)}</ol>
			</Section>
			<Section title={I18n.t("folderCoverage")} subtitle={I18n.t("folderCoverageDesc")}>
				<div className="study-table-scroll"><table className="study-table"><thead><tr><th>{I18n.t("folder")}</th><th>{I18n.t("note")}</th><th>{I18n.t("coverage")}</th></tr></thead><tbody>
					{folders.slice(0, 20).map(folder => <tr key={folder.folder}><td>{folder.folder}</td><td>{folder.noteCount}</td><td>{formatPercent(folder.coverage)}</td></tr>)}
				</tbody></table></div>
			</Section>
		</div>
		<Section title={I18n.t("progressHistory")} subtitle={I18n.t("progressHistoryDesc")}>
			{entries.length === 0 ? <p className="leaderboard-no-data">{I18n.t("noProgressEntries")}</p> :
				<div className="study-table-scroll"><table className="study-table"><thead><tr><th>{I18n.t("time")}</th><th>{I18n.t("note")}</th><th>{I18n.t("coverage")}</th><th>{I18n.t("progressActiveTime")}</th><th>{I18n.t("readingPace")}</th><th>{I18n.t("actions")}</th></tr></thead><tbody>
					{entries.slice(0, 500).map(entry => {
						const covered = entry.characterCount * entry.percent / 100;
						const speed = entry.activeDuration > 0 ? covered / (entry.activeDuration / 60_000) : 0;
						return <tr key={entry.id}><td>{new Date(entry.recordedAt).toLocaleString()}</td><td><button className="study-note-button" title={entry.filePath} onClick={() => onSelect(entry.filePath)}>{shortName(entry.filePath)}</button></td><td>{formatPercent(entry.percent)}</td><td>{TimeUtils.getPreciseFormattedReadingTime(entry.activeDuration)}</td><td>{formatSpeed(speed)}</td><td><div className="session-row-actions"><button onClick={() => openEditor(entry)}>{I18n.t("edit")}</button><button onClick={() => deleteEntry(entry)}>{I18n.t("delete")}</button></div></td></tr>;
					})}
				</tbody></table></div>}
		</Section>
	</div>;
}

function buildFolderSummaries(notes: NoteProgressSummary[]): Array<{folder: string; noteCount: number; coverage: number}> {
	const map = new Map<string, {folder: string; noteCount: number; weighted: number; characters: number; unweighted: number}>();
	for (const note of notes) {
		const folder = note.filePath.includes("/") ? note.filePath.split("/")[0] ?? I18n.t("vaultRoot") : I18n.t("vaultRoot");
		const row = map.get(folder) ?? {folder, noteCount: 0, weighted: 0, characters: 0, unweighted: 0};
		row.noteCount++;
		row.weighted += note.coverage * note.characterCount;
		row.characters += note.characterCount;
		row.unweighted += note.coverage;
		map.set(folder, row);
	}
	return [...map.values()].map(row => ({
		folder: row.folder,
		noteCount: row.noteCount,
		coverage: row.characters > 0 ? row.weighted / row.characters : row.unweighted / Math.max(1, row.noteCount)
	})).sort((a, b) => b.coverage - a.coverage);
}

function Summary({label, value}: {label: string; value: string}) {
	return <div className="study-summary-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Section({title, subtitle, children}: {title: string; subtitle?: string; children: React.ReactNode}) {
	return <section className="study-section"><div className="study-section-heading"><h3>{title}</h3>{subtitle && <span>{subtitle}</span>}</div>{children}</section>;
}

function ProgressHeatmap({points}: {points: Array<{date: string; percent: number; count: number}>}) {
	const max = Math.max(1, ...points.map(point => point.percent));
	return <div className="study-heatmap" aria-label={I18n.t("coverageHeatmap")}>{points.map(point => {
		const level = point.percent === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(point.percent / max * 4)));
		return <div key={point.date} className={`study-heatmap-cell level-${level}`} title={`${point.date} · ${point.count} · ${formatPercent(point.percent)}`} />;
	})}</div>;
}

function ProgressBars({items}: {items: Array<{label: string; value: number; title: string}>}) {
	const max = Math.max(1, ...items.map(item => item.value));
	return <div className="study-simple-bars">{items.map(item => {
		const height = Math.max(item.value ? 4 : 0, item.value / max * 100);
		return <div className="study-simple-bar-item" key={item.label} title={item.title}><div className="study-simple-bar-track"><svg className="study-simple-bar-fill" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="0" y={100 - height} width="100" height={height} rx="3" /></svg></div><span>{item.label}</span></div>;
	})}</div>;
}
