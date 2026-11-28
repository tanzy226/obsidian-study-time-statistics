import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {DataHealthReport, inspectDataHealth} from "../../util/dataHealth";
import I18n from "../../language/i18n";
import {dataSafetyMessage} from "../../core/dataSafety";

export function DataHealthView({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	const text = (english: string, chinese: string) => I18n.local(english, chinese);
	const [report, setReport] = React.useState<DataHealthReport>();
	const [busy, setBusy] = React.useState(false);
	const writeProtection = plugin.dataManager.getWriteProtection();
	const repairableIssues = report?.issues.filter(issue => issue.kind === "duplicate-session") ?? [];
	const inspect = React.useCallback(() => {
		const paths = new Set(plugin.app.vault.getFiles().map(file => file.path));
		setReport(inspectDataHealth(plugin.dataManager.getReadData(), plugin.dataManager.getSessions(), plugin.dataManager.getProgressEntries(), paths));
	}, [plugin]);
	React.useEffect(inspect, [inspect]);

	const repair = async () => {
		if (!repairableIssues.length || busy) return;
		setBusy(true);
		try {
			const result = await plugin.backupService.withSafetyBackup(backup => plugin.dataManager.repairSessionData(backup));
			new Notice(text(`Repaired ${result.removed} session records.`, `已修复 ${result.removed} 条会话记录。`));
			inspect();
		} catch (error) {
			console.error("Study Time Statistics repair failed", error);
			new Notice(dataSafetyMessage(error, text("Repair could not finish. Check the backup and current data.", "未能完成修复。请核对备份和当前数据。")));
		} finally {
			setBusy(false);
		}
	};
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
			const result = await plugin.backupService.withSafetyBackup(backup => plugin.dataManager.mergeData(parsed, backup));
			new Notice(text(`Merged ${result.eventsAdded} events, ${result.sessionsAdded} sessions and ${result.progressAdded} progress records.`, `已合并 ${result.eventsAdded} 个事件、${result.sessionsAdded} 条会话和 ${result.progressAdded} 条进度记录。`));
			inspect();
		} catch (error) {
			console.error("Study Time Statistics snapshot merge failed", error);
			new Notice(dataSafetyMessage(error, error instanceof SyntaxError
				? text("This file is not valid JSON. No data was merged.", "所选文件不是有效的 JSON，未合并任何数据。")
				: text("Merge could not finish. Check the backup and current data.", "未能完成合并。请核对备份和当前数据。")));
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

	return <div className="data-health-view">
		<h2>{text("Data management", "数据管理")}</h2>
		<p className="setting-item-description">{text("Check local data, create backups, repair safe issues, or merge another snapshot.", "检查本地数据、创建备份、修复明确问题或合并其他数据快照。")}</p>
		{writeProtection && <p role="status">{dataSafetyMessage(writeProtection, I18n.t("actionFailed"))}</p>}
		<div className="data-health-summary">
			<strong>{report?.issues.length ?? 0}</strong><span>{text(" issues", " 项问题")}</span>
			<p>{text(`${report?.noteCount ?? 0} notes · ${report?.sessionCount ?? 0} sessions · ${report?.progressCount ?? 0} progress records · ${plugin.dataManager.getStudyEvents().length} events`, `${report?.noteCount ?? 0} 篇笔记 · ${report?.sessionCount ?? 0} 条会话 · ${report?.progressCount ?? 0} 条进度 · ${plugin.dataManager.getStudyEvents().length} 个事件`)}</p>
			{Boolean(report?.issues.length) && <p>{text(`${repairableIssues.length} duplicate entries eligible for review. If the totals cannot be verified, nothing is changed. Missing-note history is kept.`, `有 ${repairableIssues.length} 条重复记录可以复核。无法核对总计时不会应用更改；缺失笔记的历史会保留。`)}</p>}
		</div>
		<div className="data-health-actions">
			<button disabled={busy} onClick={inspect}>{text("Check again", "重新检查")}</button>
			<button disabled={busy} onClick={() => { void createBackup(); }}>{I18n.t("createBackup")}</button>
			<button disabled={busy || Boolean(writeProtection) || repairableIssues.length === 0} className="mod-cta" onClick={() => { void repair(); }}>{text("Review and repair duplicates", "复核并修复重复记录")}</button>
			<label className={`data-import-label ${busy || writeProtection ? "is-disabled" : ""}`}>{text("Merge snapshot or backup", "合并数据快照或备份")}<input disabled={busy || Boolean(writeProtection)} type="file" accept="application/json,.json" onChange={event => { void mergeSnapshot(event.target.files?.[0]); event.target.value = ""; }} /></label>
		</div>
		{report?.issues.slice(0, 100).map((issue, index) => <div className="data-health-issue" key={`${issue.kind}-${issue.id}-${index}`}>
			<strong>{issueLabel(issue.kind)}</strong><span>{issue.filePath || issue.id}</span>
		</div>)}
	</div>;
}
