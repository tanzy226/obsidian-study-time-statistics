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
import {isIdle} from "../util/trackingPrecision";
import {DataSafetyError} from "./dataSafetyError";

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
	private focusRevision = 0;

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
		plugin.registerDomEvent(document, "touchstart", () => this.recordInteraction(), {passive: true});
		plugin.registerDomEvent(document, "visibilitychange", () => {
			if (document.hidden) this.handleWindowBlur(); else this.handleWindowFocus();
		});
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
			Context.setCurrentFile(null);
			if (activeFile) {
				const record = await this.incTotalReadCount(activeFile);
				Context.setCurrentFile(activeFile);
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
				this.lastInteractionRecordedAt = openedAt;
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
		this.focusRevision += 1;
		this.windowFocus = true;
		this.lastRefreshAt = Date.now();
	}

	private handleWindowBlur() {
		const revision = ++this.focusRevision;
		void this.enqueue(async () => {
			await this.flushElapsed();
			if (revision === this.focusRevision) this.windowFocus = false;
		});
	}

	private async flushElapsed() {
		const now = Date.now();
		const elapsed = Math.min(Math.max(now - this.lastRefreshAt, 0), this.globalRefreshTime * 2.5);
		this.lastRefreshAt = now;
		const currentFile = Context.getCurrentFile();
		if (!currentFile || this.needSuspendTimer() || elapsed < 1) return;

		const path = this.currentSession?.filePath ?? currentFile.path;
		const fileId = this.getFileId(path);
		if (!fileId) return;
		await this.dataManager.addTrackedTime(path, fileId, elapsed, now);
		if (this.currentSession && this.currentSession.filePath === path) {
			this.currentSession.duration += elapsed;
		}
	}

	private getOrCreateFileId(filePath: string): string {
		const readData = this.dataManager.getReadRecord(filePath);
		return readData?.fileId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	private getFileId(filePath: string): string | undefined {
		return this.dataManager.getReadRecord(filePath)?.fileId;
	}

	private async incTotalReadCount(file: TFile): Promise<ReadRecord> {
		const openedAt = Date.now();
		return this.dataManager.recordFileOpened(file.path, this.getOrCreateFileId(file.path), openedAt);
	}

	public withFileRename(oldPath: string, newPath: string, folder: boolean, action: () => Promise<void>): Promise<void> {
		const task = this.operationQueue.then(async () => {
			const path = this.currentSession?.filePath;
			const affected = path && (path === oldPath || (folder && path.startsWith(`${oldPath}/`)));
			try {
				await action();
				if (affected && this.currentSession) this.currentSession.filePath = newPath + path.slice(oldPath.length);
			} catch (error) {
				if (affected) {
					try {
						await this.finishCurrentSession();
					} catch (closeError) {
						console.error("Study Time Statistics could not close the session at its original path", closeError);
					} finally {
						this.currentSession = null;
						Context.setCurrentFile(null);
						this.lastRefreshAt = Date.now();
					}
				}
				throw error;
			}
		});
		this.operationQueue = task.catch(() => undefined);
		return task;
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
		try {
			await this.dailyReadDataManager.saveSession(session);
			this.currentSession = null;
		} catch (error) {
			if (!(error instanceof DataSafetyError) || error.reason !== "invalid-snapshot") throw error;
			// The accumulated ticks are already saved; do not write an invalid session over them.
			this.currentSession = null;
			console.warn("Study Time Statistics kept tracked time but could not close an out-of-range session");
		}
	}

	public async withHistoryReplacement(action: () => Promise<void>): Promise<void> {
		const task = this.operationQueue.then(async () => {
			await this.flushElapsed();
			await this.finishCurrentSession();
			try {
				await action();
			} finally {
				Context.setCurrentFile(null);
				this.lastRefreshAt = Date.now();
			}
		});
		this.operationQueue = task.catch(() => undefined);
		try {
			await task;
		} finally {
			void this.handleFileChange();
		}
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
		if (this.isStrictMode() && !this.windowFocus) return true;
		return this.currentSession !== null && isIdle(
			this.lastInteractionRecordedAt || this.currentSession.openedAt,
			Date.now(),
			this.dataManager.getTrackingPrecision().idleTimeoutMinutes
		);
	}
}
