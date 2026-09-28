import * as React from "react";
import {Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../main";
import {DataHealthReport, inspectDataHealth} from "../../util/dataHealth";

export function DataHealthView({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	const [report, setReport] = React.useState<DataHealthReport>();
	const inspect = React.useCallback(() => {
		const paths = new Set(plugin.app.vault.getFiles().map(file => file.path));
		setReport(inspectDataHealth(plugin.dataManager.getReadData(), plugin.dataManager.getSessions(), plugin.dataManager.getProgressEntries(), paths));
	}, [plugin]);
	React.useEffect(inspect, [inspect]);

	const repair = async () => {
		await plugin.backupService.createBackup();
		const result = await plugin.dataManager.repairSessionData();
		new Notice(`Study Time Statistics: repaired ${result.removed} session records.`);
		inspect();
	};

	return <div className="data-health-view">
		<h2>Data health / 数据健康</h2>
		<p className="setting-item-description">Local checks for duplicate sessions, invalid durations and references to notes that no longer exist. / 检查重复会话、异常时长和已不存在的笔记引用。</p>
		<div className="data-health-summary">
			<strong>{report?.issues.length ?? 0}</strong><span> issues / 项问题</span>
			<p>{report?.noteCount ?? 0} notes · {report?.sessionCount ?? 0} sessions · {report?.progressCount ?? 0} progress records</p>
		</div>
		<div className="data-health-actions">
			<button onClick={inspect}>Refresh / 重新检查</button>
			<button className="mod-cta" onClick={() => { void repair(); }}>Back up and repair safe issues / 备份并修复安全问题</button>
		</div>
		{report?.issues.slice(0, 100).map((issue, index) => <div className="data-health-issue" key={`${issue.kind}-${issue.id}-${index}`}>
			<strong>{issue.kind}</strong><span>{issue.filePath || issue.id}</span>
		</div>)}
	</div>;
}
