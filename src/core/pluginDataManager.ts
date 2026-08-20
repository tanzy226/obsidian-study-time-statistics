import type {Plugin} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";
import {createLegacySessionId, createSessionId, isStudySessionSource} from "../util/sessionUtils";
import {ReadingProgressEntry, ReadingProgressInput} from "../interface/readingProgress";
import {clampPercent, createProgressId} from "../util/readingProgressUtils";

export const CURRENT_DATA_VERSION = 5;

export interface DailyReadData {
	dailyReadData: Record<string, ReadRecord>;
	sessions: StudySession[];
}

interface PluginData {
	dataVersion: number;
	readData: Record<string, ReadRecord>;
	dailyData: Record<string, DailyReadData>;
	progressEntries: ReadingProgressEntry[];
	settings: {
		strictMode?: boolean;
		progressTrackingEnabled?: boolean;
		dailyGoalMinutes?: number;
		weeklyGoalMinutes?: number;
	};
}

export interface ManualSessionInput {
	fileId: string;
	filePath: string;
	openedAt: number;
	duration: number;
}

function emptyPluginData(): PluginData {
	return {dataVersion: CURRENT_DATA_VERSION, readData: {}, dailyData: {}, progressEntries: [], settings: {}};
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: undefined;
}

function finiteNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dateKeyFromTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
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
	return {
		id: typeof source.id === "string" && source.id ? source.id : createProgressId(recordedAt),
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
	const dailyGoalMinutes = rawSettings?.dailyGoalMinutes;
	const weeklyGoalMinutes = rawSettings?.weeklyGoalMinutes;
	const rawProgressEntries = source.progressEntries;
	return {
		dataVersion: CURRENT_DATA_VERSION,
		readData: parseReadData(source.readData),
		dailyData,
		progressEntries: Array.isArray(rawProgressEntries)
			? rawProgressEntries.map(parseProgressEntry).filter((entry): entry is ReadingProgressEntry => entry !== undefined)
			: [],
		settings: {
			...(typeof strictMode === "boolean" ? {strictMode} : {}),
			...(typeof progressTrackingEnabled === "boolean" ? {progressTrackingEnabled} : {}),
			...(typeof dailyGoalMinutes === "number" && Number.isFinite(dailyGoalMinutes) ? {dailyGoalMinutes: Math.max(0, dailyGoalMinutes)} : {}),
			...(typeof weeklyGoalMinutes === "number" && Number.isFinite(weeklyGoalMinutes) ? {weeklyGoalMinutes: Math.max(0, weeklyGoalMinutes)} : {})
		}
	};
}

export class PluginDataManager {
	private data: PluginData = emptyPluginData();
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(private readonly plugin: Plugin) {}

	private async loadUnlocked(): Promise<void> {
		const loadedData: unknown = await this.plugin.loadData();
		this.data = parsePluginData(loadedData);
	}

	public async loadData(): Promise<void> {
		await this.mutationQueue;
		await this.loadUnlocked();
	}

	private async saveUnlocked(): Promise<void> {
		await this.plugin.saveData(this.data);
	}

	private mutate<T>(operation: (data: PluginData) => T | Promise<T>): Promise<T> {
		const task = this.mutationQueue.then(async () => {
			await this.loadUnlocked();
			const result = await operation(this.data);
			await this.saveUnlocked();
			return result;
		});
		this.mutationQueue = task.then(() => undefined, () => undefined);
		return task;
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

	public async setDailyReadData(date: string, value: DailyReadData): Promise<void> {
		await this.mutate(data => {
			data.dailyData[date] = {
				dailyReadData: {...value.dailyReadData},
				sessions: value.sessions.map(session => ({...session}))
			};
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

	public getProgressEntries(filePath?: string): ReadingProgressEntry[] {
		return this.data.progressEntries
			.filter(entry => filePath === undefined || entry.filePath === filePath)
			.sort((a, b) => b.recordedAt - a.recordedAt)
			.map(entry => ({...entry}));
	}

	public async createProgressEntry(input: ReadingProgressInput): Promise<ReadingProgressEntry> {
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
		await this.mutate(data => { data.progressEntries.push(entry); });
		return {...entry};
	}

	public async updateProgressEntry(id: string, input: ReadingProgressInput): Promise<ReadingProgressEntry | undefined> {
		return this.mutate(data => {
			const index = data.progressEntries.findIndex(entry => entry.id === id);
			const existing = data.progressEntries[index];
			if (!existing) return undefined;
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
			return {...updated};
		});
	}

	public async deleteProgressEntry(id: string): Promise<boolean> {
		return this.mutate(data => {
			const originalLength = data.progressEntries.length;
			data.progressEntries = data.progressEntries.filter(entry => entry.id !== id);
			return data.progressEntries.length !== originalLength;
		});
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
		await this.mutate(data => {
			const date = dateKeyFromTimestamp(session.openedAt);
			const daily = data.dailyData[date] ?? {dailyReadData: {}, sessions: []};
			if (!daily.sessions.some(candidate => candidate.id === session.id)) daily.sessions.push({...session});
			data.dailyData[date] = daily;
		});
	}

	public async createManualSession(input: ManualSessionInput): Promise<StudySession> {
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
			this.applySessionDelta(data, session, 1);
			this.addSessionToDay(data, session);
		});
		return session;
	}

	public async updateSession(id: string, input: ManualSessionInput): Promise<StudySession | undefined> {
		return this.mutate(data => {
			const existing = this.findSession(data, id);
			if (!existing) return undefined;
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
			return {...updated};
		});
	}

	public async deleteSession(id: string): Promise<boolean> {
		return this.mutate(data => {
			const existing = this.findSession(data, id);
			if (!existing) return false;
			this.removeSessionFromDay(data, id);
			this.applySessionDelta(data, existing, -1);
			return true;
		});
	}

	public async setSessionEngagement(id: string, engagement: StudySession["engagement"]): Promise<boolean> {
		return this.mutate(data => {
			const session = this.findSession(data, id);
			if (!session) return false;
			session.engagement = engagement;
			session.updatedAt = Date.now();
			return true;
		});
	}

	public exportData(): unknown {
		return structuredClone(this.data);
	}

	public async importData(value: unknown): Promise<void> {
		const source = asObject(value);
		if (!source || !asObject(source.readData) || !asObject(source.dailyData)) {
			throw new Error("Invalid Study Time Statistics data snapshot");
		}
		const parsed = parsePluginData(value);
		await this.mutate(data => {
			data.dataVersion = parsed.dataVersion;
			data.readData = parsed.readData;
			data.dailyData = parsed.dailyData;
			data.progressEntries = parsed.progressEntries;
			data.settings = parsed.settings;
		});
	}

	private findSession(data: PluginData, id: string): StudySession | undefined {
		for (const day of Object.values(data.dailyData)) {
			const session = day.sessions.find(candidate => candidate.id === id);
			if (session) return session;
		}
		return undefined;
	}

	private addSessionToDay(data: PluginData, session: StudySession): void {
		const date = dateKeyFromTimestamp(session.openedAt);
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

		const date = dateKeyFromTimestamp(session.openedAt);
		const daily = data.dailyData[date] ?? {dailyReadData: {}, sessions: []};
		const dailyRecord = daily.dailyReadData[session.fileId] ?? {
			fileId: session.fileId,
			filePath: "",
			duration: 0,
			openCount: 0
		};
		dailyRecord.duration = Math.max(0, dailyRecord.duration + direction * session.duration);
		daily.dailyReadData[session.fileId] = dailyRecord;
		data.dailyData[date] = daily;
	}
}
