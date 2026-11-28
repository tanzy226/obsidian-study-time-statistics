import type {Plugin} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";
import {createLegacySessionId, createSessionId, isSafeStudyDuration, isSafeStudyInterval, isSafeStudyTimestamp, isStudySessionSource} from "../util/sessionUtils";
import {ReadingProgressEntry, ReadingProgressInput} from "../interface/readingProgress";
import {clampPercent, createProgressId} from "../util/readingProgressUtils";
import {repairSessions} from "../util/dataHealth";
import {DEFAULT_TRACKING_PRECISION, normalizeTrackingPrecision, TrackingPrecisionSettings} from "../util/trackingPrecision";
import {createStudyEvent, latestEventsByEntity, legacySessionEvent, mergeStudyEvents, parseStudyEvent, StudyEvent} from "./studyEventEngine";
import {normalizeVisualizationColor, normalizeVisualizationColorMode, VisualizationAppearance} from "../util/visualizationAppearance";
import {localDateKey, splitDurationByLocalDay} from "../util/timeBuckets";
import {DataSafetyError} from "./dataSafetyError";

export const CURRENT_DATA_VERSION = 7;
export type NoteBarDisplay = "hidden" | "compact" | "full";
export type NoteBarPosition = "top" | "bottom";
export function normalizeNoteBarDisplay(value: unknown): NoteBarDisplay {
	return value === "hidden" || value === "full" ? value : "compact";
}
export function normalizeNoteBarPosition(value: unknown): NoteBarPosition {
	return value === "bottom" ? "bottom" : "top";
}

export interface DailyReadData {
	dailyReadData: Record<string, ReadRecord>;
	sessions: StudySession[];
}

interface PluginData {
	dataVersion: number;
	updatedAt: number;
	readData: Record<string, ReadRecord>;
	dailyData: Record<string, DailyReadData>;
	progressEntries: ReadingProgressEntry[];
	deviceId: string;
	eventLog: StudyEvent[];
	settings: {
		strictMode?: boolean;
		progressTrackingEnabled?: boolean;
		noteBarDisplay?: NoteBarDisplay;
		noteBarPosition?: NoteBarPosition;
		dailyGoalMinutes?: number;
		weeklyGoalMinutes?: number;
		idleTimeoutMinutes?: number;
		minimumSessionSeconds?: number;
		visualizationColorMode?: "theme" | "custom";
		visualizationCustomColor?: string;
	};
}

export interface ManualSessionInput {
	fileId: string;
	filePath: string;
	openedAt: number;
	duration: number;
}

type BeforeWrite = (snapshot: unknown) => Promise<unknown>;

function canonicalData(value: unknown): string | undefined {
	return JSON.stringify(value, (_key, item: unknown) => {
		const object = asObject(item);
		return object ? Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]])) : item;
	});
}

function legacyProgressId(entry: Omit<ReadingProgressEntry, "id">): string {
	const text = canonicalData(entry) ?? "";
	let first = 2166136261;
	let second = 5381;
	for (let index = 0; index < text.length; index++) {
		const value = text.charCodeAt(index);
		first = Math.imul(first ^ value, 16777619);
		second = Math.imul(second, 33) ^ value;
	}
	return `legacy-progress-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function isNonNegativeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isIdentity(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0 && !["__proto__", "constructor", "prototype"].includes(value);
}

function isDateKey(key: string): boolean {
	if (!/^\d{4}-\d{1,2}-\d{1,2}$/u.test(key)) return false;
	const date = new Date(key.split("-").map((part, index) => index ? part.padStart(2, "0") : part).join("-") + "T00:00:00Z");
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key.split("-").map((part, index) => index ? part.padStart(2, "0") : part).join("-");
}

function emptyPluginData(): PluginData {
	return {dataVersion: CURRENT_DATA_VERSION, updatedAt: 0, readData: {}, dailyData: {}, progressEntries: [], deviceId: "", eventLog: [], settings: {}};
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: undefined;
}

function finiteNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseReadRecord(value: unknown, fallbackPath = ""): ReadRecord | undefined {
	const source = asObject(value);
	if (!source || typeof source.fileId !== "string") return undefined;

	const result: ReadRecord = {
		fileId: source.fileId,
		filePath: typeof source.filePath === "string" ? source.filePath : fallbackPath,
		duration: Math.max(0, finiteNumber(source.duration)),
		openCount: Math.max(0, finiteNumber(source.openCount))
	};
	if (typeof source.firstOpenedAt === "number" && Number.isFinite(source.firstOpenedAt)) {
		result.firstOpenedAt = source.firstOpenedAt;
	}
	if (typeof source.lastOpenedAt === "number" && Number.isFinite(source.lastOpenedAt)) {
		result.lastOpenedAt = source.lastOpenedAt;
	}
	return result;
}

function parseStudySession(value: unknown): StudySession | undefined {
	const source = asObject(value);
	if (!source || typeof source.fileId !== "string" || typeof source.filePath !== "string") return undefined;
	const openedAt = Math.max(0, finiteNumber(source.openedAt));
	const closedAt = Math.max(openedAt, finiteNumber(source.closedAt, openedAt));
	const duration = Math.max(0, finiteNumber(source.duration));
	const base = {fileId: source.fileId, filePath: source.filePath, openedAt, closedAt, duration};
	const engagement = source.engagement;
	return {
		...base,
		id: typeof source.id === "string" && source.id ? source.id : createLegacySessionId(base),
		source: isStudySessionSource(source.source) ? source.source : "automatic",
		createdAt: Math.max(0, finiteNumber(source.createdAt, openedAt)),
		updatedAt: Math.max(0, finiteNumber(source.updatedAt, closedAt || openedAt)),
		interactionCount: Math.max(0, finiteNumber(source.interactionCount)),
		...(typeof source.firstInteractionAt === "number" ? {firstInteractionAt: Math.max(0, source.firstInteractionAt)} : {}),
		...(typeof source.lastInteractionAt === "number" ? {lastInteractionAt: Math.max(0, source.lastInteractionAt)} : {}),
		...(engagement === "interactive" || engagement === "quiet-study" || engagement === "uncertain" || engagement === "unclassified"
			? {engagement}
			: {engagement: "unclassified" as const})
	};
}

function parseProgressEntry(value: unknown): ReadingProgressEntry | undefined {
	const source = asObject(value);
	if (!source || typeof source.fileId !== "string" || typeof source.filePath !== "string") return undefined;
	const recordedAt = Math.max(0, finiteNumber(source.recordedAt));
	if (!recordedAt) return undefined;
	const percent = clampPercent(finiteNumber(source.percent));
	const characterCount = Math.max(0, finiteNumber(source.characterCount));
	const startPosition = typeof source.startPosition === "number" && Number.isFinite(source.startPosition) ? clampPercent(source.startPosition) : undefined;
	const endPosition = typeof source.endPosition === "number" && Number.isFinite(source.endPosition) ? clampPercent(source.endPosition) : undefined;
	const hasManualCharacters = typeof source.readCharacters === "number" && Number.isFinite(source.readCharacters);
	const entry: Omit<ReadingProgressEntry, "id"> = {
		fileId: source.fileId,
		filePath: source.filePath,
		percent,
		recordedAt,
		characterCount,
		activeDuration: Math.max(0, finiteNumber(source.activeDuration)),
		...(startPosition !== undefined ? {startPosition} : {}),
		...(endPosition !== undefined ? {endPosition} : {}),
		readCharacters: hasManualCharacters ? Math.max(0, finiteNumber(source.readCharacters)) : characterCount * percent / 100,
		measurement: source.measurement === "manual" && hasManualCharacters ? "manual" : "estimated",
		createdAt: Math.max(0, finiteNumber(source.createdAt, recordedAt)),
		updatedAt: Math.max(0, finiteNumber(source.updatedAt, recordedAt))
	};
	return {...entry, id: typeof source.id === "string" && source.id ? source.id : legacyProgressId(entry)};
}

function parseReadData(value: unknown): Record<string, ReadRecord> {
	const source = asObject(value);
	if (!source) return {};
	const result: Record<string, ReadRecord> = {};
	for (const [path, candidate] of Object.entries(source)) {
		const record = parseReadRecord(candidate, path);
		if (record) result[path] = record;
	}
	return result;
}

function parseDailyReadData(value: unknown): DailyReadData {
	const source = asObject(value);
	const rawSessions = source?.sessions;
	return {
		dailyReadData: parseReadData(source?.dailyReadData),
		sessions: Array.isArray(rawSessions)
			? rawSessions.map(parseStudySession).filter((session): session is StudySession => session !== undefined)
			: []
	};
}

function parsePluginData(value: unknown): PluginData {
	const source = asObject(value);
	if (!source) return emptyPluginData();
	const dailyData: Record<string, DailyReadData> = {};
	const rawDailyData = asObject(source.dailyData);
	if (rawDailyData) {
		for (const [date, candidate] of Object.entries(rawDailyData)) {
			dailyData[date] = parseDailyReadData(candidate);
		}
	}
	const rawSettings = asObject(source.settings);
	const strictMode = rawSettings?.strictMode;
	const progressTrackingEnabled = rawSettings?.progressTrackingEnabled;
	const noteBarDisplay = normalizeNoteBarDisplay(rawSettings?.noteBarDisplay);
	const noteBarPosition = normalizeNoteBarPosition(rawSettings?.noteBarPosition);
	const dailyGoalMinutes = rawSettings?.dailyGoalMinutes;
	const weeklyGoalMinutes = rawSettings?.weeklyGoalMinutes;
	const precision = normalizeTrackingPrecision({
		idleTimeoutMinutes: finiteNumber(rawSettings?.idleTimeoutMinutes, DEFAULT_TRACKING_PRECISION.idleTimeoutMinutes),
		minimumSessionSeconds: finiteNumber(rawSettings?.minimumSessionSeconds, DEFAULT_TRACKING_PRECISION.minimumSessionSeconds)
	});
	const visualizationColorMode = normalizeVisualizationColorMode(rawSettings?.visualizationColorMode);
	const visualizationCustomColor = normalizeVisualizationColor(rawSettings?.visualizationCustomColor);
	const rawProgressEntries = source.progressEntries;
	const parsedEvents = Array.isArray(source.eventLog) ? source.eventLog.map(parseStudyEvent).filter((event): event is StudyEvent => event !== undefined) : [];
	const eventSessions = new Set(parsedEvents.filter(event => event.entity === "session").map(event => event.entityId));
	const migratedEvents = [...parsedEvents, ...Object.values(dailyData).flatMap(day => day.sessions
		.filter(session => !eventSessions.has(session.id)).map(session => legacySessionEvent(session, session)))];
	const progressOccurrences = new Map<string, number>();
	const progressEntries = Array.isArray(rawProgressEntries) ? rawProgressEntries.flatMap(value => {
		const entry = parseProgressEntry(value);
		if (!entry) return [];
		if (!asObject(value)?.id) {
			const occurrence = (progressOccurrences.get(entry.id) ?? 0) + 1;
			progressOccurrences.set(entry.id, occurrence);
			entry.id += `-${occurrence}`;
		}
		return [entry];
	}) : [];
	return {
		dataVersion: CURRENT_DATA_VERSION,
		updatedAt: Math.max(0, finiteNumber(source.updatedAt)),
		readData: parseReadData(source.readData),
		dailyData,
		progressEntries,
		deviceId: typeof source.deviceId === "string" ? source.deviceId : "",
		eventLog: mergeStudyEvents(migratedEvents),
		settings: {
			...(typeof strictMode === "boolean" ? {strictMode} : {}),
			...(typeof progressTrackingEnabled === "boolean" ? {progressTrackingEnabled} : {}),
			noteBarDisplay,
			noteBarPosition,
			...(typeof dailyGoalMinutes === "number" && Number.isFinite(dailyGoalMinutes) ? {dailyGoalMinutes: Math.max(0, dailyGoalMinutes)} : {}),
			...(typeof weeklyGoalMinutes === "number" && Number.isFinite(weeklyGoalMinutes) ? {weeklyGoalMinutes: Math.max(0, weeklyGoalMinutes)} : {}),
			idleTimeoutMinutes: precision.idleTimeoutMinutes,
			minimumSessionSeconds: precision.minimumSessionSeconds,
			visualizationColorMode,
			visualizationCustomColor
		}
	};
}

export class PluginDataManager {
	private data: PluginData = emptyPluginData();
	private mutationQueue: Promise<void> = Promise.resolve();
	private revision = 0;
	private readonly changeListeners = new Set<() => void>();
	private runtimeDeviceId = "";
	private writeProtection?: DataSafetyError;
	private uncertainWrite = false;
	private readonly protectedPaths = new Set<string>();
	private beforeMigration?: BeforeWrite;

	constructor(private readonly plugin: Plugin) {}

	private async readStoredData(): Promise<unknown> {
		try {
			const loadedData: unknown = await this.plugin.loadData();
			const dir = this.plugin.manifest?.dir;
			if (loadedData == null && dir && await this.plugin.app.vault.adapter.exists(`${dir}/data.json`)) {
				throw new DataSafetyError("unreadable");
			}
			return loadedData ?? null;
		} catch (error) {
			throw error instanceof DataSafetyError ? error : new DataSafetyError("unreadable", error);
		}
	}

	public async loadData(): Promise<void> {
		const task = this.mutationQueue.then(async () => {
			if (this.uncertainWrite) return;
			let raw: unknown;
			try {
				raw = await this.readStoredData();
				if (raw !== null) await this.validateImport(raw);
				this.data = parsePluginData(raw);
				this.writeProtection = undefined;
			} catch (error) {
				const reason = error instanceof DataSafetyError && error.reason === "future-version" ? "future-version" : "unreadable";
				this.writeProtection = new DataSafetyError(reason, error);
				if (reason === "unreadable" && asObject(raw)) this.data = parsePluginData(raw);
			}
		});
		this.mutationQueue = task.then(() => undefined, () => undefined);
		await task;
	}

	public getWriteProtection(): DataSafetyError | undefined {
		return this.writeProtection;
	}

	public setMigrationBackup(beforeWrite: BeforeWrite): void {
		this.beforeMigration = beforeWrite;
	}

	public ensureDeviceId(): string {
		if (!this.runtimeDeviceId) {
			const storageKey = "study-time-statistics-device-id";
			try {
				const storage = typeof window === "undefined" ? undefined : window.localStorage;
				this.runtimeDeviceId = storage?.getItem(storageKey) ?? "";
				if (!this.runtimeDeviceId) {
					this.runtimeDeviceId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
					storage?.setItem(storageKey, this.runtimeDeviceId);
				}
			} catch {
				this.runtimeDeviceId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
			}
		}
		return this.runtimeDeviceId;
	}

	private mutate<T>(operation: (data: PluginData) => T | Promise<T>, beforeWrite?: BeforeWrite, skipUnchanged = false): Promise<T> {
		const task = this.mutationQueue.then(async () => {
			if (this.uncertainWrite) throw new DataSafetyError("write");
			let raw: unknown;
			try {
				raw = await this.readStoredData();
				if (raw !== null) await this.validateImport(raw);
				this.writeProtection = undefined;
			} catch (error) {
				const reason = error instanceof DataSafetyError && error.reason === "future-version" ? "future-version" : "unreadable";
				this.writeProtection = new DataSafetyError(reason, error);
				throw this.writeProtection;
			}
			const candidate = parsePluginData(raw);
			const originalContent = skipUnchanged ? canonicalData(candidate) : undefined;
			const result = await operation(candidate);
			if (skipUnchanged && canonicalData(candidate) === originalContent) return result;
			if (this.runtimeDeviceId) candidate.deviceId = this.runtimeDeviceId;
			candidate.updatedAt = Math.max(Date.now(), candidate.updatedAt + 1);
			const backup = beforeWrite ?? (raw !== null && asObject(raw)?.dataVersion !== CURRENT_DATA_VERSION ? this.beforeMigration : undefined);
			if (backup) {
				await this.validateImport(candidate);
				await backup(structuredClone(raw ?? emptyPluginData()));
				if (canonicalData(await this.readStoredData()) !== canonicalData(raw)) throw new DataSafetyError("changed");
			}
			try {
				await this.plugin.saveData(candidate);
				if (backup && canonicalData(await this.readStoredData()) !== canonicalData(candidate)) throw new DataSafetyError("write");
			} catch (error) {
				this.writeProtection = new DataSafetyError("write", error);
				try {
					this.uncertainWrite = canonicalData(await this.readStoredData()) !== canonicalData(raw);
				} catch {
					this.uncertainWrite = true;
				}
				throw this.writeProtection;
			}
			this.data = candidate;
			this.revision += 1;
			for (const listener of this.changeListeners) {
				try {
					listener();
				} catch (error) {
					console.error("Study Time Statistics data-change listener failed", error);
				}
			}
			return result;
		});
		this.mutationQueue = task.then(() => undefined, () => undefined);
		return task;
	}

	public getRevision(): number {
		return this.revision;
	}

	public onDidChange(listener: () => void): () => void {
		this.changeListeners.add(listener);
		return () => { this.changeListeners.delete(listener); };
	}

	public getReadRecord(filePath: string): ReadRecord | undefined {
		return this.data.readData[filePath];
	}

	public getReadData(): Readonly<Record<string, ReadRecord>> {
		return this.data.readData;
	}

	public async setReadRecord(filePath: string, record: ReadRecord): Promise<void> {
		await this.mutate(data => { data.readData[filePath] = record; });
	}

	public async deleteReadRecord(filePath: string): Promise<void> {
		await this.mutate(data => { delete data.readData[filePath]; });
	}

	public getDailyReadData(date: string): DailyReadData | undefined {
		const value = this.data.dailyData[date];
		return value ? {
			dailyReadData: {...value.dailyReadData},
			sessions: value.sessions.map(session => ({...session}))
		} : undefined;
	}

	public getDailyReadDates(): string[] {
		return Object.keys(this.data.dailyData).sort();
	}

	public getAllDailyReadData(): Readonly<Record<string, DailyReadData>> {
		return Object.fromEntries(Object.entries(this.data.dailyData).map(([date, value]) => [date, {
			dailyReadData: Object.fromEntries(Object.entries(value.dailyReadData).map(([id, record]) => [id, {...record}])),
			sessions: value.sessions.map(session => ({...session}))
		}]));
	}

	public async setDailyReadData(date: string, value: DailyReadData): Promise<void> {
		await this.mutate(data => {
			data.dailyData[date] = {
				dailyReadData: {...value.dailyReadData},
				sessions: value.sessions.map(session => ({...session}))
			};
		});
	}

	public async recordFileOpened(filePath: string, fileId: string, openedAt: number): Promise<ReadRecord> {
		return this.mutate(data => {
			this.checkWritablePath(filePath);
			const current = data.readData[filePath];
			const record: ReadRecord = {
				fileId: current?.fileId ?? fileId,
				filePath,
				duration: current?.duration ?? 0,
				openCount: (current?.openCount ?? 0) + 1,
				firstOpenedAt: current?.firstOpenedAt ?? openedAt,
				lastOpenedAt: openedAt
			};
			data.readData[filePath] = record;
			return {...record};
		});
	}

	public async addTrackedTime(filePath: string, fileId: string, elapsed: number, endedAt: number): Promise<void> {
		const safeElapsed = elapsed;
		if (!isSafeStudyDuration(safeElapsed) || !isSafeStudyTimestamp(endedAt) || !isSafeStudyInterval(endedAt - safeElapsed, safeElapsed)) {
			throw new DataSafetyError("invalid-snapshot");
		}
		if (safeElapsed < 1) return;
		await this.mutate(data => {
			this.checkWritablePath(filePath);
			const total = data.readData[filePath] ?? {fileId, filePath, duration: 0, openCount: 1};
			total.fileId = fileId;
			total.filePath = filePath;
			total.duration += safeElapsed;
			data.readData[filePath] = total;

			for (const slice of splitDurationByLocalDay(endedAt - safeElapsed, safeElapsed)) {
				const daily = data.dailyData[slice.key] ?? {dailyReadData: {}, sessions: []};
				const record = daily.dailyReadData[fileId] ?? {fileId, filePath, duration: 0, openCount: 0};
				record.filePath = filePath;
				record.duration += slice.duration;
				daily.dailyReadData[fileId] = record;
				data.dailyData[slice.key] = daily;
			}
		});
	}

	public getStrictMode(): boolean {
		return this.data.settings.strictMode ?? true;
	}

	public async setStrictMode(value: boolean): Promise<void> {
		await this.mutate(data => { data.settings.strictMode = value; });
	}

	public getProgressTrackingEnabled(): boolean {
		return this.data.settings.progressTrackingEnabled ?? false;
	}

	public getNoteBarPreferences(): {display: NoteBarDisplay; position: NoteBarPosition} {
		return {display: normalizeNoteBarDisplay(this.data.settings.noteBarDisplay), position: normalizeNoteBarPosition(this.data.settings.noteBarPosition)};
	}

	public async setNoteBarPreferences(value: Partial<{display: NoteBarDisplay; position: NoteBarPosition}>): Promise<void> {
		await this.mutate(data => {
			if (value.display !== undefined) data.settings.noteBarDisplay = normalizeNoteBarDisplay(value.display);
			if (value.position !== undefined) data.settings.noteBarPosition = normalizeNoteBarPosition(value.position);
		});
	}

	public async setProgressTrackingEnabled(value: boolean): Promise<void> {
		await this.mutate(data => { data.settings.progressTrackingEnabled = value; });
	}

	public getStudyGoals(): {dailyMinutes: number; weeklyMinutes: number} {
		return {
			dailyMinutes: this.data.settings.dailyGoalMinutes ?? 30,
			weeklyMinutes: this.data.settings.weeklyGoalMinutes ?? 180
		};
	}

	public async setStudyGoals(dailyMinutes: number, weeklyMinutes: number): Promise<void> {
		await this.mutate(data => {
			data.settings.dailyGoalMinutes = Math.max(0, dailyMinutes);
			data.settings.weeklyGoalMinutes = Math.max(0, weeklyMinutes);
		});
	}

	public getTrackingPrecision(): TrackingPrecisionSettings {
		return normalizeTrackingPrecision({
			idleTimeoutMinutes: this.data.settings.idleTimeoutMinutes,
			minimumSessionSeconds: this.data.settings.minimumSessionSeconds
		});
	}

	public async setTrackingPrecision(value: Partial<TrackingPrecisionSettings>): Promise<void> {
		await this.mutate(data => {
			const normalized = normalizeTrackingPrecision({...this.getTrackingPrecision(), ...value});
			data.settings.idleTimeoutMinutes = normalized.idleTimeoutMinutes;
			data.settings.minimumSessionSeconds = normalized.minimumSessionSeconds;
		});
	}

	public getVisualizationAppearance(): VisualizationAppearance {
		return {
			colorMode: normalizeVisualizationColorMode(this.data.settings.visualizationColorMode),
			customColor: normalizeVisualizationColor(this.data.settings.visualizationCustomColor)
		};
	}

	public async setVisualizationAppearance(value: Partial<VisualizationAppearance>): Promise<void> {
		await this.mutate(data => {
			const current = this.getVisualizationAppearance();
			data.settings.visualizationColorMode = normalizeVisualizationColorMode(value.colorMode ?? current.colorMode);
			data.settings.visualizationCustomColor = normalizeVisualizationColor(value.customColor ?? current.customColor);
		});
	}

	public getProgressEntries(filePath?: string): ReadingProgressEntry[] {
		return this.data.progressEntries
			.filter(entry => filePath === undefined || entry.filePath === filePath)
			.sort((a, b) => b.recordedAt - a.recordedAt)
			.map(entry => ({...entry}));
	}

	public async createProgressEntry(input: ReadingProgressInput, beforeWrite?: BeforeWrite): Promise<ReadingProgressEntry> {
		const now = Date.now();
		const entry: ReadingProgressEntry = {
			...input,
			id: createProgressId(input.recordedAt),
			percent: clampPercent(input.percent),
			characterCount: Math.max(0, input.characterCount),
			activeDuration: Math.max(0, input.activeDuration),
			...(input.startPosition !== undefined ? {startPosition: clampPercent(input.startPosition)} : {}),
			...(input.endPosition !== undefined ? {endPosition: clampPercent(input.endPosition)} : {}),
			readCharacters: Math.max(0, input.readCharacters ?? input.characterCount * clampPercent(input.percent) / 100),
			measurement: input.measurement ?? (input.readCharacters === undefined ? "estimated" : "manual"),
			createdAt: now,
			updatedAt: now
		};
		await this.mutate(data => {
			this.checkWritablePath(entry.filePath);
			data.progressEntries.push(entry);
			this.appendEvent(data, "progress", entry.id, "upsert", entry.fileId, entry);
		}, beforeWrite);
		return {...entry};
	}

	public async updateProgressEntry(id: string, input: ReadingProgressInput, beforeWrite?: BeforeWrite): Promise<ReadingProgressEntry | undefined> {
		return this.mutate(data => {
			const index = data.progressEntries.findIndex(entry => entry.id === id);
			const existing = data.progressEntries[index];
			if (!existing) return undefined;
			this.checkWritablePath(existing.filePath);
			this.checkWritablePath(input.filePath);
			const updated: ReadingProgressEntry = {
				...existing,
				...input,
				percent: clampPercent(input.percent),
				characterCount: Math.max(0, input.characterCount),
				activeDuration: Math.max(0, input.activeDuration),
				...(input.startPosition !== undefined ? {startPosition: clampPercent(input.startPosition)} : {startPosition: undefined}),
				...(input.endPosition !== undefined ? {endPosition: clampPercent(input.endPosition)} : {endPosition: undefined}),
				readCharacters: Math.max(0, input.readCharacters ?? input.characterCount * clampPercent(input.percent) / 100),
				measurement: input.measurement ?? (input.readCharacters === undefined ? "estimated" : "manual"),
				updatedAt: Date.now()
			};
			data.progressEntries[index] = updated;
			this.appendEvent(data, "progress", updated.id, "upsert", updated.fileId, updated);
			return {...updated};
		}, beforeWrite, true);
	}

	public async deleteProgressEntry(id: string, beforeWrite?: BeforeWrite): Promise<boolean> {
		return this.mutate(data => {
			const originalLength = data.progressEntries.length;
			const existing = data.progressEntries.find(entry => entry.id === id);
			if (existing) this.checkWritablePath(existing.filePath);
			data.progressEntries = data.progressEntries.filter(entry => entry.id !== id);
			if (existing) this.appendEvent(data, "progress", id, "delete", existing.fileId);
			return data.progressEntries.length !== originalLength;
		}, beforeWrite, true);
	}

	private checkWritablePath(path: string): void {
		if ([...this.protectedPaths].some(prefix => path === prefix || path.startsWith(`${prefix}/`))) throw new DataSafetyError("ambiguous");
	}

	public async renameFilePath(oldPath: string, newPath: string, folder = false, beforeWrite?: BeforeWrite): Promise<void> {
		if (!oldPath || !newPath || oldPath === newPath) return;
		try {
			await this.mutate(data => {
				const allRecords = [...Object.entries(data.readData).map(([path, record]) => ({filePath: path, fileId: record.fileId})), ...data.progressEntries];
				for (const day of Object.values(data.dailyData)) allRecords.push(...day.sessions, ...Object.values(day.dailyReadData));
				const byPath = new Map<string, Set<string>>();
				for (const {filePath, fileId} of allRecords) {
					if (!filePath) continue;
					const ids = byPath.get(filePath) ?? new Set<string>();
					ids.add(fileId);
					byPath.set(filePath, ids);
				}
				const matched = new Map<string, string>();
				const byId = new Map<string, string>();
				for (const [path, ids] of byPath) {
					if (path !== oldPath && !(folder && path.startsWith(`${oldPath}/`))) continue;
					const target = newPath + path.slice(oldPath.length);
					if (byPath.has(target)) throw new DataSafetyError("ambiguous");
					matched.set(path, target);
					for (const id of ids) {
						if (byId.has(id) && byId.get(id) !== target) throw new DataSafetyError("ambiguous");
						byId.set(id, target);
						this.appendEvent(data, "note", id, "rename", id, {oldPath: path, newPath: target});
					}
				}
				for (const [path, target] of matched) {
					const record = data.readData[path];
					if (!record) continue;
					delete data.readData[path];
					data.readData[target] = {...record, filePath: target};
				}
				for (const daily of Object.values(data.dailyData)) {
					for (const record of Object.values(daily.dailyReadData)) {
						const path = matched.get(record.filePath) ?? (!record.filePath ? byId.get(record.fileId) : undefined);
						if (path) record.filePath = path;
					}
					for (const session of daily.sessions) session.filePath = matched.get(session.filePath) ?? session.filePath;
				}
				for (const entry of data.progressEntries) entry.filePath = matched.get(entry.filePath) ?? entry.filePath;
			}, beforeWrite, true);
			this.protectedPaths.delete(newPath);
		} catch (error) {
			this.protectedPaths.add(newPath);
			throw error;
		}
	}

	public async repairSessionData(beforeWrite?: BeforeWrite): Promise<{removed: number}> {
		return this.mutate(data => {
			const beforeSessions = Object.values(data.dailyData).flatMap(day => day.sessions);
			const afterSessions = repairSessions(beforeSessions);
			if (afterSessions.length === beforeSessions.length) return {removed: 0};
			const counts = new Map<string, number>();
			for (const session of beforeSessions) counts.set(session.id, (counts.get(session.id) ?? 0) + 1);
			const keep = new Map(afterSessions.map(session => [session.id, session]));
			const affected = beforeSessions.filter(session => counts.get(session.id) !== 1 || !keep.has(session.id));
			const latest = latestEventsByEntity(data.eventLog);
			for (const session of affected) {
				const winner = keep.get(session.id);
				if (!winner || winner.fileId !== session.fileId || winner.filePath !== session.filePath
					|| (winner.updatedAt === session.updatedAt && canonicalData(winner) !== canonicalData(session))
					|| latest.get(`session:${session.id}`)?.operation === "delete") throw new DataSafetyError("ambiguous");
				this.assertSessionAttribution(data, session, true);
			}
			type SessionTotal = {duration: number; count: number; fileId: string; filePath: string};
			const summarize = (sessions: StudySession[]) => {
				const total = new Map<string, SessionTotal>();
				const daily = new Map<string, Map<string, SessionTotal>>();
				for (const session of sessions) {
					const aggregate = total.get(session.fileId) ?? {duration: 0, count: 0, fileId: session.fileId, filePath: session.filePath};
					aggregate.duration += session.duration;
					aggregate.count++;
					aggregate.filePath = session.filePath;
					total.set(session.fileId, aggregate);
					for (const slice of splitDurationByLocalDay(session.openedAt, session.duration)) {
						const day = daily.get(slice.key) ?? new Map<string, SessionTotal>();
						const point = day.get(session.fileId) ?? {duration: 0, count: 0, fileId: session.fileId, filePath: session.filePath};
						point.duration += slice.duration;
						point.filePath = session.filePath;
						day.set(session.fileId, point);
						daily.set(slice.key, day);
					}
				}
				return {total, daily};
			};
			const before = summarize(affected);
			const after = summarize(afterSessions.filter(session => (counts.get(session.id) ?? 0) > 1));

			const totalsById = new Set<string>();
			for (const record of Object.values(data.readData)) {
				const oldSessions = before.total.get(record.fileId);
				if (!oldSessions) continue;
				if (totalsById.has(record.fileId)) throw new DataSafetyError("ambiguous");
				totalsById.add(record.fileId);
				const keptSessions = after.total.get(record.fileId);
				if (record.duration < oldSessions.duration || record.openCount < oldSessions.count) throw new DataSafetyError("ambiguous");
				record.duration = record.duration - oldSessions.duration + (keptSessions?.duration ?? 0);
				record.openCount = record.openCount - oldSessions.count + (keptSessions?.count ?? 0);
			}

			for (const [date, oldSessions] of before.daily) {
				const daily = data.dailyData[date];
				const keptSessions = after.daily.get(date) ?? new Map<string, SessionTotal>();
				for (const [fileId, previous] of oldSessions) {
					const record = daily?.dailyReadData[fileId];
					if (!record || record.duration < previous.duration) throw new DataSafetyError("ambiguous");
					record.duration = record.duration - previous.duration + (keptSessions.get(fileId)?.duration ?? 0);
				}
			}
			for (const daily of Object.values(data.dailyData)) daily.sessions = daily.sessions.filter(session => counts.get(session.id) === 1);
			for (const session of afterSessions.filter(item => (counts.get(item.id) ?? 0) > 1)) {
				this.addSessionToDay(data, session);
				this.appendEvent(data, "session", session.id, "upsert", session.fileId, session);
			}
			return {removed: beforeSessions.length - afterSessions.length};
		}, beforeWrite, true);
	}

	public getSessions(): StudySession[] {
		return Object.values(this.data.dailyData)
			.flatMap(day => day.sessions)
			.sort((a, b) => b.openedAt - a.openedAt)
			.map(session => ({...session}));
	}

	public getSession(id: string): StudySession | undefined {
		const session = this.getSessions().find(candidate => candidate.id === id);
		return session ? {...session} : undefined;
	}

	public async recordCompletedSession(session: StudySession): Promise<void> {
		if (!isIdentity(session.id) || !isIdentity(session.fileId) || !isIdentity(session.filePath)
			|| !isSafeStudyInterval(session.openedAt, session.duration) || !isSafeStudyTimestamp(session.closedAt) || session.closedAt < session.openedAt) {
			throw new DataSafetyError("invalid-snapshot");
		}
		await this.mutate(data => {
			this.checkWritablePath(session.filePath);
			const date = localDateKey(session.openedAt);
			const daily = data.dailyData[date] ?? {dailyReadData: {}, sessions: []};
			if (!daily.sessions.some(candidate => candidate.id === session.id)) daily.sessions.push({...session});
			data.dailyData[date] = daily;
			this.appendEvent(data, "session", session.id, "upsert", session.fileId, session);
		});
	}

	public async createManualSession(input: ManualSessionInput, beforeWrite?: BeforeWrite): Promise<StudySession> {
		this.validateManualSession(input);
		const now = Date.now();
		const session: StudySession = {
			id: createSessionId(input.openedAt),
			fileId: input.fileId,
			filePath: input.filePath,
			openedAt: input.openedAt,
			closedAt: input.openedAt + Math.max(0, input.duration),
			duration: Math.max(0, input.duration),
			source: "manual",
			createdAt: now,
			updatedAt: now
		};
		await this.mutate(data => {
			this.checkWritablePath(session.filePath);
			this.applySessionDelta(data, session, 1);
			this.addSessionToDay(data, session);
			this.appendEvent(data, "session", session.id, "upsert", session.fileId, session);
		}, beforeWrite);
		return session;
	}

	public async updateSession(id: string, input: ManualSessionInput, beforeWrite?: BeforeWrite): Promise<StudySession | undefined> {
		this.validateManualSession(input);
		return this.mutate(data => {
			const existing = this.findSession(data, id);
			if (!existing) return undefined;
			this.checkWritablePath(input.filePath);
			this.assertSessionAttribution(data, existing);
			const updated: StudySession = {
				...existing,
				fileId: input.fileId,
				filePath: input.filePath,
				openedAt: input.openedAt,
				closedAt: input.openedAt + Math.max(0, input.duration),
				duration: Math.max(0, input.duration),
				source: "manual",
				updatedAt: Date.now()
			};
			this.removeSessionFromDay(data, existing.id);
			this.applySessionDelta(data, existing, -1);
			this.applySessionDelta(data, updated, 1);
			this.addSessionToDay(data, updated);
			this.appendEvent(data, "session", updated.id, "upsert", updated.fileId, updated);
			return {...updated};
		}, beforeWrite, true);
	}

	public async deleteSession(id: string, beforeWrite?: BeforeWrite): Promise<boolean> {
		return this.mutate(data => {
			const existing = this.findSession(data, id);
			if (!existing) return false;
			this.assertSessionAttribution(data, existing);
			this.removeSessionFromDay(data, id);
			this.applySessionDelta(data, existing, -1);
			this.appendEvent(data, "session", existing.id, "delete", existing.fileId);
			return true;
		}, beforeWrite, true);
	}

	public async setSessionEngagement(id: string, engagement: StudySession["engagement"]): Promise<boolean> {
		return this.mutate(data => {
			const session = this.findSession(data, id);
			if (!session) return false;
			session.engagement = engagement;
			session.updatedAt = Date.now();
			this.appendEvent(data, "session", session.id, "upsert", session.fileId, session);
			return true;
		});
	}

	public exportData(): unknown {
		return structuredClone(this.data);
	}

	public getStudyEvents(): StudyEvent[] {
		return this.data.eventLog.map(event => structuredClone(event));
	}

	private validateManualSession(input: ManualSessionInput): void {
		if (!isIdentity(input.filePath) || !isIdentity(input.fileId) || !isSafeStudyInterval(input.openedAt, input.duration) || input.duration === 0) {
			throw new DataSafetyError("invalid-snapshot");
		}
	}

	private canPlaceSession(session: StudySession): boolean {
		if (!isSafeStudyInterval(session.openedAt, session.duration) || !isSafeStudyTimestamp(session.closedAt)
			|| session.closedAt < session.openedAt || session.duration > session.closedAt - session.openedAt) return false;
		return session.duration === 0 || session.closedAt === session.openedAt + session.duration
			|| (session.source === "automatic" && localDateKey(session.openedAt) === localDateKey(Math.max(session.openedAt, session.closedAt - 1)));
	}

	private assertSessionAttribution(data: PluginData, session: StudySession, allowDuplicate = false): void {
		this.checkWritablePath(session.filePath);
		const day = localDateKey(session.openedAt);
		const placements = Object.entries(data.dailyData).flatMap(([date, bucket]) => bucket.sessions.filter(item => item.id === session.id).map(() => date));
		const total = data.readData[session.filePath];
		if (!this.canPlaceSession(session) || placements.some(date => date !== day) || (!allowDuplicate && placements.length !== 1)
			|| !total || total.fileId !== session.fileId || total.duration < session.duration || total.openCount < 1) {
			throw new DataSafetyError("ambiguous");
		}
		for (const slice of splitDurationByLocalDay(session.openedAt, session.duration)) {
			const record = data.dailyData[slice.key]?.dailyReadData[session.fileId];
			if (!record || record.duration < slice.duration || (record.filePath && record.filePath !== session.filePath)) throw new DataSafetyError("ambiguous");
		}
	}

	public async mergeData(value: unknown, beforeWrite?: BeforeWrite): Promise<{eventsAdded: number; sessionsAdded: number; progressAdded: number}> {
		const wrapper = asObject(value);
		if (wrapper && "pluginData" in wrapper && (wrapper.format !== "study-time-statistics-backup" || wrapper.version !== 1)) {
			throw new DataSafetyError("invalid-snapshot");
		}
		const unwrapped = wrapper && "pluginData" in wrapper ? wrapper.pluginData : value;
		await this.validateImport(unwrapped);
		const incoming = parsePluginData(unwrapped);
		return this.mutate(data => {
			const history = ({readData, dailyData, progressEntries, eventLog}: PluginData) => ({readData, dailyData, progressEntries, eventLog});
			if (canonicalData(history(incoming)) === canonicalData(history(data))) return {eventsAdded: 0, sessionsAdded: 0, progressAdded: 0};
			type Aggregate = {duration: number; count: number; fileId: string; filePath: string; first?: number; last?: number};
			const uniqueSessions = (snapshot: PluginData): StudySession[] => {
				const result = new Map<string, StudySession>();
				for (const [date, day] of Object.entries(snapshot.dailyData)) for (const session of day.sessions) {
					if (result.has(session.id) || date !== localDateKey(session.openedAt) || !this.canPlaceSession(session)) throw new DataSafetyError("ambiguous");
					result.set(session.id, {...session});
				}
				return [...result.values()];
			};
			const totalsFor = (sessions: StudySession[]) => {
				const total = new Map<string, Aggregate>();
				const daily = new Map<string, Map<string, Aggregate>>();
				for (const session of sessions) {
					const aggregate = total.get(session.fileId) ?? {duration: 0, count: 0, fileId: session.fileId, filePath: session.filePath, first: session.openedAt, last: session.openedAt};
					aggregate.duration += session.duration;
					aggregate.count++;
					aggregate.filePath = session.filePath;
					aggregate.first = Math.min(aggregate.first ?? session.openedAt, session.openedAt);
					aggregate.last = Math.max(aggregate.last ?? session.openedAt, session.openedAt);
					total.set(session.fileId, aggregate);
					for (const slice of splitDurationByLocalDay(session.openedAt, session.duration)) {
						const day = daily.get(slice.key) ?? new Map<string, Aggregate>();
						const point = day.get(session.fileId) ?? {duration: 0, count: 0, fileId: session.fileId, filePath: session.filePath};
						point.duration += slice.duration;
						if (slice.key === localDateKey(session.openedAt)) point.count++;
						day.set(session.fileId, point);
						daily.set(slice.key, day);
					}
				}
				return {total, daily};
			};
			const residualsFor = (snapshot: PluginData) => {
				const sessionTotals = totalsFor(uniqueSessions(snapshot));
				const total = new Map<string, Aggregate>();
				for (const [path, record] of Object.entries(snapshot.readData)) {
					if (total.has(record.fileId) || (record.filePath && record.filePath !== path)) throw new DataSafetyError("ambiguous");
					const tracked = sessionTotals.total.get(record.fileId);
					if (record.duration < (tracked?.duration ?? 0) || record.openCount < (tracked?.count ?? 0)) throw new DataSafetyError("ambiguous");
					const residual: Aggregate = {
						fileId: record.fileId,
						filePath: record.filePath || path,
						duration: Math.max(0, record.duration - (tracked?.duration ?? 0)),
						count: Math.max(0, record.openCount - (tracked?.count ?? 0)),
						...(record.firstOpenedAt !== undefined ? {first: record.firstOpenedAt} : {}),
						...(record.lastOpenedAt !== undefined ? {last: record.lastOpenedAt} : {})
					};
					total.set(record.fileId, residual);
				}
				for (const id of sessionTotals.total.keys()) if (!total.has(id)) throw new DataSafetyError("ambiguous");
				const daily = new Map<string, Map<string, Aggregate>>();
				for (const [date, day] of Object.entries(snapshot.dailyData)) {
					const values = new Map<string, Aggregate>();
					for (const [fileId, record] of Object.entries(day.dailyReadData)) {
						const tracked = sessionTotals.daily.get(date)?.get(fileId);
						if (record.fileId !== fileId || record.duration < (tracked?.duration ?? 0)) throw new DataSafetyError("ambiguous");
						values.set(fileId, {
							fileId,
							filePath: record.filePath || snapshot.readData[record.filePath]?.filePath || "",
							duration: Math.max(0, record.duration - (tracked?.duration ?? 0)),
							count: Math.max(0, record.openCount - (tracked?.count ?? 0))
						});
					}
					daily.set(date, values);
				}
				for (const [date, points] of sessionTotals.daily) {
					for (const id of points.keys()) if (!daily.get(date)?.has(id)) throw new DataSafetyError("ambiguous");
				}
				return {total, daily};
			};
			const mergeAggregateMaps = (current: Map<string, Aggregate>, other: Map<string, Aggregate>): Map<string, Aggregate> => {
				const result = new Map<string, Aggregate>();
				for (const key of new Set([...current.keys(), ...other.keys()])) {
					const left = current.get(key);
					const right = other.get(key);
					if (!left && right) result.set(key, {...right});
					else if (left && !right) result.set(key, {...left});
					else if (left && right) {
						if ((left.duration > 0 || left.count > 0) && (right.duration > 0 || right.count > 0)) throw new DataSafetyError("ambiguous");
						result.set(key, {
						fileId: key,
						filePath: (right.last ?? 0) > (left.last ?? 0) ? right.filePath : left.filePath,
						duration: Math.max(left.duration, right.duration),
						count: Math.max(left.count, right.count),
						...([left.first, right.first].filter((item): item is number => item !== undefined).length ? {first: Math.min(...[left.first, right.first].filter((item): item is number => item !== undefined))} : {}),
						...(Math.max(left.last ?? 0, right.last ?? 0) > 0 ? {last: Math.max(left.last ?? 0, right.last ?? 0)} : {})
						});
					}
				}
				return result;
			};

			const originalEvents = data.eventLog.length;
			const currentSessions = uniqueSessions(data);
			const incomingSessions = uniqueSessions(incoming);
			const originalSessions = currentSessions.length;
			const originalProgress = data.progressEntries.length;
			const currentResiduals = residualsFor(data);
			const incomingResiduals = residualsFor(incoming);
			const checkUnattributedTime = (
				residuals: ReturnType<typeof residualsFor>, owner: PluginData, peer: PluginData, ownerSessions: StudySession[], peerSessions: StudySession[]
			): void => {
				const hasResidual = new Set<string>();
				for (const item of residuals.total.values()) if (item.duration > 0 || item.count > 0) hasResidual.add(item.fileId);
				for (const day of residuals.daily.values()) {
					for (const item of day.values()) if (item.duration > 0 || item.count > 0) hasResidual.add(item.fileId);
				}
				const byId = new Map(ownerSessions.map(session => [session.id, session]));
				for (const session of peerSessions) {
					if (!hasResidual.has(session.fileId)) continue;
					const known = byId.get(session.id);
					if (!known || known.fileId !== session.fileId || known.duration !== session.duration || known.openedAt !== session.openedAt) {
						throw new DataSafetyError("ambiguous");
					}
				}
				if (hasResidual.size) {
					const ownerEvents = new Set(owner.eventLog.map(event => event.id));
					for (const event of peer.eventLog) {
						if (event.entity === "session" && event.operation === "delete" && !ownerEvents.has(event.id)
							&& (!event.fileId || hasResidual.has(event.fileId))) throw new DataSafetyError("ambiguous");
					}
				}
			};
			checkUnattributedTime(currentResiduals, data, incoming, currentSessions, incomingSessions);
			checkUnattributedTime(incomingResiduals, incoming, data, incomingSessions, currentSessions);
			const currentEventsById = new Map(data.eventLog.map(event => [event.id, event]));
			for (const event of incoming.eventLog) {
				const existing = currentEventsById.get(event.id);
				if (existing && canonicalData(existing) !== canonicalData(event)
					&& !(event.deviceId === "legacy" && existing.deviceId === "legacy" && event.timestamp !== existing.timestamp)) throw new DataSafetyError("ambiguous");
			}
			data.eventLog = mergeStudyEvents(data.eventLog, incoming.eventLog);
			const sessions = new Map<string, StudySession>();
			for (const session of [...currentSessions, ...incomingSessions]) {
				const existing = sessions.get(session.id);
				if (existing && (existing.fileId !== session.fileId || (existing.updatedAt === session.updatedAt
					&& canonicalData({...existing, filePath: ""}) !== canonicalData({...session, filePath: ""})))) throw new DataSafetyError("ambiguous");
				if (!existing || session.updatedAt > existing.updatedAt) sessions.set(session.id, {...session});
			}
			const latestEvents = latestEventsByEntity(data.eventLog);
			for (const [key, event] of latestEvents) {
				if (!key.startsWith("session:")) continue;
				if (event.operation === "delete") sessions.delete(event.entityId);
				else {
					const parsed = parseStudySession(event.payload);
					const existing = sessions.get(event.entityId);
					if (!parsed || !existing || parsed.fileId !== existing.fileId) throw new DataSafetyError("ambiguous");
					if (parsed.updatedAt >= existing.updatedAt) sessions.set(parsed.id, parsed);
				}
			}
			for (const session of sessions.values()) if (!this.canPlaceSession(session)) throw new DataSafetyError("ambiguous");
			const progress = new Map(data.progressEntries.map(entry => [entry.id, entry]));
			if (progress.size !== data.progressEntries.length || new Set(incoming.progressEntries.map(entry => entry.id)).size !== incoming.progressEntries.length) throw new DataSafetyError("ambiguous");
			for (const entry of incoming.progressEntries) {
				const existing = progress.get(entry.id);
				if (existing && (existing.fileId !== entry.fileId || (existing.updatedAt === entry.updatedAt
					&& canonicalData({...existing, filePath: ""}) !== canonicalData({...entry, filePath: ""})))) throw new DataSafetyError("ambiguous");
				if (!existing || entry.updatedAt > existing.updatedAt) progress.set(entry.id, {...entry});
			}
			for (const [key, event] of latestEvents) {
				if (!key.startsWith("progress:")) continue;
				if (event.operation === "delete") progress.delete(event.entityId);
				else {
					const parsed = parseProgressEntry(event.payload);
					const existing = progress.get(event.entityId);
					if (!parsed || !existing || parsed.fileId !== existing.fileId) throw new DataSafetyError("ambiguous");
					if (parsed.updatedAt >= existing.updatedAt) progress.set(parsed.id, parsed);
				}
			}

			const preferredPaths = new Map<string, {path: string; changedAt: number}>();
			const considerPath = (fileId: string, path: string, changedAt: number) => {
				if (!path) return;
				const existing = preferredPaths.get(fileId);
				if (!existing || changedAt > existing.changedAt || (changedAt === existing.changedAt && path < existing.path)) preferredPaths.set(fileId, {path, changedAt});
			};
			const aliases = new Map<string, Set<string>>();
			const pathsById = new Map<string, Set<string>>();
			const rememberPath = (id: string, path: string) => {
				if (!path) return;
				const ids = aliases.get(path) ?? new Set<string>();
				ids.add(id);
				aliases.set(path, ids);
				const paths = pathsById.get(id) ?? new Set<string>();
				paths.add(path);
				pathsById.set(id, paths);
			};
			for (const item of [...currentResiduals.total.values(), ...incomingResiduals.total.values(), ...currentSessions, ...incomingSessions, ...data.progressEntries, ...incoming.progressEntries]) rememberPath(item.fileId, item.filePath);
			const renamed = new Map<string, {path: string; changedAt: number}>();
			const renameChain = new Map<string, Set<string>>();
			for (const item of [...currentResiduals.total.values(), ...incomingResiduals.total.values()]) considerPath(item.fileId, item.filePath, item.last ?? 0);
			for (const session of sessions.values()) considerPath(session.fileId, session.filePath, session.updatedAt);
			for (const entry of progress.values()) considerPath(entry.fileId, entry.filePath, entry.updatedAt);
			for (const event of data.eventLog) {
				if (event.entity !== "note" || event.operation !== "rename") continue;
				const payload = asObject(event.payload);
				if (typeof payload?.newPath !== "string" || typeof payload.oldPath !== "string") throw new DataSafetyError("ambiguous");
				const candidates = new Set([...(aliases.get(payload.oldPath) ?? []), ...(aliases.get(payload.newPath) ?? [])]);
				const id = event.fileId ?? (candidates.size === 1 ? [...candidates][0] : undefined);
				if (!id) throw new DataSafetyError("ambiguous");
				const previous = renamed.get(id);
				if (previous && previous.path !== payload.oldPath && previous.path !== payload.newPath) throw new DataSafetyError("ambiguous");
				renamed.set(id, {path: payload.newPath, changedAt: event.timestamp});
				const knownPaths = renameChain.get(id) ?? new Set<string>();
				knownPaths.add(payload.oldPath);
				knownPaths.add(payload.newPath);
				renameChain.set(id, knownPaths);
				rememberPath(id, payload.oldPath);
				rememberPath(id, payload.newPath);
			}
			for (const ids of aliases.values()) if (ids.size > 1) throw new DataSafetyError("ambiguous");
			for (const [id, paths] of pathsById) {
				if (paths.size > 1 && [...paths].some(path => !renameChain.get(id)?.has(path))) throw new DataSafetyError("ambiguous");
			}
			for (const [id, rename] of renamed) preferredPaths.set(id, rename);
			for (const session of sessions.values()) session.filePath = preferredPaths.get(session.fileId)?.path ?? session.filePath;
			for (const entry of progress.values()) entry.filePath = preferredPaths.get(entry.fileId)?.path ?? entry.filePath;
			data.progressEntries = [...progress.values()];

			const mergedSessionTotals = totalsFor([...sessions.values()]);
			const residualTotals = mergeAggregateMaps(currentResiduals.total, incomingResiduals.total);
			data.readData = {};
			for (const fileId of new Set([...residualTotals.keys(), ...mergedSessionTotals.total.keys()])) {
				const base = residualTotals.get(fileId);
				const tracked = mergedSessionTotals.total.get(fileId);
				const path = preferredPaths.get(fileId)?.path ?? tracked?.filePath ?? base?.filePath ?? "";
				if (!path) continue;
				if (data.readData[path]) throw new DataSafetyError("ambiguous");
				const firstValues = [base?.first, tracked?.first].filter((item): item is number => item !== undefined);
				const last = Math.max(base?.last ?? 0, tracked?.last ?? 0);
				data.readData[path] = {
					fileId,
					filePath: path,
					duration: (base?.duration ?? 0) + (tracked?.duration ?? 0),
					openCount: (base?.count ?? 0) + (tracked?.count ?? 0),
					...(firstValues.length ? {firstOpenedAt: Math.min(...firstValues)} : {}),
					...(last > 0 ? {lastOpenedAt: last} : {})
				};
			}

			data.dailyData = {};
			const dates = new Set([...currentResiduals.daily.keys(), ...incomingResiduals.daily.keys(), ...mergedSessionTotals.daily.keys()]);
			for (const date of dates) {
				const residual = mergeAggregateMaps(currentResiduals.daily.get(date) ?? new Map<string, Aggregate>(), incomingResiduals.daily.get(date) ?? new Map<string, Aggregate>());
				const tracked = mergedSessionTotals.daily.get(date) ?? new Map<string, Aggregate>();
				const day: DailyReadData = {dailyReadData: {}, sessions: []};
				for (const fileId of new Set([...residual.keys(), ...tracked.keys()])) {
					const base = residual.get(fileId);
					const sessionTotal = tracked.get(fileId);
					const path = preferredPaths.get(fileId)?.path ?? sessionTotal?.filePath ?? base?.filePath ?? "";
					day.dailyReadData[fileId] = {fileId, filePath: path, duration: (base?.duration ?? 0) + (sessionTotal?.duration ?? 0), openCount: (base?.count ?? 0) + (sessionTotal?.count ?? 0)};
				}
				data.dailyData[date] = day;
			}
			for (const session of sessions.values()) this.addSessionToDay(data, session);
			return {eventsAdded: data.eventLog.length - originalEvents, sessionsAdded: Math.max(0, sessions.size - originalSessions), progressAdded: Math.max(0, data.progressEntries.length - originalProgress)};
		}, beforeWrite, true);
	}

	public async validateImport(value: unknown): Promise<void> {
		const source = asObject(value);
		if (!source) throw new DataSafetyError("invalid-snapshot");
		const version = source.dataVersion;
		if (version !== undefined && (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > CURRENT_DATA_VERSION)) {
			throw new DataSafetyError("future-version");
		}
		const legacy = version === undefined || version < CURRENT_DATA_VERSION;
		const readData = asObject(source?.readData);
		const dailyData = asObject(source?.dailyData);
		if ((!readData && (!legacy || source.readData !== undefined)) || (!dailyData && (!legacy || source.dailyData !== undefined))
			|| (!readData && !dailyData) || (source.updatedAt !== undefined && !isSafeStudyTimestamp(source.updatedAt))
			|| (source.settings !== undefined && !asObject(source.settings))) throw new DataSafetyError("invalid-snapshot");
		const validReadRecord = (candidate: unknown): boolean => {
			const record = asObject(candidate);
			return Boolean(record && isIdentity(record.fileId) && (record.filePath === undefined || typeof record.filePath === "string")
				&& isNonNegativeNumber(record.duration) && typeof record.openCount === "number" && Number.isSafeInteger(record.openCount) && record.openCount >= 0
				&& ["firstOpenedAt", "lastOpenedAt"].every(key => record[key] === undefined || isSafeStudyTimestamp(record[key])));
		};
		const validSession = (candidate: unknown): boolean => {
			const item = asObject(candidate);
			if (!item || !isIdentity(item.fileId) || !isIdentity(item.filePath) || !isSafeStudyTimestamp(item.openedAt)
				|| !isSafeStudyDuration(item.duration) || !isSafeStudyInterval(item.openedAt, item.duration)
				|| (item.id !== undefined && !isIdentity(item.id))) return false;
			if (item.closedAt !== undefined && (!isSafeStudyTimestamp(item.closedAt) || item.closedAt < item.openedAt)) return false;
			return ["createdAt", "updatedAt", "firstInteractionAt", "lastInteractionAt"].every(key => item[key] === undefined || isSafeStudyTimestamp(item[key]));
		};
		const validProgress = (candidate: unknown): boolean => {
			const item = asObject(candidate);
			const percent = (input: unknown): input is number => isNonNegativeNumber(input) && input <= 100;
			return Boolean(item && isIdentity(item.filePath) && isIdentity(item.fileId) && isSafeStudyTimestamp(item.recordedAt) && item.recordedAt !== 0
				&& percent(item.percent) && (item.id === undefined || isIdentity(item.id))
				&& ["createdAt", "updatedAt"].every(key => item[key] === undefined || isSafeStudyTimestamp(item[key]))
				&& ["characterCount", "readCharacters"].every(key => item[key] === undefined || isNonNegativeNumber(item[key]))
				&& (item.activeDuration === undefined || isSafeStudyDuration(item.activeDuration))
				&& (item.startPosition === undefined || percent(item.startPosition))
				&& (item.endPosition === undefined || percent(item.endPosition))
				&& !(percent(item.startPosition) && percent(item.endPosition) && item.startPosition > item.endPosition));
		};
		for (const [path, record] of Object.entries(readData ?? {})) {
			if (!isIdentity(path) || !validReadRecord(record)) throw new DataSafetyError("invalid-snapshot");
		}
		for (const [date, candidate] of Object.entries(dailyData ?? {})) {
			const day = asObject(candidate);
			const dailyRecords = asObject(day?.dailyReadData);
			if (!isDateKey(date) || !day || (!dailyRecords && (!legacy || day.dailyReadData !== undefined))
				|| (!Array.isArray(day.sessions) && (!legacy || day.sessions !== undefined))) throw new DataSafetyError("invalid-snapshot");
			for (const [id, record] of Object.entries(dailyRecords ?? {})) {
				if (!isIdentity(id) || !validReadRecord(record)) throw new DataSafetyError("invalid-snapshot");
			}
			if (Array.isArray(day.sessions) && day.sessions.some(session => !validSession(session))) throw new DataSafetyError("invalid-snapshot");
		}
		if (source.progressEntries !== undefined && (!Array.isArray(source.progressEntries) || source.progressEntries.some(entry => !validProgress(entry)))) {
			throw new DataSafetyError("invalid-snapshot");
		}
		if (source.eventLog !== undefined) {
			if (!Array.isArray(source.eventLog)) throw new DataSafetyError("invalid-snapshot");
			const ids = new Map<string, unknown>();
			for (const candidate of source.eventLog) {
				const event = parseStudyEvent(candidate);
				if (!event || !isSafeStudyTimestamp(event.timestamp) || !isIdentity(event.entityId) || (event.fileId !== undefined && !isIdentity(event.fileId))) throw new DataSafetyError("invalid-snapshot");
				if (ids.has(event.id) && canonicalData(ids.get(event.id)) !== canonicalData(candidate)) throw new DataSafetyError("invalid-snapshot");
				ids.set(event.id, candidate);
				const payload = asObject(event.payload);
				if (event.operation === "upsert" && (event.entity === "note" || payload?.id !== event.entityId
					|| (event.fileId !== undefined && payload.fileId !== event.fileId)
					|| (event.entity === "session" ? !validSession(event.payload) : !validProgress(event.payload)))) throw new DataSafetyError("invalid-snapshot");
				if (event.operation === "delete" && event.entity === "note") throw new DataSafetyError("invalid-snapshot");
				if (event.operation === "rename") {
					if (event.entity !== "note" || !isIdentity(payload?.oldPath) || !isIdentity(payload?.newPath)) throw new DataSafetyError("invalid-snapshot");
				}
			}
		}
		return Promise.resolve();
	}

	public async importData(value: unknown, beforeWrite?: BeforeWrite): Promise<void> {
		await this.validateImport(value);
		const parsed = parsePluginData(value);
		await this.mutate(data => {
			data.dataVersion = parsed.dataVersion;
			data.readData = parsed.readData;
			data.dailyData = parsed.dailyData;
			data.progressEntries = parsed.progressEntries;
			data.deviceId = parsed.deviceId || data.deviceId;
			data.eventLog = parsed.eventLog;
			data.settings = parsed.settings;
		}, beforeWrite, true);
	}

	private findSession(data: PluginData, id: string): StudySession | undefined {
		for (const day of Object.values(data.dailyData)) {
			const session = day.sessions.find(candidate => candidate.id === id);
			if (session) return session;
		}
		return undefined;
	}

	private appendEvent(data: PluginData, entity: StudyEvent["entity"], entityId: string, operation: StudyEvent["operation"], fileId?: string, payload?: unknown): void {
		data.deviceId = this.runtimeDeviceId || data.deviceId || `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		const lastTimestamp = data.eventLog[data.eventLog.length - 1]?.timestamp ?? 0;
		const timestamp = Math.max(Date.now(), lastTimestamp + 1);
		data.eventLog.push(createStudyEvent({deviceId: data.deviceId, timestamp, entity, entityId, operation, ...(fileId ? {fileId} : {}), ...(payload !== undefined ? {payload: structuredClone(payload)} : {})}));
	}

	private addSessionToDay(data: PluginData, session: StudySession): void {
		const date = localDateKey(session.openedAt);
		const daily = data.dailyData[date] ?? {dailyReadData: {}, sessions: []};
		daily.sessions.push({...session});
		data.dailyData[date] = daily;
	}

	private removeSessionFromDay(data: PluginData, id: string): void {
		for (const daily of Object.values(data.dailyData)) {
			daily.sessions = daily.sessions.filter(session => session.id !== id);
		}
	}

	private applySessionDelta(data: PluginData, session: StudySession, direction: 1 | -1): void {
		if (data.readData[session.filePath] && data.readData[session.filePath]?.fileId !== session.fileId) throw new DataSafetyError("ambiguous");
		const total = data.readData[session.filePath] ?? {
			fileId: session.fileId,
			filePath: session.filePath,
			duration: 0,
			openCount: 0
		};
		total.fileId = session.fileId;
		total.filePath = session.filePath;
		total.duration = Math.max(0, total.duration + direction * session.duration);
		total.openCount = Math.max(0, total.openCount + direction);
		if (direction === 1) {
			total.firstOpenedAt = Math.min(total.firstOpenedAt ?? session.openedAt, session.openedAt);
			total.lastOpenedAt = Math.max(total.lastOpenedAt ?? session.openedAt, session.openedAt);
		}
		data.readData[session.filePath] = total;

		for (const slice of splitDurationByLocalDay(session.openedAt, session.duration)) {
			const daily = data.dailyData[slice.key] ?? {dailyReadData: {}, sessions: []};
			const dailyRecord = daily.dailyReadData[session.fileId] ?? {
				fileId: session.fileId,
				filePath: session.filePath,
				duration: 0,
				openCount: 0
			};
			dailyRecord.filePath = session.filePath;
			dailyRecord.duration = Math.max(0, dailyRecord.duration + direction * slice.duration);
			daily.dailyReadData[session.fileId] = dailyRecord;
			data.dailyData[slice.key] = daily;
		}
	}
}
