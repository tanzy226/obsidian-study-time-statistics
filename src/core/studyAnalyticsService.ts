import type {App} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";
import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";
import {buildStudyAnalytics, DailyStudyPoint, StudyAnalyticsResult} from "./studyAnalytics";

export class StudyAnalyticsService {
	private cachedResult?: {revision: number; result: StudyAnalyticsResult};
	private inFlight?: {revision: number; promise: Promise<StudyAnalyticsResult>};

	constructor(
		private readonly app: App,
		private readonly dataManager: PluginDataManager
	) {}

	public async analyze(force = false): Promise<StudyAnalyticsResult> {
		const revision = this.dataManager.getRevision();
		if (!force && this.cachedResult?.revision === revision) return this.cachedResult.result;
		if (!force && this.inFlight?.revision === revision) return this.inFlight.promise;

		const promise = this.buildResult();
		this.inFlight = {revision, promise};
		try {
			const result = await promise;
			if (this.dataManager.getRevision() === revision) this.cachedResult = {revision, result};
			return result;
		} finally {
			if (this.inFlight?.promise === promise) this.inFlight = undefined;
		}
	}

	private async buildResult(): Promise<StudyAnalyticsResult> {
		await this.dataManager.loadData();
		const records: ReadRecord[] = Object.values(this.dataManager.getReadData())
			.filter(record => this.app.vault.getFileByPath(record.filePath) !== null);
		const recordById = new Map(records.map(record => [record.fileId, record]));
		const loadedDays = this.dataManager.getDailyReadDates()
			.map(date => ({date, data: this.dataManager.getDailyReadData(date)}))
			.filter((entry): entry is {date: string; data: NonNullable<typeof entry.data>} => entry.data !== undefined);
		const sessions: StudySession[] = [];
		const dailyPoints: DailyStudyPoint[] = [];

		for (const {date, data} of loadedDays) {
			const dailyRecords = Object.values(data.dailyReadData);
			const validDailyRecords = dailyRecords.filter(record => recordById.has(record.fileId));
			const daySessions: StudySession[] = data.sessions
				.filter(session => this.app.vault.getFileByPath(session.filePath) !== null);
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
