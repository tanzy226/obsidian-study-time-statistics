import type {ReadingProgressEntry} from "../interface/readingProgress";
import type {ReadRecord} from "../interface/readRecord";
import type {StudySession} from "../interface/studySession";

export type DataHealthIssueKind = "duplicate-session" | "invalid-session" | "missing-note" | "orphan-progress";

export interface DataHealthIssue {
	kind: DataHealthIssueKind;
	id: string;
	filePath: string;
}

export interface DataHealthReport {
	checkedAt: number;
	issues: DataHealthIssue[];
	sessionCount: number;
	noteCount: number;
	progressCount: number;
}

export function inspectDataHealth(
	readData: Readonly<Record<string, ReadRecord>>,
	sessions: StudySession[],
	progressEntries: ReadingProgressEntry[],
	existingPaths: ReadonlySet<string>,
	checkedAt = Date.now()
): DataHealthReport {
	const issues: DataHealthIssue[] = [];
	const seenSessionIds = new Set<string>();
	for (const session of sessions) {
		if (seenSessionIds.has(session.id)) issues.push({kind: "duplicate-session", id: session.id, filePath: session.filePath});
		seenSessionIds.add(session.id);
		if (!Number.isFinite(session.duration) || session.duration < 0 || session.closedAt < session.openedAt) {
			issues.push({kind: "invalid-session", id: session.id, filePath: session.filePath});
		}
		if (session.filePath && !existingPaths.has(session.filePath)) {
			issues.push({kind: "missing-note", id: session.id, filePath: session.filePath});
		}
	}
	for (const entry of progressEntries) {
		if (entry.filePath && !existingPaths.has(entry.filePath)) {
			issues.push({kind: "orphan-progress", id: entry.id, filePath: entry.filePath});
		}
	}
	return {
		checkedAt,
		issues,
		sessionCount: sessions.length,
		noteCount: Object.keys(readData).length,
		progressCount: progressEntries.length
	};
}

export function repairSessions(sessions: StudySession[]): StudySession[] {
	const byId = new Map<string, StudySession>();
	for (const session of sessions) {
		if (!session.id || !Number.isFinite(session.duration) || session.duration < 0 || session.closedAt < session.openedAt) continue;
		const existing = byId.get(session.id);
		if (!existing || session.updatedAt > existing.updatedAt) byId.set(session.id, {...session});
	}
	return [...byId.values()].sort((a, b) => b.openedAt - a.openedAt);
}
