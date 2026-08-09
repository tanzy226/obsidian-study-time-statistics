import type {Plugin} from "obsidian";
import {ReadRecord} from "../interface/readRecord";
import {StudySession} from "../interface/studySession";

export interface DailyReadData {
	dailyReadData: Record<string, ReadRecord>;
	sessions: StudySession[];
}

interface PluginData {
	readData: Record<string, ReadRecord>;
	dailyData: Record<string, DailyReadData>;
	settings: {
		strictMode?: boolean;
	};
}

function emptyPluginData(): PluginData {
	return {readData: {}, dailyData: {}, settings: {}};
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
	if (!source || typeof source.fileId !== "string" || typeof source.filePath !== "string") {
		return undefined;
	}
	return {
		fileId: source.fileId,
		filePath: source.filePath,
		openedAt: finiteNumber(source.openedAt),
		closedAt: finiteNumber(source.closedAt),
		duration: Math.max(0, finiteNumber(source.duration))
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
	return {
		readData: parseReadData(source.readData),
		dailyData,
		settings: typeof strictMode === "boolean" ? {strictMode} : {}
	};
}

export class PluginDataManager {
	private data: PluginData = emptyPluginData();

	constructor(private readonly plugin: Plugin) {}

	public async loadData(): Promise<void> {
		const loadedData: unknown = await this.plugin.loadData();
		this.data = parsePluginData(loadedData);
	}

	private async saveData(): Promise<void> {
		await this.plugin.saveData(this.data);
	}

	public getReadRecord(filePath: string): ReadRecord | undefined {
		return this.data.readData[filePath];
	}

	public getReadData(): Readonly<Record<string, ReadRecord>> {
		return this.data.readData;
	}

	public async setReadRecord(filePath: string, record: ReadRecord): Promise<void> {
		await this.loadData();
		this.data.readData[filePath] = record;
		await this.saveData();
	}

	public async deleteReadRecord(filePath: string): Promise<void> {
		await this.loadData();
		if (!(filePath in this.data.readData)) return;
		delete this.data.readData[filePath];
		await this.saveData();
	}

	public getDailyReadData(date: string): DailyReadData | undefined {
		return this.data.dailyData[date];
	}

	public getDailyReadDates(): string[] {
		return Object.keys(this.data.dailyData).sort();
	}

	public async setDailyReadData(date: string, value: DailyReadData): Promise<void> {
		await this.loadData();
		this.data.dailyData[date] = value;
		await this.saveData();
	}

	public getStrictMode(): boolean {
		return this.data.settings.strictMode ?? true;
	}

	public async setStrictMode(value: boolean): Promise<void> {
		await this.loadData();
		this.data.settings.strictMode = value;
		await this.saveData();
	}
}
