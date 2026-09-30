import type {App} from "obsidian";
import {DailyReadData, PluginDataManager} from "./pluginDataManager";
import type {DailyReadDataManager} from "./dailyReadDataManager";

export interface DailyStats {
	date: string;
	noteCount: number;
	totalDuration: number;
	notes: Array<{filePath: string; fileId: string; duration: number}>;
}

export interface MonthlyStats {
	year: number;
	month: number;
	noteCount: number;
	totalDuration: number;
	focusDays: number;
	dailyStats: DailyStats[];
}

export interface YearlyStats {
	year: number;
	noteCount: number;
	totalDuration: number;
	focusDays: number;
	monthlyStats: MonthlyStats[];
}

export interface WeeklyStats {
	startDate: string;
	endDate: string;
	noteCount: number;
	totalDuration: number;
	focusDays: number;
	dailyStats: DailyStats[];
}

export interface TotalStats {
	noteCount: number;
	totalDuration: number;
	focusDays: number;
}

export interface TotalOverview {
	total: TotalStats;
	recentYears: Array<{year: number; totalDuration: number; focusDays: number; noteCount: number}>;
}

function dateKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function normalizeDateKey(value: string): string {
	const [year, month, day] = value.split("-").map(Number);
	return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
		? `${year}-${month}-${day}`
		: value;
}

export class FocusDataAggregator {
	constructor(
		_app: App,
		private readonly dataManager: PluginDataManager,
		_dailyReadDataManager: DailyReadDataManager
	) {}

	private snapshot(): {daily: Map<string, DailyReadData>; paths: Map<string, string>} {
		const daily = new Map<string, DailyReadData>();
		for (const [date, value] of Object.entries(this.dataManager.getAllDailyReadData())) {
			daily.set(normalizeDateKey(date), value);
		}
		const paths = new Map<string, string>();
		for (const [path, record] of Object.entries(this.dataManager.getReadData())) paths.set(record.fileId, path);
		return {daily, paths};
	}

	private dailyStats(date: string, snapshot: ReturnType<FocusDataAggregator["snapshot"]>): DailyStats {
		const normalizedDate = normalizeDateKey(date);
		const data = snapshot.daily.get(normalizedDate);
		if (!data) return {date: normalizedDate, noteCount: 0, totalDuration: 0, notes: []};
		const notes: DailyStats["notes"] = [];
		let totalDuration = 0;
		for (const [fileId, record] of Object.entries(data.dailyReadData)) {
			const duration = Math.max(0, record.duration);
			totalDuration += duration;
			const filePath = record.filePath || snapshot.paths.get(fileId) || "";
			if (filePath) notes.push({filePath, fileId, duration});
		}
		return {date: normalizedDate, noteCount: notes.length, totalDuration, notes};
	}

	private monthlyStats(year: number, month: number, snapshot: ReturnType<FocusDataAggregator["snapshot"]>): MonthlyStats {
		const dailyStats: DailyStats[] = [];
		const notes = new Set<string>();
		let totalDuration = 0;
		for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
			const stats = this.dailyStats(`${year}-${month}-${day}`, snapshot);
			if (stats.totalDuration <= 0) continue;
			dailyStats.push(stats);
			totalDuration += stats.totalDuration;
			for (const note of stats.notes) notes.add(note.fileId);
		}
		return {year, month, noteCount: notes.size, totalDuration, focusDays: dailyStats.length, dailyStats};
	}

	private yearlyStats(year: number, snapshot: ReturnType<FocusDataAggregator["snapshot"]>): YearlyStats {
		const monthlyStats: MonthlyStats[] = [];
		const notes = new Set<string>();
		let totalDuration = 0;
		let focusDays = 0;
		for (let month = 1; month <= 12; month++) {
			const stats = this.monthlyStats(year, month, snapshot);
			if (stats.totalDuration <= 0) continue;
			monthlyStats.push(stats);
			totalDuration += stats.totalDuration;
			focusDays += stats.focusDays;
			for (const day of stats.dailyStats) for (const note of day.notes) notes.add(note.fileId);
		}
		return {year, noteCount: notes.size, totalDuration, focusDays, monthlyStats};
	}

	public async getDailyStats(date: string): Promise<DailyStats> {
		await this.dataManager.loadData();
		const snapshot = this.snapshot();
		return this.dailyStats(date, snapshot);
	}

	public async getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
		await this.dataManager.loadData();
		const snapshot = this.snapshot();
		return this.monthlyStats(year, month, snapshot);
	}

	public async getWeeklyStats(date: Date): Promise<WeeklyStats> {
		await this.dataManager.loadData();
		const snapshot = this.snapshot();
		const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		const dailyStats: DailyStats[] = [];
		const notes = new Set<string>();
		let totalDuration = 0;
		for (let offset = 0; offset < 7; offset++) {
			const day = new Date(start);
			day.setDate(day.getDate() + offset);
			const stats = this.dailyStats(dateKey(day), snapshot);
			if (stats.totalDuration <= 0) continue;
			dailyStats.push(stats);
			totalDuration += stats.totalDuration;
			for (const note of stats.notes) notes.add(note.fileId);
		}
		return {startDate: dateKey(start), endDate: dateKey(end), noteCount: notes.size, totalDuration, focusDays: dailyStats.length, dailyStats};
	}

	public async getYearlyStats(year: number): Promise<YearlyStats> {
		await this.dataManager.loadData();
		const snapshot = this.snapshot();
		return this.yearlyStats(year, snapshot);
	}

	public async getTotalOverview(now = new Date()): Promise<TotalOverview> {
		await this.dataManager.loadData();
		const snapshot = this.snapshot();
		const notes = new Set<string>();
		let totalDuration = 0;
		let focusDays = 0;
		for (const date of snapshot.daily.keys()) {
			const stats = this.dailyStats(date, snapshot);
			if (stats.totalDuration <= 0) continue;
			totalDuration += stats.totalDuration;
			focusDays++;
			for (const note of stats.notes) notes.add(note.fileId);
		}
		const storedYears = [...snapshot.daily.keys()].map(date => Number(date.split("-")[0])).filter(year => Number.isInteger(year) && year >= 1970 && year <= now.getFullYear());
		const firstYear = storedYears.length > 0 ? Math.min(...storedYears) : now.getFullYear();
		const recentYears: TotalOverview["recentYears"] = [];
		for (let year = firstYear; year <= now.getFullYear(); year++) {
			const stats = this.yearlyStats(year, snapshot);
			if (stats.totalDuration > 0 || year === now.getFullYear()) {
				recentYears.push({year, totalDuration: stats.totalDuration, focusDays: stats.focusDays, noteCount: stats.noteCount});
			}
		}
		return {total: {noteCount: notes.size, totalDuration, focusDays}, recentYears};
	}

	public async getRecentYearsStats(): Promise<TotalOverview["recentYears"]> {
		return (await this.getTotalOverview()).recentYears;
	}

	public async getTotalStats(): Promise<TotalStats> {
		return (await this.getTotalOverview()).total;
	}
}
