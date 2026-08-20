import {ReadingProgressEntry} from "../interface/readingProgress";

export function createProgressId(timestamp = Date.now()): string {
	return `progress-${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function countReadableCharacters(markdown: string): number {
	const readable = markdown
		.replace(/^---[\s\S]*?---\s*/u, "")
		.replace(/```[\s\S]*?```/gu, "")
		.replace(/`[^`]*`/gu, "")
		.replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
		.replace(/<[^>]+>/gu, "")
		.replace(/[#>*_~|-]/gu, "")
		.replace(/\s/gu, "");
	return [...readable].length;
}

export interface NoteProgressSummary {
	filePath: string;
	coverage: number;
	entryCount: number;
	characterCount: number;
	totalActiveDuration: number;
	estimatedCoveredCharacters: number;
	totalReadCharacters: number;
	repeatedCharacters: number;
	currentPosition?: number;
	charactersPerMinute: number;
	lastRecordedAt: number;
}

export function summarizeNoteProgress(entries: ReadingProgressEntry[]): NoteProgressSummary[] {
	const grouped = new Map<string, ReadingProgressEntry[]>();
	for (const entry of entries) {
		const list = grouped.get(entry.filePath) ?? [];
		list.push(entry);
		grouped.set(entry.filePath, list);
	}
	return [...grouped.entries()].map(([filePath, noteEntries]) => {
		const coverage = clampPercent(noteEntries.reduce((sum, entry) => sum + entry.percent, 0));
		const characterCount = Math.max(0, ...noteEntries.map(entry => entry.characterCount));
		const totalActiveDuration = noteEntries.reduce((sum, entry) => sum + Math.max(0, entry.activeDuration), 0);
		const estimatedCoveredCharacters = noteEntries.reduce((sum, entry) => {
			return sum + readingCharacters(entry);
		}, 0);
		const latestPositionEntry = [...noteEntries]
			.filter(entry => entry.endPosition !== undefined)
			.sort((a, b) => b.recordedAt - a.recordedAt)[0];
		const uniqueCharacters = Math.min(characterCount, characterCount * coverage / 100);
		return {
			filePath,
			coverage,
			entryCount: noteEntries.length,
			characterCount,
			totalActiveDuration,
			estimatedCoveredCharacters,
			totalReadCharacters: estimatedCoveredCharacters,
			repeatedCharacters: Math.max(0, estimatedCoveredCharacters - uniqueCharacters),
			...(latestPositionEntry?.endPosition !== undefined ? {currentPosition: latestPositionEntry.endPosition} : {}),
			charactersPerMinute: totalActiveDuration > 0 ? estimatedCoveredCharacters / (totalActiveDuration / 60_000) : 0,
			lastRecordedAt: Math.max(...noteEntries.map(entry => entry.recordedAt))
		};
	});
}

export function readingCharacters(entry: Pick<ReadingProgressEntry, "readCharacters" | "characterCount" | "percent">): number {
	if (Number.isFinite(entry.readCharacters) && entry.readCharacters >= 0) return entry.readCharacters;
	return Math.max(0, entry.characterCount) * clampPercent(entry.percent) / 100;
}

export interface ReadingIntakeSummary {
	totalCharacters: number;
	uniqueCharacters: number;
	repeatedCharacters: number;
	equivalentPasses: number;
	secondsPerThousandCharacters: number;
	manualEntryCount: number;
	estimatedEntryCount: number;
	notesAtEnd: number;
}

export function summarizeReadingIntake(entries: ReadingProgressEntry[]): ReadingIntakeSummary {
	const notes = summarizeNoteProgress(entries);
	const totalCharacters = entries.reduce((sum, entry) => sum + readingCharacters(entry), 0);
	const capacity = notes.reduce((sum, note) => sum + note.characterCount, 0);
	const uniqueCharacters = notes.reduce((sum, note) => sum + Math.min(note.characterCount, note.characterCount * note.coverage / 100), 0);
	const totalDuration = entries.reduce((sum, entry) => sum + Math.max(0, entry.activeDuration), 0);
	return {
		totalCharacters,
		uniqueCharacters,
		repeatedCharacters: Math.max(0, totalCharacters - uniqueCharacters),
		equivalentPasses: capacity > 0 ? totalCharacters / capacity : 0,
		secondsPerThousandCharacters: totalCharacters > 0 ? totalDuration / 1000 / (totalCharacters / 1000) : 0,
		manualEntryCount: entries.filter(entry => entry.measurement === "manual").length,
		estimatedEntryCount: entries.filter(entry => entry.measurement !== "manual").length,
		notesAtEnd: notes.filter(note => (note.currentPosition ?? 0) >= 99.9).length
	};
}
