import {StudyGoalSettings, StudyGoalSummary} from "../interface/studyGoals";
import {StudySession} from "../interface/studySession";

function dayKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function buildStudyGoalSummary(
	sessions: StudySession[],
	settings: StudyGoalSettings,
	now = new Date()
): StudyGoalSummary {
	const dailyTarget = Math.max(0, settings.dailyMinutes) * 60_000;
	const weeklyTarget = Math.max(0, settings.weeklyMinutes) * 60_000;
	const durationByDay = new Map<string, number>();
	for (const session of sessions) {
		const key = dayKey(session.openedAt);
		durationByDay.set(key, (durationByDay.get(key) ?? 0) + Math.max(0, session.duration));
	}
	const todayStart = startOfDay(now);
	const days = Array.from({length: 28}, (_, offset) => {
		const timestamp = todayStart - (27 - offset) * 86_400_000;
		const date = dayKey(timestamp);
		const duration = durationByDay.get(date) ?? 0;
		return {date, duration, target: dailyTarget, reached: dailyTarget > 0 && duration >= dailyTarget};
	});
	let currentGoalStreak = 0;
	for (let index = days.length - 1; index >= 0; index--) {
		const day = days[index];
		if (!day?.reached) break;
		currentGoalStreak++;
	}
	const weekday = (now.getDay() + 6) % 7;
	const weekStart = todayStart - weekday * 86_400_000;
	const weekDuration = sessions
		.filter(session => session.openedAt >= weekStart && session.openedAt < todayStart + 86_400_000)
		.reduce((sum, session) => sum + Math.max(0, session.duration), 0);
	const todayDuration = durationByDay.get(dayKey(now.getTime())) ?? 0;
	return {
		todayDuration,
		weekDuration,
		dailyTarget,
		weeklyTarget,
		todayRatio: dailyTarget > 0 ? todayDuration / dailyTarget : 0,
		weekRatio: weeklyTarget > 0 ? weekDuration / weeklyTarget : 0,
		reachedDays: days.filter(day => day.reached).length,
		currentGoalStreak,
		uncertainSessions: sessions.filter(session => session.engagement === "uncertain").sort((a, b) => b.openedAt - a.openedAt),
		days
	};
}
