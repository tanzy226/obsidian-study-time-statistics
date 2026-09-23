import {ReadRecord} from "../interface/readRecord";
import {ReadingProgressEntry} from "../interface/readingProgress";
import {StudySession} from "../interface/studySession";

export interface StudyCockpitSummary {
	todayDuration: number;
	thisWeekDuration: number;
	previousWeekDuration: number;
	weekChange: number;
	bestHour: number | undefined;
	medianSessionDuration: number;
	deepReadingRatio: number;
	verifiedDurationRatio: number;
	needsReviewCount: number;
	coverageEntryCount: number;
	revisitNotes: ReadRecord[];
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function buildStudyCockpitSummary(
	sessions: StudySession[],
	readRecords: ReadRecord[],
	progressEntries: ReadingProgressEntry[],
	now = new Date()
): StudyCockpitSummary {
	const todayStart = startOfDay(now);
	const weekday = (now.getDay() + 6) % 7;
	const weekStart = todayStart - weekday * 86_400_000;
	const previousWeekStart = weekStart - 7 * 86_400_000;
	const durationIn = (from: number, to: number) => sessions
		.filter(session => session.openedAt >= from && session.openedAt < to)
		.reduce((sum, session) => sum + Math.max(0, session.duration), 0);
	const todayDuration = durationIn(todayStart, todayStart + 86_400_000);
	const thisWeekDuration = durationIn(weekStart, todayStart + 86_400_000);
	const previousWeekDuration = durationIn(previousWeekStart, weekStart);
	const hourDuration = Array.from({length: 24}, () => 0);
	for (const session of sessions) {
		const hour = new Date(session.openedAt).getHours();
		hourDuration[hour] = (hourDuration[hour] ?? 0) + Math.max(0, session.duration);
	}
	const bestDuration = Math.max(0, ...hourDuration);
	const bestHour = bestDuration > 0 ? hourDuration.indexOf(bestDuration) : undefined;
	const durations = sessions.map(session => Math.max(0, session.duration)).sort((a, b) => a - b);
	const medianSessionDuration = durations.length ? durations[Math.floor(durations.length / 2)] ?? 0 : 0;
	const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
	const deepDuration = durations.filter(duration => duration >= 5 * 60_000).reduce((sum, duration) => sum + duration, 0);
	const verifiedDuration = sessions
		.filter(session => session.engagement === "interactive" || session.engagement === "quiet-study")
		.reduce((sum, session) => sum + Math.max(0, session.duration), 0);
	const revisitBefore = todayStart - 7 * 86_400_000;
	const revisitNotes = readRecords
		.filter(record => (record.lastOpenedAt ?? 0) > 0 && (record.lastOpenedAt ?? 0) < revisitBefore)
		.sort((a, b) => (a.lastOpenedAt ?? 0) - (b.lastOpenedAt ?? 0) || b.duration - a.duration)
		.slice(0, 12);
	return {
		todayDuration,
		thisWeekDuration,
		previousWeekDuration,
		weekChange: previousWeekDuration > 0 ? (thisWeekDuration - previousWeekDuration) / previousWeekDuration : thisWeekDuration > 0 ? 1 : 0,
		bestHour,
		medianSessionDuration,
		deepReadingRatio: totalDuration > 0 ? deepDuration / totalDuration : 0,
		verifiedDurationRatio: totalDuration > 0 ? verifiedDuration / totalDuration : 0,
		needsReviewCount: sessions.filter(session => session.engagement === "uncertain").length,
		coverageEntryCount: progressEntries.length,
		revisitNotes
	};
}
