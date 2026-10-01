import * as React from "react";
import StudyTimeStatisticsPlugin from "../../main";
import {attentionScore, AttentionMetric, buildAttentionNodes, buildStudyPath} from "../../util/attentionMap";
import {TimeUtils} from "../../util/timeUtils";
import I18n from "../../language/i18n";

function shortName(path: string): string {
	return path.split("/").pop()?.replace(/\.(md|pdf)$/iu, "") ?? path;
}

export function AttentionMapView({plugin, onSelect}: {plugin: StudyTimeStatisticsPlugin; onSelect: (filePath: string) => void}) {
	const text = (english: string, chinese: string) => I18n.local(english, chinese);
	const [parentPath, setParentPath] = React.useState("");
	const [metric, setMetric] = React.useState<AttentionMetric>("duration");
	const vaultPaths = plugin.app.vault.getFiles().filter(file => file.extension === "md" || file.extension === "pdf").map(file => file.path);
	const nodes = buildAttentionNodes(plugin.dataManager.getReadData(), plugin.dataManager.getProgressEntries(), parentPath, vaultPaths)
		.sort((a, b) => attentionScore(b, metric) - attentionScore(a, metric));
	const paths = buildStudyPath(plugin.dataManager.getSessions());

	return <div className="attention-map-view">
		<h2>{text("Study investment", "学习投入分布")}</h2>
		<p className="setting-item-description">{text("See studied and unstudied notes by folder. All names come from this vault.", "按文件夹查看已读和未读笔记，名称均来自当前仓库。")}</p>
		<div className="attention-toolbar">
			{parentPath && <button onClick={() => setParentPath(parentPath.split("/").slice(0, -1).join("/"))}>← {text("Back", "返回")}</button>}
			<select value={metric} onChange={event => setMetric(event.target.value as AttentionMetric)}><option value="duration">{text("Time", "时长")}</option><option value="opens">{text("Opens", "打开次数")}</option><option value="coverage">{text("Coverage", "阅读覆盖")}</option><option value="recency">{text("Recency", "最近阅读")}</option></select>
			<span>{parentPath || text("Vault", "仓库")}</span>
		</div>
		<div className="attention-grid">{nodes.map(node => {
			const isNote = node.path.endsWith(".md") || node.path.endsWith(".pdf");
			const duration = TimeUtils.getFormattedReadingTime(node.duration);
			const opens = node.opens.toLocaleString();
			const primary = metric === "duration"
				? {label: text("Time", "时长"), value: duration}
				: metric === "opens"
					? {label: text("Opens", "打开次数"), value: opens}
					: metric === "coverage"
						? {label: text("Coverage", "阅读覆盖"), value: `${Math.round(node.coverage)}%`}
						: {label: text("Last read", "最近阅读"), value: node.lastOpenedAt ? new Date(node.lastOpenedAt).toLocaleDateString() : text("Never", "尚未阅读")};
			return <button key={node.path} className="attention-node" title={node.path} onClick={() => isNote ? onSelect(node.path) : setParentPath(node.path)}>
				<span className="attention-node-main">
					<strong className="attention-node-title">{node.label}</strong>
					<span className="attention-node-meta">
						{metric !== "duration" && <span>{text("Time", "时长")} {duration}</span>}
						{metric !== "opens" && <span>{text("Opens", "打开次数")} {opens}</span>}
						{!isNote && <span>{text("Notes", "笔记数")} {node.noteCount.toLocaleString()}</span>}
					</span>
				</span>
				<span className="attention-node-primary"><small>{primary.label}</small><b>{primary.value}</b></span>
			</button>;
		})}</div>
		<h3>{text("Frequent transitions", "常见连续阅读")}</h3>
		<div className="study-path-list">{paths.map(edge => <div className="study-path-row" key={`${edge.from}-${edge.to}`}>
			<button className="study-note-button study-path-from" title={edge.from} onClick={() => onSelect(edge.from)}>{shortName(edge.from)}</button>
			<span className="study-path-arrow" aria-hidden="true">→</span>
			<button className="study-note-button study-path-to" title={edge.to} onClick={() => onSelect(edge.to)}>{shortName(edge.to)}</button>
			<strong className="study-path-count">× {edge.count}</strong>
		</div>)}</div>
	</div>;
}
