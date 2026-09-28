import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {DataHealthReport, inspectDataHealth} from "../../util/dataHealth";
import I18n from "../../language/i18n";

export function DataHealthView({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	const text = (english: string, chinese: string) => I18n.local(english, chinese);
	const [report, setReport] = React.useState<DataHealthReport>();
	const inspect = React.useCallback(() => {
		const paths = new Set(plugin.app.vault.getFiles().map(file => file.path));
		setReport(inspectDataHealth(plugin.dataManager.getReadData(), plugin.dataManager.getSessions(), plugin.dataManager.getProgressEntries(), paths));
	}, [plugin]);
	React.useEffect(inspect, [inspect]);

	const repair = async () => {
		await plugin.backupService.createBackup();
		const result = await plugin.dataManager.repairSessionData();
		new Notice(text(`Repaired ${result.removed} session records.`, `已修复 ${result.removed} 条会话记录。`));
		inspect();
	};
	const mergeSnapshot = async (file: File | undefined) => {
		if (!file) return;
		await plugin.backupService.createBackup();
		const parsed: unknown = JSON.parse(await file.text());
		const result = await plugin.dataManager.mergeData(parsed);
		new Notice(text(`Merged ${result.eventsAdded} events, ${result.sessionsAdded} sessions and ${result.progressAdded} progress records.`, `已合并 ${result.eventsAdded} 个事件、${result.sessionsAdded} 条会话和 ${result.progressAdded} 条进度记录。`));
		inspect();
	};

	return <div className="data-health-view">
		<h2>{text("Data management", "数据管理")}</h2>
		<p className="setting-item-description">{text("Check local data, create backups, repair safe issues, or merge another snapshot.", "检查本地数据、创建备份、修复明确问题或合并其他数据快照。")}</p>
		<div className="data-health-summary">
			<strong>{report?.issues.length ?? 0}</strong><span>{text(" issues", " 项问题")}</span>
			<p>{text(`${report?.noteCount ?? 0} notes · ${report?.sessionCount ?? 0} sessions · ${report?.progressCount ?? 0} progress records · ${plugin.dataManager.getStudyEvents().length} events`, `${report?.noteCount ?? 0} 篇笔记 · ${report?.sessionCount ?? 0} 条会话 · ${report?.progressCount ?? 0} 条进度 · ${plugin.dataManager.getStudyEvents().length} 个事件`)}</p>
		</div>
		<div className="data-health-actions">
			<button onClick={inspect}>{text("Check again", "重新检查")}</button>
			<button className="mod-cta" onClick={() => { void repair(); }}>{text("Back up and repair", "备份并修复")}</button>
			<label className="data-import-label">{text("Merge snapshot", "合并数据快照")}<input type="file" accept="application/json,.json" onChange={event => { void mergeSnapshot(event.target.files?.[0]); event.target.value = ""; }} /></label>
		</div>
		{report?.issues.slice(0, 100).map((issue, index) => <div className="data-health-issue" key={`${issue.kind}-${issue.id}-${index}`}>
			<strong>{issue.kind}</strong><span>{issue.filePath || issue.id}</span>
		</div>)}
	</div>;
}
