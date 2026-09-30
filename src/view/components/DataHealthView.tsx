import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {DataHealthReport, inspectDataHealth} from "../../util/dataHealth";
import I18n from "../../language/i18n";

export function DataHealthView({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	const text = (english: string, chinese: string) => I18n.local(english, chinese);
	const [report, setReport] = React.useState<DataHealthReport>();
	const [busy, setBusy] = React.useState(false);
	const repairableIssues = report?.issues.filter(issue => issue.kind === "duplicate-session" || issue.kind === "invalid-session") ?? [];
	const inspect = React.useCallback(() => {
		const paths = new Set(plugin.app.vault.getFiles().map(file => file.path));
		setReport(inspectDataHealth(plugin.dataManager.getReadData(), plugin.dataManager.getSessions(), plugin.dataManager.getProgressEntries(), paths));
	}, [plugin]);
	React.useEffect(inspect, [inspect]);

	const repair = async () => {
		if (!repairableIssues.length || busy) return;
		setBusy(true);
		try {
			await plugin.backupService.createBackup();
			const result = await plugin.dataManager.repairSessionData();
			new Notice(text(`Repaired ${result.removed} session records.`, `已修复 ${result.removed} 条会话记录。`));
			inspect();
		} catch (error) {
			console.error("Study Time Statistics repair failed", error);
			new Notice(text("Repair failed. Your existing data was not replaced.", "修复失败，现有数据未被替换。"));
		} finally {
			setBusy(false);
		}
	};
	const issueLabel = (kind: DataHealthReport["issues"][number]["kind"]): string => ({
		"duplicate-session": text("Duplicate session", "重复会话"),
		"invalid-session": text("Invalid session", "无效会话"),
		"missing-note": text("Note no longer exists", "笔记已不存在"),
		"orphan-progress": text("Coverage belongs to a missing note", "覆盖记录对应的笔记已不存在")
	})[kind];
	const createBackup = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const path = await plugin.backupService.createBackup();
			new Notice(I18n.t("backupCreated", {path}));
		} catch (error) {
			console.error("Study Time Statistics backup failed", error);
			new Notice(text("Backup failed.", "备份失败。"));
		} finally {
			setBusy(false);
		}
	};
	const mergeSnapshot = async (file: File | undefined) => {
		if (!file || busy) return;
		setBusy(true);
		try {
			const parsed: unknown = JSON.parse(await file.text());
			await plugin.backupService.createBackup();
			const result = await plugin.dataManager.mergeData(parsed);
			new Notice(text(`Merged ${result.eventsAdded} events, ${result.sessionsAdded} sessions and ${result.progressAdded} progress records.`, `已合并 ${result.eventsAdded} 个事件、${result.sessionsAdded} 条会话和 ${result.progressAdded} 条进度记录。`));
			inspect();
		} catch (error) {
			console.error("Study Time Statistics snapshot merge failed", error);
			new Notice(text("The selected file is not a valid data snapshot or backup. No data was merged.", "所选文件不是有效的数据快照或备份，未合并任何数据。"));
		} finally {
			setBusy(false);
		}
	};

	return <div className="data-health-view">
		<h2>{text("Data management", "数据管理")}</h2>
		<p className="setting-item-description">{text("Check local data, create backups, repair safe issues, or merge another snapshot.", "检查本地数据、创建备份、修复明确问题或合并其他数据快照。")}</p>
		<div className="data-health-summary">
			<strong>{report?.issues.length ?? 0}</strong><span>{text(" issues", " 项问题")}</span>
			<p>{text(`${report?.noteCount ?? 0} notes · ${report?.sessionCount ?? 0} sessions · ${report?.progressCount ?? 0} progress records · ${plugin.dataManager.getStudyEvents().length} events`, `${report?.noteCount ?? 0} 篇笔记 · ${report?.sessionCount ?? 0} 条会话 · ${report?.progressCount ?? 0} 条进度 · ${plugin.dataManager.getStudyEvents().length} 个事件`)}</p>
			{Boolean(report?.issues.length) && <p>{text(`${repairableIssues.length} can be repaired automatically. Missing-note records are kept so renames and temporarily unavailable files do not erase history.`, `其中 ${repairableIssues.length} 项可自动安全修复。笔记不存在的记录会保留，避免重命名或文件暂时不可用时误删历史。`)}</p>}
		</div>
		<div className="data-health-actions">
			<button disabled={busy} onClick={inspect}>{text("Check again", "重新检查")}</button>
			<button disabled={busy} onClick={() => { void createBackup(); }}>{I18n.t("createBackup")}</button>
			<button disabled={busy || repairableIssues.length === 0} className="mod-cta" onClick={() => { void repair(); }}>{text("Back up and repair safe issues", "备份并修复安全项")}</button>
			<label className={`data-import-label ${busy ? "is-disabled" : ""}`}>{text("Merge snapshot or backup", "合并数据快照或备份")}<input disabled={busy} type="file" accept="application/json,.json" onChange={event => { void mergeSnapshot(event.target.files?.[0]); event.target.value = ""; }} /></label>
		</div>
		{report?.issues.slice(0, 100).map((issue, index) => <div className="data-health-issue" key={`${issue.kind}-${issue.id}-${index}`}>
			<strong>{issueLabel(issue.kind)}</strong><span>{issue.filePath || issue.id}</span>
		</div>)}
	</div>;
}
