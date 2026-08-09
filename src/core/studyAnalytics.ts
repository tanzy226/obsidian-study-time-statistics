import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";

export interface DailyStudyPoint {
	date: string;
	totalTime: number;
	sessionCount: number;
	noteCount: number;
}

export interface NoteStudyRow {
	filePath: string;
	openCount: number;
	totalTime: number;
	averageTime: number;
	longestSession: number;
	activeDays: number;
	currentStreak: number;
	longestStreak: number;
	lastReadAt: number;
}

export interface StudyAnalyticsResult {
	summary: {
		noteCount: number;
		openCount: number;
		totalTime: number;
		averageTime: number;
		activeDays: number;
		currentStreak: number;
		longestStreak: number;
		todayTime: number;
		todaySessions: number;
	};
	daily: DailyStudyPoint[];
	hourly: Array<{label: string; count: number; duration: number}>;
	weekdays: Array<{label: string; count: number; duration: number}>;
	sessionBuckets: Array<{label: string; count: number}>;
	rankings: {
		byOpenCount: NoteStudyRow[];
		byTotalTime: NoteStudyRow[];
		byAverageTime: NoteStudyRow[];
		byLongestSession: NoteStudyRow[];
		byActiveDays: NoteStudyRow[];
	};
	folders: Array<{folder: string; noteCount: number; openCount: number; totalTime: number}>;
	recentSessions: StudySession[];
	notes: NoteStudyRow[];
}

function normalizeDateKey(date: string): string {
	const parts = date.split("-").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return date;
	return `${parts[0] ?? 0}-${String(parts[1] ?? 0).padStart(2, "0")}-${String(parts[2] ?? 0).padStart(2, "0")}`;
}

function localDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string): Date {
	const [year, month, day] = key.split("-").map(Number);
	return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function calculateStreaks(activeDateKeys: string[], now: Date): {current: number; longest: number} {
	const unique = [...new Set(activeDateKeys.map(normalizeDateKey))].sort();
	if (!unique.length) return {current: 0, longest: 0};

	let longest = 1;
	let run = 1;
	for (let index = 1; index < unique.length; index++) {
		const previousKey = unique[index - 1];
		const currentKey = unique[index];
		if (!previousKey || !currentKey) continue;
		const previous = dateFromKey(previousKey);
		const current = dateFromKey(currentKey);
		const dayDiff = Math.round((current.getTime() - previous.getTime()) / 86400000);
		run = dayDiff === 1 ? run + 1 : 1;
		longest = Math.max(longest, run);
	}

	const today = localDateKey(now.getTime());
	const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
	const yesterday = localDateKey(yesterdayDate.getTime());
	const last = unique[unique.length - 1];
	if (last !== today && last !== yesterday) return {current: 0, longest};

	let currentRun = 1;
	for (let index = unique.length - 1; index > 0; index--) {
		const newerKey = unique[index];
		const olderKey = unique[index - 1];
		if (!newerKey || !olderKey) continue;
		const newer = dateFromKey(newerKey);
		const older = dateFromKey(olderKey);
		if (Math.round((newer.getTime() - older.getTime()) / 86400000) !== 1) break;
		currentRun++;
	}
	return {current: currentRun, longest};
}

export function buildStudyAnalytics(
	readRecords: ReadRecord[],
	dailyPoints: DailyStudyPoint[],
	sessions: StudySession[],
	now = new Date()
): StudyAnalyticsResult {
	const normalizedDaily = dailyPoints
		.map(point => ({...point, date: normalizeDateKey(point.date)}))
		.sort((a, b) => a.date.localeCompare(b.date));
	const activeDates = normalizedDaily.filter(point => point.totalTime > 0 || point.sessionCount > 0).map(point => point.date);
	const streaks = calculateStreaks(activeDates, now);
	const todayKey = localDateKey(now.getTime());
	const today = normalizedDaily.find(point => point.date === todayKey);

	const longestByPath = new Map<string, number>();
	const lastReadByPath = new Map<string, number>();
	for (const session of sessions) {
		longestByPath.set(session.filePath, Math.max(longestByPath.get(session.filePath) || 0, session.duration || 0));
		lastReadByPath.set(session.filePath, Math.max(lastReadByPath.get(session.filePath) || 0, session.closedAt || session.openedAt || 0));
	}

	const activeDaysByPath = new Map<string, Set<string>>();
	for (const session of sessions) {
		if (!activeDaysByPath.has(session.filePath)) activeDaysByPath.set(session.filePath, new Set());
		activeDaysByPath.get(session.filePath)?.add(localDateKey(session.openedAt));
	}

	const rows: NoteStudyRow[] = readRecords
		.filter(record => record && record.filePath)
		.map(record => {
			const openCount = Math.max(0, Number(record.openCount) || 0);
			const totalTime = Math.max(0, Number(record.duration) || 0);
			const noteDates = [...(activeDaysByPath.get(record.filePath) || new Set<string>())];
			const noteStreaks = calculateStreaks(noteDates, now);
			return {
				filePath: record.filePath,
				openCount,
				totalTime,
				averageTime: openCount ? totalTime / openCount : 0,
				longestSession: longestByPath.get(record.filePath) || 0,
				activeDays: activeDaysByPath.get(record.filePath)?.size || 0,
				currentStreak: noteStreaks.current,
				longestStreak: noteStreaks.longest,
				lastReadAt: Math.max(lastReadByPath.get(record.filePath) || 0, record.lastOpenedAt || 0)
			};
		})
		.filter(row => row.openCount > 0 || row.totalTime > 0);

	const hourly = Array.from({length: 24}, (_, hour) => ({label: String(hour).padStart(2, "0"), count: 0, duration: 0}));
	const weekdayLabels = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
	const weekdays = weekdayLabels.map(label => ({label, count: 0, duration: 0}));
	for (const session of sessions) {
		const date = new Date(session.openedAt);
		const hour = date.getHours();
		const weekday = date.getDay();
		const hourlyPoint = hourly[hour];
		const weekdayPoint = weekdays[weekday];
		if (hourlyPoint) {
			hourlyPoint.count++;
			hourlyPoint.duration += Math.max(0, session.duration || 0);
		}
		if (weekdayPoint) {
			weekdayPoint.count++;
			weekdayPoint.duration += Math.max(0, session.duration || 0);
		}
	}

	const sessionBuckets = [
		{label: "sessionUnder1", count: 0},
		{label: "session1To5", count: 0},
		{label: "session5To15", count: 0},
		{label: "session15To30", count: 0},
		{label: "session30To60", count: 0},
		{label: "session60Plus", count: 0}
	];
	for (const session of sessions) {
		const minutes = Math.max(0, session.duration || 0) / 60000;
		const index = minutes < 1 ? 0 : minutes < 5 ? 1 : minutes < 15 ? 2 : minutes < 30 ? 3 : minutes < 60 ? 4 : 5;
		const bucket = sessionBuckets[index];
		if (bucket) bucket.count++;
	}

	const folderMap = new Map<string, {folder: string; noteCount: number; openCount: number; totalTime: number}>();
	for (const row of rows) {
		const folder = row.filePath.includes("/") ? row.filePath.split("/")[0] ?? "__vault_root__" : "__vault_root__";
		const aggregate = folderMap.get(folder) || {folder, noteCount: 0, openCount: 0, totalTime: 0};
		aggregate.noteCount++;
		aggregate.openCount += row.openCount;
		aggregate.totalTime += row.totalTime;
		folderMap.set(folder, aggregate);
	}

	const totalOpens = rows.reduce((sum, row) => sum + row.openCount, 0);
	const totalTime = rows.reduce((sum, row) => sum + row.totalTime, 0);
	const sortTop = (key: keyof NoteStudyRow) => [...rows].sort((a, b) => Number(b[key]) - Number(a[key])).slice(0, 10);

	return {
		summary: {
			noteCount: rows.length,
			openCount: totalOpens,
			totalTime,
			averageTime: totalOpens ? totalTime / totalOpens : 0,
			activeDays: activeDates.length,
			currentStreak: streaks.current,
			longestStreak: streaks.longest,
			todayTime: today?.totalTime || 0,
			todaySessions: today?.sessionCount || 0
		},
		daily: normalizedDaily,
		hourly,
		weekdays,
		sessionBuckets,
		rankings: {
			byOpenCount: sortTop("openCount"),
			byTotalTime: sortTop("totalTime"),
			byAverageTime: sortTop("averageTime"),
			byLongestSession: sortTop("longestSession"),
			byActiveDays: sortTop("activeDays")
		},
		folders: [...folderMap.values()].sort((a, b) => b.totalTime - a.totalTime),
		recentSessions: [...sessions].sort((a, b) => b.openedAt - a.openedAt).slice(0, 30),
		notes: rows
	};
}
