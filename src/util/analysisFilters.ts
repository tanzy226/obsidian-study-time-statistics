import type {StudySession, StudySessionEngagement, StudySessionSource} from "../interface/studySession";

export interface SessionFilter {
	startAt: number;
	endAt: number;
	query?: string;
	pathPrefix?: string;
	source?: StudySessionSource | "all";
	engagement?: StudySessionEngagement | "all";
}

export interface SessionSummary {
	duration: number;
	sessions: number;
	notes: number;
	averageDuration: number;
}

export function filterSessions(sessions: StudySession[], filter: SessionFilter): StudySession[] {
	const query = filter.query?.trim().toLocaleLowerCase();
	return sessions.filter(session => session.openedAt >= filter.startAt && session.openedAt < filter.endAt)
		.filter(session => !filter.pathPrefix || session.filePath.startsWith(filter.pathPrefix))
		.filter(session => !query || session.filePath.toLocaleLowerCase().includes(query))
		.filter(session => !filter.source || filter.source === "all" || session.source === filter.source)
		.filter(session => !filter.engagement || filter.engagement === "all" || session.engagement === filter.engagement);
}

export function summarizeSessions(sessions: StudySession[]): SessionSummary {
	const duration = sessions.reduce((sum, session) => sum + session.duration, 0);
	return {
		duration,
		sessions: sessions.length,
		notes: new Set(sessions.map(session => session.filePath)).size,
		averageDuration: sessions.length ? duration / sessions.length : 0
	};
}

export function previousPeriod(filter: SessionFilter): SessionFilter {
	const span = Math.max(0, filter.endAt - filter.startAt);
	return {...filter, startAt: filter.startAt - span, endAt: filter.startAt};
}

export function percentChange(current: number, previous: number): number | undefined {
	if (previous === 0) return current === 0 ? 0 : undefined;
	return (current - previous) / previous * 100;
}
