import {StudySession} from "./studySession";

export interface StudyGoalSettings {
	dailyMinutes: number;
	weeklyMinutes: number;
}

export interface GoalDay {
	date: string;
	duration: number;
	target: number;
	reached: boolean;
}

export interface StudyGoalSummary {
	todayDuration: number;
	weekDuration: number;
	dailyTarget: number;
	weeklyTarget: number;
	todayRatio: number;
	weekRatio: number;
	reachedDays: number;
	currentGoalStreak: number;
	uncertainSessions: StudySession[];
	days: GoalDay[];
}
