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
			return sum + entry.characterCount * clampPercent(entry.percent) / 100;
		}, 0);
		return {
			filePath,
			coverage,
			entryCount: noteEntries.length,
			characterCount,
			totalActiveDuration,
			estimatedCoveredCharacters,
			charactersPerMinute: totalActiveDuration > 0 ? estimatedCoveredCharacters / (totalActiveDuration / 60_000) : 0,
			lastRecordedAt: Math.max(...noteEntries.map(entry => entry.recordedAt))
		};
	});
}
