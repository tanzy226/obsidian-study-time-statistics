import type {ReadRecord} from "../interface/readRecord";
import type {ReadingProgressEntry} from "../interface/readingProgress";
import type {StudySession} from "../interface/studySession";

export type AttentionMetric = "duration" | "opens" | "coverage" | "recency";

export interface AttentionNode {
	path: string;
	label: string;
	duration: number;
	opens: number;
	coverage: number;
	lastOpenedAt: number;
	noteCount: number;
}

function childPath(filePath: string, parentPath: string): string {
	const relative = parentPath ? filePath.slice(parentPath.length + 1) : filePath;
	const child = relative.split("/")[0] ?? relative;
	return parentPath ? `${parentPath}/${child}` : child;
}

export function buildAttentionNodes(
	readData: Readonly<Record<string, ReadRecord>>,
	progressEntries: ReadingProgressEntry[],
	parentPath = "",
	allPaths?: readonly string[]
): AttentionNode[] {
	const groups = new Map<string, AttentionNode & {coverageTotal: number; coverageItems: number}>();
	const progressByPath = new Map<string, number>();
	for (const entry of progressEntries) {
		progressByPath.set(entry.filePath, Math.min(100, (progressByPath.get(entry.filePath) ?? 0) + entry.percent));
	}
	const knownPaths = allPaths ? new Set(allPaths) : undefined;
	const paths = knownPaths ? [...knownPaths] : Object.keys(readData);
	for (const path of paths) {
		const record = readData[path] ?? {fileId: path, filePath: path, duration: 0, openCount: 0};
		if (parentPath && !path.startsWith(`${parentPath}/`)) continue;
		const pathValue = childPath(path, parentPath);
		if (!pathValue || pathValue === parentPath) continue;
		const existing = groups.get(pathValue) ?? {path: pathValue, label: pathValue.split("/").pop() ?? pathValue, duration: 0, opens: 0, coverage: 0, lastOpenedAt: 0, noteCount: 0, coverageTotal: 0, coverageItems: 0};
		existing.duration += record.duration;
		existing.opens += record.openCount;
		existing.lastOpenedAt = Math.max(existing.lastOpenedAt, record.lastOpenedAt ?? 0);
		existing.noteCount += 1;
		const coverage = progressByPath.get(path);
		if (coverage !== undefined) { existing.coverageTotal += coverage; existing.coverageItems += 1; }
		groups.set(pathValue, existing);
	}
	return [...groups.values()].map(({coverageTotal, coverageItems, ...node}) => ({...node, coverage: coverageItems ? coverageTotal / coverageItems : 0}));
}

export function attentionScore(node: AttentionNode, metric: AttentionMetric, now = Date.now()): number {
	if (metric === "duration") return node.duration;
	if (metric === "opens") return node.opens;
	if (metric === "coverage") return node.coverage;
	if (!node.lastOpenedAt) return 0;
	return Math.max(0, 1 - (now - node.lastOpenedAt) / (90 * 86_400_000));
}

export interface StudyPathEdge {from: string; to: string; count: number}

export function buildStudyPath(sessions: StudySession[], limit = 12): StudyPathEdge[] {
	const chronological = [...sessions].sort((a, b) => a.openedAt - b.openedAt);
	const edges = new Map<string, StudyPathEdge>();
	for (let index = 1; index < chronological.length; index += 1) {
		const from = chronological[index - 1]?.filePath;
		const to = chronological[index]?.filePath;
		if (!from || !to || from === to) continue;
		const key = `${from}\n${to}`;
		const edge = edges.get(key) ?? {from, to, count: 0};
		edge.count += 1;
		edges.set(key, edge);
	}
	return [...edges.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
