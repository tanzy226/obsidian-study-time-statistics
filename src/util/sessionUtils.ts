import type {StudySession, StudySessionSource} from "../interface/studySession";

// Keep the work when projecting one contiguous interval into days/hours bounded.
export const MAX_STUDY_DURATION_MS = 31 * 86_400_000;
const MAX_STUDY_TIMESTAMP_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

export function isSafeStudyDuration(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STUDY_DURATION_MS;
}

export function isSafeStudyTimestamp(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STUDY_TIMESTAMP_MS;
}

export function isSafeStudyInterval(openedAt: number, duration: number): boolean {
	return isSafeStudyTimestamp(openedAt) && isSafeStudyDuration(duration) && isSafeStudyTimestamp(openedAt + duration);
}

function hashText(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

export function createSessionId(openedAt = Date.now()): string {
	return `session-${openedAt.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLegacySessionId(session: Pick<StudySession, "fileId" | "filePath" | "openedAt" | "closedAt" | "duration">): string {
	return `legacy-${hashText([session.fileId, session.filePath, session.openedAt, session.closedAt, session.duration].join("|"))}`;
}

export function isStudySessionSource(value: unknown): value is StudySessionSource {
	return value === "automatic" || value === "manual";
}

export function parseDurationInput(value: string): number | undefined {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 32) return undefined;
	const decimal = /^(?:\d+(?:\.\d*)?|\.\d+)$/u;
	if (!trimmed.includes(":")) {
		if (!decimal.test(trimmed)) return undefined;
		const duration = Math.round(Number(trimmed) * 60_000);
		return isSafeStudyDuration(duration) ? duration : undefined;
	}
	const parts = trimmed.split(":").map(part => part.trim());
	if (parts.length !== 2 && parts.length !== 3) return undefined;
	if (!parts.every((part, index) => index === parts.length - 1 ? decimal.test(part) : /^\d+$/u.test(part))) return undefined;
	const [first = 0, second = 0, third = 0] = parts.map(Number);
	if (second >= 60 || third >= 60) return undefined;
	const seconds = parts.length === 2 ? first * 60 + second : first * 3600 + second * 60 + third;
	const duration = Math.round(seconds * 1000);
	return isSafeStudyDuration(duration) ? duration : undefined;
}
