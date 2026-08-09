import {App, Plugin, TFile, TFolder} from "obsidian";
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
		plugin: Plugin,
		private readonly app: App,
		private readonly dataManager: PluginDataManager
	) {
		plugin.registerEvent(this.app.vault.on("rename", (abstractFile, oldPath) => {
			if (abstractFile instanceof TFolder) {
				void this.onFolderRename(abstractFile, oldPath).catch(error => {
					console.error("Study Time Statistics failed to update a renamed folder", error);
				});
			} else if (abstractFile instanceof TFile) {
				void this.onFileRename(abstractFile, oldPath).catch(error => {
					console.error("Study Time Statistics failed to update a renamed file", error);
				});
			}
		}));
	}

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

	private async onFileRename(file: TFile, oldPath: string): Promise<void> {
		const readData = this.dataManager.getReadRecord(oldPath);
		if (!readData) return;

		await this.dataManager.deleteReadRecord(oldPath);
		await this.dataManager.setReadRecord(file.path, {...readData, filePath: file.path});
	}

	private async onFolderRename(folder: TFolder, oldPath: string): Promise<void> {
		await this.dataManager.loadData();
		const normalizedOldPath = oldPath.endsWith("/") ? oldPath.slice(0, -1) : oldPath;
		const filesToUpdate: Array<{oldPath: string; newPath: string; data: ReadRecord}> = [];

		for (const [storedPath, fileData] of Object.entries(this.dataManager.getReadData())) {
			if (storedPath !== normalizedOldPath && !storedPath.startsWith(`${normalizedOldPath}/`)) continue;
			const relativePath = storedPath === normalizedOldPath
				? ""
				: storedPath.substring(normalizedOldPath.length + 1);
			const newFilePath = relativePath === "" ? folder.path : `${folder.path}/${relativePath}`;
			if (this.app.vault.getFileByPath(newFilePath)) {
				filesToUpdate.push({oldPath: storedPath, newPath: newFilePath, data: fileData});
			}
		}

		for (const {oldPath: fileOldPath, newPath: fileNewPath, data} of filesToUpdate) {
			await this.dataManager.deleteReadRecord(fileOldPath);
			await this.dataManager.setReadRecord(fileNewPath, {...data, filePath: fileNewPath});
		}
	}
}
