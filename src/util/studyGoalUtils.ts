import {StudyGoalSettings, StudyGoalSummary} from "../interface/studyGoals";
import {StudySession} from "../interface/studySession";

function dayKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildStudyGoalSummary(
	sessions: StudySession[],
	settings: StudyGoalSettings,
	now = new Date(),
	recordedDurations?: Readonly<Record<string, number>>
): StudyGoalSummary {
	const dailyTarget = Math.max(0, settings.dailyMinutes) * 60_000;
	const weeklyTarget = Math.max(0, settings.weeklyMinutes) * 60_000;
	const durationByDay = new Map<string, number>();
	for (const session of sessions) {
		const key = dayKey(session.openedAt);
		durationByDay.set(key, (durationByDay.get(key) ?? 0) + Math.max(0, session.duration));
	}
	if (recordedDurations) {
		durationByDay.clear();
		for (const [date, duration] of Object.entries(recordedDurations)) {
			durationByDay.set(date, Math.max(0, duration));
		}
	}
	const days = Array.from({length: 28}, (_, offset) => {
		const dateValue = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		dateValue.setDate(dateValue.getDate() - (27 - offset));
		const timestamp = dateValue.getTime();
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
	const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	weekStartDate.setDate(weekStartDate.getDate() - weekday);
	let weekDuration = 0;
	for (let offset = 0; offset <= weekday; offset++) {
		const dateValue = new Date(weekStartDate);
		dateValue.setDate(dateValue.getDate() + offset);
		weekDuration += durationByDay.get(dayKey(dateValue.getTime())) ?? 0;
	}
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
