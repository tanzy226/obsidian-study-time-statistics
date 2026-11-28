import {isSafeStudyInterval, MAX_STUDY_DURATION_MS} from "./sessionUtils";

export interface TimeSlice {
	key: string;
	duration: number;
}

export function localDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Split elapsed time at local-midnight boundaries. */
export function splitDurationByLocalDay(openedAt: number, duration: number): TimeSlice[] {
	const totals = new Map<string, number>();
	const ok = visitSlices(openedAt, duration, MAX_STUDY_DURATION_MS / 86_400_000 + 4, date => {
		const boundary = new Date(date);
		return boundary.setHours(24, 0, 0, 0);
	}, (date, elapsed) => {
		const key = localDateKey(date.getTime());
		totals.set(key, (totals.get(key) ?? 0) + elapsed);
	});
	return ok ? [...totals].map(([key, elapsed]) => ({key, duration: elapsed})) : [];
}

export function splitSessionByLocalHour(openedAt: number, duration: number): Array<{hour: number; weekday: number; duration: number}> {
	const result: Array<{hour: number; weekday: number; duration: number}> = [];
	const ok = visitSlices(openedAt, duration, MAX_STUDY_DURATION_MS / 3_600_000 + 4, date => {
		const boundary = new Date(date);
		return boundary.setHours(date.getHours() + 1, 0, 0, 0);
	}, (date, elapsed) => {
		result.push({hour: date.getHours(), weekday: date.getDay(), duration: elapsed});
	});
	return ok ? result : [];
}

function visitSlices(
	openedAt: number,
	duration: number,
	maxSlices: number,
	nextBoundary: (date: Date) => number,
	visit: (date: Date, elapsed: number) => void
): boolean {
	if (!isSafeStudyInterval(openedAt, duration)) return false;
	const end = openedAt + duration;
	let cursor = openedAt;
	for (let count = 0; cursor < end && count < maxSlices; count++) {
		const date = new Date(cursor);
		const next = Math.min(end, nextBoundary(date));
		if (!Number.isFinite(next) || next <= cursor) return false;
		visit(date, next - cursor);
		cursor = next;
	}
	return cursor === end;
}
