import {ReadRecord} from "../interface/readRecord";
import {TimeUtils} from "../util/timeUtils";
import {StudySession} from "../interface/studySession";
import {PluginDataManager} from "./pluginDataManager";

/**
 * Stores per-day study history through Obsidian's Plugin.loadData/saveData API.
 * Keeping all plugin-owned data in data.json makes storage portable across
 * desktop and mobile without reaching into the vault adapter directly.
 */
export class DailyReadDataManager {
	constructor(private readonly dataManager: PluginDataManager) {}

	public async saveTodayData(category: string, data: ReadRecord) {
		const dateToday = TimeUtils.getDateToday();
		const existingData = await this.loadDailyData(dateToday);
		if (!existingData[category]) existingData[category] = {};
		existingData[category][data.fileId] = data;
		await this.dataManager.put("dailyData", dateToday, existingData);
	}

	public async saveSession(session: StudySession) {
		const date = TimeUtils.getDateFromTimestamp(session.openedAt);
		const existingData = await this.loadDailyData(date);
		if (!Array.isArray(existingData.sessions)) existingData.sessions = [];
		existingData.sessions.push(session);
		await this.dataManager.put("dailyData", date, existingData);
	}

	public async listDates(): Promise<string[]> {
		await this.dataManager.loadData();
		return Object.keys(this.dataManager.getCategory("dailyData") || {}).sort();
	}

	public async loadTodayData(): Promise<Record<string, any>> {
		return this.loadDailyData(TimeUtils.getDateToday());
	}

	public async loadDailyData(date: string): Promise<Record<string, any>> {
		await this.dataManager.loadData();
		return this.dataManager.get("dailyData", date) || {};
	}
}
