import {App, Plugin, TFile, TFolder} from "obsidian";
import {PluginDataManager} from "./pluginDataManager";
import {DailyReadDataManager} from "./dailyReadDataManager";

export class DataAnalyzer {

	private readonly app: App;
	private readonly dataManager: PluginDataManager;

	constructor(plugin: Plugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;

		// Change data reference when the file is renamed
		plugin.registerEvent(this.app.vault.on('rename', (absFile, oldPath) => {
			// Handle folder rename: update all files under the folder
			if (absFile instanceof TFolder) {
				this.onFolderRename(absFile, oldPath);
				return;
			}
			
			// Handle file rename
			if (absFile instanceof TFile) {
				this.onFileRename(absFile, oldPath);
				return;
			}
		}));
	}

	public analyzeLeaderboardTotal() {

		const readData = this.dataManager.getCategory("readData");

		if (!readData) {
			return;
		}

		const leaderboard = Object.keys(readData).map(fileId => {
			const fileRecord = readData[fileId];
			const totalTime = fileRecord.duration;
			const filePath = readData[fileId].filePath;
			return {
				fileRecord,
				filePath,
				totalTime,
			};
		});

		const filteredLeaderboard = leaderboard.filter(item => {
			const file = this.app.vault.getFileByPath(item.filePath);
			if (!file) {
				return false; // File was deleted
			}
			// Filter out files with less than 1 minute
			return item.totalTime > 60 * 1000;
		});

		filteredLeaderboard.sort((a, b) => b.totalTime - a.totalTime);
		return filteredLeaderboard;
	}

	public analyzeStudyRankings() {
		const readData = this.dataManager.getCategory("readData");
		const rows = Object.values(readData || {})
			.filter((record: any) => record && record.filePath && this.app.vault.getFileByPath(record.filePath))
			.map((record: any) => ({
				fileRecord: record,
				filePath: record.filePath,
				openCount: Math.max(0, Number(record.openCount) || 0),
				totalTime: Math.max(0, Number(record.duration) || 0),
				averageTime: record.openCount > 0 ? Math.max(0, Number(record.duration) || 0) / record.openCount : 0
			}))
			.filter((row: any) => row.openCount > 0);

		return {
			byOpenCount: [...rows].sort((a, b) => b.openCount - a.openCount).slice(0, 10),
			byTotalTime: [...rows].sort((a, b) => b.totalTime - a.totalTime).slice(0, 10),
			byAverageTime: [...rows].sort((a, b) => b.averageTime - a.averageTime).slice(0, 10)
		};
	}

	private async onFileRename(file: TFile, oldPath: string) {
		const readData = this.dataManager.get('readData', oldPath);
		if (!readData) {
			return;
		}

		readData.filePath = file.path;
		// Must await to avoid race condition between delete and put
		await this.dataManager.delete('readData', oldPath);
		await this.dataManager.put('readData', file.path, readData);
	}

	private async onFolderRename(folder: TFolder, oldPath: string) {
		await this.dataManager.loadData();
		const readDataCategory = this.dataManager.getCategory("readData");
		
		if (!readDataCategory) {
			return;
		}

		const normalizedOldPath = oldPath.endsWith('/') ? oldPath.slice(0, -1) : oldPath;
		const newPath = folder.path;
		
		const filesToUpdate: Array<{oldPath: string, newPath: string, data: any}> = [];
		
		for (const storedPath in readDataCategory) {
			if (storedPath === normalizedOldPath || storedPath.startsWith(normalizedOldPath + '/')) {
				const fileData = readDataCategory[storedPath];
				if (fileData && fileData.filePath) {
					const relativePath = storedPath === normalizedOldPath 
						? '' 
						: storedPath.substring(normalizedOldPath.length + 1);
					
					const newFilePath = relativePath === '' 
						? newPath 
						: `${newPath}/${relativePath}`;
					
					const file = this.app.vault.getFileByPath(newFilePath);
					if (file) {
						filesToUpdate.push({
							oldPath: storedPath,
							newPath: newFilePath,
							data: fileData
						});
					}
				}
			}
		}

		for (const {oldPath: fileOldPath, newPath: fileNewPath, data} of filesToUpdate) {
			data.filePath = fileNewPath;
			await this.dataManager.delete('readData', fileOldPath);
			await this.dataManager.put('readData', fileNewPath, data);
		}
	}

}
