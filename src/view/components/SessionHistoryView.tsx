import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {StudySession} from "../../interface/studySession";
import {TimeUtils} from "../../util/timeUtils";
import I18n from "../../language/i18n";
import {ConfirmActionModal, SessionEditorModal} from "../display/modal/sessionEditorModal";

interface Props {
	plugin: StudyTimeStatisticsPlugin;
	onSelect: (filePath: string) => void;
}

function shortName(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

function formatDateTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
	});
}

export function SessionHistoryView({plugin, onSelect}: Props) {
	const [sessions, setSessions] = React.useState<StudySession[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [backupCount, setBackupCount] = React.useState(0);

	const load = React.useCallback(async () => {
		await plugin.dataManager.loadData();
		setSessions(plugin.dataManager.getSessions());
		setBackupCount(plugin.backupService.getBackupFiles().length);
		setLoading(false);
	}, [plugin]);

	React.useEffect(() => { void load(); }, [load]);

	const openEditor = (session?: StudySession) => {
		new SessionEditorModal(plugin.app, plugin, session, () => { void load(); }).open();
	};

	const deleteSession = (session: StudySession) => {
		new ConfirmActionModal(
			plugin.app,
			I18n.t("deleteSession"),
			I18n.t("deleteSessionConfirm"),
			I18n.t("delete"),
			async () => {
				await plugin.backupService.createSafetyBackup();
				await plugin.dataManager.deleteSession(session.id);
				new Notice(I18n.t("sessionDeleted"));
				await load();
			}
		).open();
	};

	const createBackup = async () => {
		try {
			const path = await plugin.backupService.createBackup();
			new Notice(I18n.t("backupCreated", {path}));
			await load();
		} catch (error) {
			console.error("Study Time Statistics backup failed", error);
			new Notice(I18n.t("actionFailed"));
		}
	};

	const restoreLatest = () => {
		new ConfirmActionModal(
			plugin.app,
			I18n.t("restoreBackup"),
			I18n.t("restoreBackupConfirm"),
			I18n.t("restore"),
			async () => {
				const path = await plugin.backupService.restoreLatestBackup();
				new Notice(path ? I18n.t("backupRestored", {path}) : I18n.t("noBackupAvailable"));
				await load();
			}
		).open();
	};

	if (loading) return <div className="stats-loading">{I18n.t("loading")}</div>;

	return <div className="session-history-view">
		<div className="session-history-header">
			<div><h2>{I18n.t("sessionHistory")}</h2><p>{I18n.t("sessionHistoryDesc")}</p></div>
			<div className="session-history-actions">
				<button className="mod-cta" onClick={() => openEditor()}>{I18n.t("addSession")}</button>
				<button onClick={() => { void createBackup(); }}>{I18n.t("createBackup")}</button>
				<button disabled={backupCount === 0} onClick={restoreLatest}>{I18n.t("restoreLatestBackup")}</button>
			</div>
		</div>
		<p className="session-backup-note">{I18n.t("backupCount", {count: backupCount})} · {I18n.t("backupPrivacyNote")}</p>
		{sessions.length === 0 ? <p className="leaderboard-no-data">{I18n.t("noSessions")}</p> :
			<div className="study-table-scroll"><table className="study-table session-history-table">
				<thead><tr><th>{I18n.t("time")}</th><th>{I18n.t("note")}</th><th>{I18n.t("duration")}</th><th>{I18n.t("sessionSource")}</th><th>{I18n.t("actions")}</th></tr></thead>
				<tbody>{sessions.slice(0, 500).map(session => <tr key={session.id}>
					<td>{formatDateTime(session.openedAt)}</td>
					<td><button className="study-note-button" title={session.filePath} onClick={() => onSelect(session.filePath)}>{shortName(session.filePath)}</button></td>
					<td>{TimeUtils.getPreciseFormattedReadingTime(session.duration)}</td>
					<td>{I18n.t(session.source === "manual" ? "manualSession" : "automaticSession")}</td>
					<td><div className="session-row-actions"><button onClick={() => openEditor(session)}>{I18n.t("edit")}</button><button onClick={() => deleteSession(session)}>{I18n.t("delete")}</button></div></td>
				</tr>)}</tbody>
			</table></div>}
	</div>;
}
