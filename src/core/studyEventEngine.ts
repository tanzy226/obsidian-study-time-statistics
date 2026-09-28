export type StudyEventEntity = "session" | "progress" | "note";
export type StudyEventOperation = "upsert" | "delete" | "rename";

export interface StudyEvent {
	id: string;
	deviceId: string;
	timestamp: number;
	entity: StudyEventEntity;
	entityId: string;
	operation: StudyEventOperation;
	fileId?: string;
	payload?: unknown;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

export function parseStudyEvent(value: unknown): StudyEvent | undefined {
	const source = asObject(value);
	if (!source || typeof source.id !== "string" || typeof source.deviceId !== "string" || typeof source.timestamp !== "number" || !Number.isFinite(source.timestamp) || typeof source.entityId !== "string") return undefined;
	if (source.entity !== "session" && source.entity !== "progress" && source.entity !== "note") return undefined;
	if (source.operation !== "upsert" && source.operation !== "delete" && source.operation !== "rename") return undefined;
	return {id: source.id, deviceId: source.deviceId, timestamp: source.timestamp, entity: source.entity, entityId: source.entityId, operation: source.operation, ...(typeof source.fileId === "string" ? {fileId: source.fileId} : {}), ...(source.payload !== undefined ? {payload: structuredClone(source.payload)} : {})};
}

export function createStudyEvent(input: Omit<StudyEvent, "id">): StudyEvent {
	return {...input, id: `${input.deviceId}:${input.timestamp}:${Math.random().toString(36).slice(2, 10)}`};
}

export function legacySessionEvent(session: {id: string; fileId: string; updatedAt: number}, payload: unknown): StudyEvent {
	return {id: `legacy:session:${session.id}`, deviceId: "legacy", timestamp: session.updatedAt, entity: "session", entityId: session.id, operation: "upsert", fileId: session.fileId, payload: structuredClone(payload)};
}

export function mergeStudyEvents(...eventSets: StudyEvent[][]): StudyEvent[] {
	const unique = new Map<string, StudyEvent>();
	for (const event of eventSets.flat()) {
		const existing = unique.get(event.id);
		if (!existing || compareStudyEvents(existing, event) < 0) unique.set(event.id, structuredClone(event));
	}
	return [...unique.values()].sort(compareStudyEvents);
}

export function compareStudyEvents(a: StudyEvent, b: StudyEvent): number {
	return a.timestamp - b.timestamp || a.deviceId.localeCompare(b.deviceId) || a.id.localeCompare(b.id);
}

export function latestEventsByEntity(events: StudyEvent[]): Map<string, StudyEvent> {
	const result = new Map<string, StudyEvent>();
	for (const event of [...events].sort(compareStudyEvents)) result.set(`${event.entity}:${event.entityId}`, event);
	return result;
}

export interface StudyEventIndex {
	byEntity: ReadonlyMap<string, StudyEvent>;
	byFileId: ReadonlyMap<string, readonly StudyEvent[]>;
	count: number;
}

export function buildStudyEventIndex(events: StudyEvent[]): StudyEventIndex {
	const byFileId = new Map<string, StudyEvent[]>();
	for (const event of events) {
		if (!event.fileId) continue;
		const list = byFileId.get(event.fileId) ?? [];
		list.push(event);
		byFileId.set(event.fileId, list);
	}
	return {byEntity: latestEventsByEntity(events), byFileId, count: events.length};
}
