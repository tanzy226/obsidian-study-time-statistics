import {ReadRecord} from "../interface/readRecord";
import {TimeUtils} from "../util/timeUtils";
import {StudySession} from "../interface/studySession";
import {DailyReadData, PluginDataManager} from "./pluginDataManager";

function emptyDailyData(): DailyReadData {
	return {dailyReadData: {}, sessions: []};
}

/** Stores per-day study history in Obsidian's plugin data.json file. */
export class DailyReadDataManager {
	constructor(private readonly dataManager: PluginDataManager) {}

	public async saveTodayData(data: ReadRecord): Promise<void> {
		const dateToday = TimeUtils.getDateToday();
		const existingData = await this.loadDailyData(dateToday);
		existingData.dailyReadData[data.fileId] = data;
		await this.dataManager.setDailyReadData(dateToday, existingData);
	}

	public async saveSession(session: StudySession): Promise<void> {
		const date = TimeUtils.getDateFromTimestamp(session.openedAt);
		const existingData = await this.loadDailyData(date);
		existingData.sessions.push(session);
		await this.dataManager.setDailyReadData(date, existingData);
	}

	public async listDates(): Promise<string[]> {
		await this.dataManager.loadData();
		return this.dataManager.getDailyReadDates();
	}

	public async loadTodayData(): Promise<DailyReadData> {
		return this.loadDailyData(TimeUtils.getDateToday());
	}

	public async loadDailyData(date: string): Promise<DailyReadData> {
		await this.dataManager.loadData();
		return this.dataManager.getDailyReadData(date) ?? emptyDailyData();
	}
}
