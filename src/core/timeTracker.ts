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
import {createSessionId} from "../util/sessionUtils";
import {classifySessionEngagement} from "../util/activityClassifier";

export class TimeTracker {
	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly statusBarManager: StatusBarManager;
	private readonly dailyReadDataManager: DailyReadDataManager;
	private readonly globalRefreshTime = 1000 * 6;
	private windowFocus = true;
	private lastRefreshAt = Date.now();
	private currentSession: StudySession | null = null;
	private operationQueue: Promise<void> = Promise.resolve();
	private lastInteractionRecordedAt = 0;

	constructor(plugin: StudyTimeStatisticsPlugin, app: App, dataManager: PluginDataManager, dailyReadDataManager: DailyReadDataManager) {
		this.app = app;
		this.dataManager = dataManager;
		this.dailyReadDataManager = dailyReadDataManager;
		this.statusBarManager = new StatusBarManager(plugin);

		plugin.registerEvent(this.app.workspace.on("file-open", () => { void this.handleFileChange(); }));
		plugin.registerEvent(this.app.workspace.on("active-leaf-change", () => { void this.handleFileChange(); }));
		plugin.registerInterval(window.setInterval(() => { this.handleRefresh(); }, this.globalRefreshTime));
		plugin.registerDomEvent(window, "focus", () => this.handleWindowFocus());
		plugin.registerDomEvent(window, "blur", () => this.handleWindowBlur());
		plugin.registerDomEvent(document, "keydown", () => this.recordInteraction());
		plugin.registerDomEvent(document, "pointerdown", () => this.recordInteraction());
		plugin.registerDomEvent(document, "scroll", () => this.recordInteraction(), true);
		this.app.workspace.onLayoutReady(() => { void this.handleFileChange(); });
	}

	private enqueue(operation: () => Promise<void>) {
		this.operationQueue = this.operationQueue.then(operation).catch(error => {
			console.error("Study Time Statistics tracking operation failed", error);
		});
		return this.operationQueue;
	}

	private handleRefresh() {
		void this.enqueue(async () => {
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
				const openedAt = Date.now();
				this.currentSession = {
					id: createSessionId(openedAt),
					fileId: record.fileId,
					filePath: activeFile.path,
					openedAt,
					closedAt: openedAt,
					duration: 0,
					source: "automatic",
					createdAt: openedAt,
					updatedAt: openedAt,
					interactionCount: 0,
					engagement: "unclassified"
				};
			}
			this.lastRefreshAt = Date.now();
			this.updateStatusBar();
		});
	}

	private recordInteraction(): void {
		const now = Date.now();
		if (!this.currentSession || !this.windowFocus || now - this.lastInteractionRecordedAt < 1_000) return;
		this.lastInteractionRecordedAt = now;
		this.currentSession.interactionCount = (this.currentSession.interactionCount ?? 0) + 1;
		this.currentSession.firstInteractionAt ??= now;
		this.currentSession.lastInteractionAt = now;
	}

	public getCurrentSessionDuration(filePath: string): number {
		if (!this.currentSession || this.currentSession.filePath !== filePath) return 0;
		const pending = this.needSuspendTimer() ? 0 : Math.min(Math.max(Date.now() - this.lastRefreshAt, 0), this.globalRefreshTime * 2.5);
		return this.currentSession.duration + pending;
	}

	private handleWindowFocus() {
		this.windowFocus = true;
		this.lastRefreshAt = Date.now();
	}

	private handleWindowBlur() {
		void this.enqueue(async () => {
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
		if (!fileId) return;
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
		await this.dailyReadDataManager.saveTodayData(readRecord);
	}

	public async saveTotalReadData(file: TFile, duration: number, openCount: number) {
		const readRecord: ReadRecord = this.buildReadData(file, duration, openCount, false);
		await this.dataManager.setReadRecord(readRecord.filePath, readRecord);
	}

	private buildReadData(file: TFile, duration: number, openCount: number, isDailyData: boolean): ReadRecord {
		if (isDailyData) {
			return {
				filePath: "",
				openCount: 0,
				fileId: this.getFileId(file.path) ?? this.getOrCreateFileId(file.path),
				duration
			};
		}
		return {
			fileId: this.getOrCreateFileId(file.path),
			filePath: file.path,
			duration,
			openCount,
			firstOpenedAt: this.dataManager.getReadRecord(file.path)?.firstOpenedAt,
			lastOpenedAt: this.dataManager.getReadRecord(file.path)?.lastOpenedAt
		};
	}

	private getOrCreateFileId(filePath: string): string {
		const readData = this.dataManager.getReadRecord(filePath);
		return readData?.fileId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	private getFileId(filePath: string): string | undefined {
		return this.dataManager.getReadRecord(filePath)?.fileId;
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
		await this.dataManager.setReadRecord(totalRecord.filePath, totalRecord);
		return totalRecord;
	}

	private async finishCurrentSession() {
		if (!this.currentSession) return;
		const closedAt = Date.now();
		const session: StudySession = {
			...this.currentSession,
			closedAt,
			updatedAt: closedAt,
			engagement: classifySessionEngagement(this.currentSession)
		};
		this.currentSession = null;
		await this.dailyReadDataManager.saveSession(session);
	}

	public getTotalReadData(file: TFile): ReadRecord | undefined {
		return this.dataManager.getReadRecord(RecordUtils.generateFileId(file));
	}

	public unload() {
		void this.enqueue(async () => {
			await this.flushElapsed();
			await this.finishCurrentSession();
		});
		this.statusBarManager.remove();
	}

	private isStrictMode(): boolean {
		return this.dataManager.getStrictMode();
	}

	private needSuspendTimer() {
		return this.isStrictMode() && !this.windowFocus;
	}
}
