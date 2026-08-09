import {App, TFile} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";
import {RecordUtils} from "../util/recordUtils";
import {PluginDataManager} from "./pluginDataManager";
import {StatusBarManager} from "../view/display/statusBar/statusBarManager";
import {StatusBarFactory} from "../view/display/statusBar/statusBarFactory";
import {DailyReadDataManager} from "./dailyReadDataManager";
import StudyTimeStatisticsPlugin from "../main";
import {Context} from "../context/context";

interface ActiveSession {
	fileId: string;
	filePath: string;
	openedAt: number;
	duration: number;
}

export class TimeTracker {
	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly statusBarManager: StatusBarManager;
	private readonly dailyReadDataManager: DailyReadDataManager;
	private readonly globalRefreshTime = 1000 * 6;
	private windowFocus = true;
	private lastRefreshAt = Date.now();
	private currentSession: ActiveSession | null = null;
	private operationQueue: Promise<void> = Promise.resolve();

	constructor(plugin: StudyTimeStatisticsPlugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;
		this.dailyReadDataManager = dailyReadDataManager;
		this.statusBarManager = new StatusBarManager(plugin);

		plugin.registerEvent(this.app.workspace.on("file-open", () => this.handleFileChange()));
		plugin.registerEvent(this.app.workspace.on("active-leaf-change", () => this.handleFileChange()));
		plugin.registerInterval(window.setInterval(() => this.handleRefresh(), this.globalRefreshTime));
		plugin.registerDomEvent(window, "focus", () => this.handleWindowFocus());
		plugin.registerDomEvent(window, "blur", () => this.handleWindowBlur());
		this.app.workspace.onLayoutReady(() => this.handleFileChange());
	}

	private enqueue(operation: () => Promise<void>) {
		this.operationQueue = this.operationQueue.then(operation).catch(error => {
			console.error("Study Time Statistics tracking operation failed", error);
		});
		return this.operationQueue;
	}

	private handleRefresh() {
		this.enqueue(async () => {
			await this.flushElapsed();
			this.updateStatusBar();
		});
	}

	private updateStatusBar() {
		const currentFile = Context.getCurrentFile();
		if (currentFile) {
			const readData = this.getTotalReadData(currentFile);
			StatusBarFactory.createIconTextStatusBar(this.statusBarManager, readData?.duration ?? 0);
		} else {
			this.statusBarManager.remove();
		}
	}

	public handleFileChange() {
		return this.enqueue(async () => {
			await this.flushElapsed();
			const activeFile = this.app.workspace.getActiveFile();
			const currentFile = Context.getCurrentFile();
			if (currentFile === activeFile) return;

			await this.finishCurrentSession();
			Context.setCurrentFile(activeFile);
			if (activeFile) {
				const record = await this.incTotalReadCount(activeFile);
				this.currentSession = {
					fileId: record.fileId,
					filePath: activeFile.path,
					openedAt: Date.now(),
					duration: 0
				};
			}
			this.lastRefreshAt = Date.now();
			this.updateStatusBar();
		});
	}

	private handleWindowFocus() {
		this.windowFocus = true;
		this.lastRefreshAt = Date.now();
	}

	private handleWindowBlur() {
		this.enqueue(async () => {
			await this.flushElapsed();
			this.windowFocus = false;
		});
	}

	private async flushElapsed() {
		const now = Date.now();
		const elapsed = Math.min(Math.max(now - this.lastRefreshAt, 0), this.globalRefreshTime * 2.5);
		this.lastRefreshAt = now;
		const currentFile = Context.getCurrentFile();
		if (!currentFile || this.needSuspendTimer() || elapsed < 1) return;

		const dailyData = await this.dailyReadDataManager.loadTodayData();
		const fileId = this.getFileId(currentFile.path);
		const todayReadData = dailyData.dailyReadData?.[fileId];
		await this.saveDailyReadData(currentFile, (todayReadData?.duration || 0) + elapsed);
		await this.dataManager.loadData();
		const totalReadData = this.getTotalReadData(currentFile);
		await this.saveTotalReadData(
			currentFile,
			(totalReadData?.duration || 0) + elapsed,
			totalReadData?.openCount || 1
		);
		if (this.currentSession && this.currentSession.filePath === currentFile.path) {
			this.currentSession.duration += elapsed;
		}
	}

	public async saveDailyReadData(file: TFile, duration: number) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, 0, true);
		await this.dailyReadDataManager.saveTodayData("dailyReadData", readRecord);
	}

	public async saveTotalReadData(file: TFile, duration: number, openCount: number) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, openCount, false);
		await this.dataManager.put("readData", readRecord.filePath, readRecord);
	}

	private buildReadData(file: TFile, duration: number, openCount: number, isDailyData: boolean): ReadRecord {
		if (isDailyData) {
			return {filePath: "", openCount: 0, fileId: this.getFileId(file.path), duration};
		}
		return {
			fileId: this.getOrCreateFileId(file.path),
			filePath: file.path,
			duration,
			openCount,
			firstOpenedAt: this.dataManager.get("readData", file.path)?.firstOpenedAt,
			lastOpenedAt: this.dataManager.get("readData", file.path)?.lastOpenedAt
		};
	}

	private getOrCreateFileId(filePath: string) {
		const readData = this.dataManager.get("readData", filePath);
		return readData?.fileId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	private getFileId(filePath: string) {
		return this.dataManager.get("readData", filePath)?.fileId;
	}

	private async incTotalReadCount(file: TFile): Promise<ReadRecord> {
		await this.dataManager.loadData();
		const totalReadData = this.getTotalReadData(file);
		const totalRecord = this.buildReadData(
			file,
			totalReadData?.duration || 0,
			(totalReadData?.openCount || 0) + 1,
			false
		);
		totalRecord.firstOpenedAt ||= Date.now();
		totalRecord.lastOpenedAt = Date.now();
		await this.dataManager.put("readData", totalRecord.filePath, totalRecord);
		return totalRecord;
	}

	private async finishCurrentSession() {
		if (!this.currentSession) return;
		const session: StudySession = {
			...this.currentSession,
			closedAt: Date.now()
		};
		this.currentSession = null;
		await this.dailyReadDataManager.saveSession(session);
	}

	public getTotalReadData(file: TFile): ReadRecord | undefined {
		return this.dataManager.get("readData", RecordUtils.generateFileId(file));
	}

	public unload() {
		this.enqueue(async () => {
			await this.flushElapsed();
			await this.finishCurrentSession();
		});
		this.statusBarManager.remove();
	}

	private isStrictMode() {
		return this.dataManager.get("settings", "strictMode") ?? true;
	}

	private needSuspendTimer() {
		return this.isStrictMode() && !this.windowFocus;
	}
}
