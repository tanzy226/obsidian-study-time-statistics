import type {App} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {PluginDataManager} from "./pluginDataManager";

export interface LeaderboardEntry {
	fileRecord: ReadRecord;
	filePath: string;
	totalTime: number;
}

export interface StudyRankingEntry extends LeaderboardEntry {
	openCount: number;
	averageTime: number;
}

export class DataAnalyzer {
	constructor(
		private readonly app: App,
		private readonly dataManager: PluginDataManager
	) {}

	public analyzeLeaderboardTotal(): LeaderboardEntry[] {
		const rows = Object.values(this.dataManager.getReadData())
			.filter(record => this.app.vault.getFileByPath(record.filePath) !== null)
			.filter(record => record.duration > 60_000)
			.map(fileRecord => ({
				fileRecord,
				filePath: fileRecord.filePath,
				totalTime: fileRecord.duration
			}));
		return rows.sort((a, b) => b.totalTime - a.totalTime);
	}

	public analyzeStudyRankings(): {
		byOpenCount: StudyRankingEntry[];
		byTotalTime: StudyRankingEntry[];
		byAverageTime: StudyRankingEntry[];
	} {
		const rows = Object.values(this.dataManager.getReadData())
			.filter(record => this.app.vault.getFileByPath(record.filePath) !== null)
			.map(fileRecord => ({
				fileRecord,
				filePath: fileRecord.filePath,
				openCount: Math.max(0, fileRecord.openCount),
				totalTime: Math.max(0, fileRecord.duration),
				averageTime: fileRecord.openCount > 0
					? Math.max(0, fileRecord.duration) / fileRecord.openCount
					: 0
			}))
			.filter(row => row.openCount > 0);

		return {
			byOpenCount: [...rows].sort((a, b) => b.openCount - a.openCount).slice(0, 10),
			byTotalTime: [...rows].sort((a, b) => b.totalTime - a.totalTime).slice(0, 10),
			byAverageTime: [...rows].sort((a, b) => b.averageTime - a.averageTime).slice(0, 10)
		};
	}

}
