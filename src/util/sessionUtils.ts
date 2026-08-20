import {StudySession, StudySessionSource} from "../interface/studySession";

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
	if (!trimmed) return undefined;
	if (!trimmed.includes(":")) {
		const minutes = Number(trimmed);
		return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60_000) : undefined;
	}
	const parts = trimmed.split(":").map(Number);
	if ((parts.length !== 2 && parts.length !== 3) || parts.some(part => !Number.isFinite(part) || part < 0)) return undefined;
	const [first = 0, second = 0, third = 0] = parts;
	if (second >= 60 || third >= 60) return undefined;
	const seconds = parts.length === 2 ? first * 60 + second : first * 3600 + second * 60 + third;
	return Math.round(seconds * 1000);
}
