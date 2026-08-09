import {App} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";
import {DailyReadDataManager} from "./dailyReadDataManager";
import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";
import {buildStudyAnalytics, DailyStudyPoint, StudyAnalyticsResult} from "./studyAnalytics";

export class StudyAnalyticsService {
	constructor(
		private readonly app: App,
		private readonly dataManager: PluginDataManager,
		private readonly dailyReadDataManager: DailyReadDataManager
	) {}

	public async analyze(): Promise<StudyAnalyticsResult> {
		await this.dataManager.loadData();
		const records = Object.values(this.dataManager.getCategory("readData") || {})
			.filter((record: any) => record?.filePath && this.app.vault.getFileByPath(record.filePath)) as ReadRecord[];
		const recordById = new Map(records.map(record => [record.fileId, record]));
		const dates = await this.dailyReadDataManager.listDates();
		const loadedDays = await Promise.all(dates.map(async date => ({date, data: await this.dailyReadDataManager.loadDailyData(date)})));
		const sessions: StudySession[] = [];
		const dailyPoints: DailyStudyPoint[] = [];

		for (const {date, data} of loadedDays) {
			const dailyRecords = Object.values(data.dailyReadData || {}) as ReadRecord[];
			const validDailyRecords = dailyRecords.filter(record => record && recordById.has(record.fileId));
			const daySessions = (Array.isArray(data.sessions) ? data.sessions : [])
				.filter((session: StudySession) => session?.filePath && this.app.vault.getFileByPath(session.filePath));
			sessions.push(...daySessions);
			dailyPoints.push({
				date,
				totalTime: validDailyRecords.reduce((sum, record) => sum + (Number(record.duration) || 0), 0),
				sessionCount: daySessions.length,
				noteCount: validDailyRecords.filter(record => (Number(record.duration) || 0) > 0).length
			});
		}

		return buildStudyAnalytics(records, dailyPoints, sessions);
	}
}
