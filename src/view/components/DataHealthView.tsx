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

	return <div className="data-health-view">
		<h2>{text("Data management", "数据管理")}</h2>
		<p className="setting-item-description">{text("Check local data, create a backup, and repair safe issues.", "检查本地数据、创建备份并修复明确问题。")}</p>
		<div className="data-health-summary">
			<strong>{report?.issues.length ?? 0}</strong><span>{text(" issues", " 项问题")}</span>
			<p>{text(`${report?.noteCount ?? 0} notes · ${report?.sessionCount ?? 0} sessions · ${report?.progressCount ?? 0} progress records`, `${report?.noteCount ?? 0} 篇笔记 · ${report?.sessionCount ?? 0} 条会话 · ${report?.progressCount ?? 0} 条进度`)}</p>
			{Boolean(report?.issues.length) && <p>{text(`${repairableIssues.length} can be repaired automatically. Missing-note records are kept so renames and temporarily unavailable files do not erase history.`, `其中 ${repairableIssues.length} 项可自动安全修复。笔记不存在的记录会保留，避免重命名或文件暂时不可用时误删历史。`)}</p>}
		</div>
		<div className="data-health-actions">
			<button disabled={busy} onClick={inspect}>{text("Check again", "重新检查")}</button>
			<button disabled={busy || repairableIssues.length === 0} className="mod-cta" onClick={() => { void repair(); }}>{text("Back up and repair safe issues", "备份并修复安全项")}</button>
		</div>
		{report?.issues.slice(0, 100).map((issue, index) => <div className="data-health-issue" key={`${issue.kind}-${issue.id}-${index}`}>
			<strong>{issueLabel(issue.kind)}</strong><span>{issue.filePath || issue.id}</span>
		</div>)}
	</div>;
}
