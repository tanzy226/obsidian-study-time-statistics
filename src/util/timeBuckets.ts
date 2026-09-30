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
	return splitDuration(openedAt, duration, timestamp => {
		const date = new Date(timestamp);
		return {
			key: localDateKey(timestamp),
			next: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
		};
	});
}

export function splitSessionByLocalHour(openedAt: number, duration: number): Array<{hour: number; weekday: number; duration: number}> {
	const result: Array<{hour: number; weekday: number; duration: number}> = [];
	let cursor = Math.max(0, openedAt);
	let remaining = Math.max(0, duration);
	while (remaining > 0) {
		const date = new Date(cursor);
		const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1).getTime();
		const slice = Math.min(remaining, Math.max(1, boundary - cursor));
		result.push({hour: date.getHours(), weekday: date.getDay(), duration: slice});
		cursor += slice;
		remaining -= slice;
	}
	return result;
}

function splitDuration(
	openedAt: number,
	duration: number,
	bucket: (timestamp: number) => {key: string; next: number}
): TimeSlice[] {
	const totals = new Map<string, number>();
	let cursor = Math.max(0, openedAt);
	let remaining = Math.max(0, duration);
	while (remaining > 0) {
		const current = bucket(cursor);
		const slice = Math.min(remaining, Math.max(1, current.next - cursor));
		totals.set(current.key, (totals.get(current.key) ?? 0) + slice);
		cursor += slice;
		remaining -= slice;
	}
	return [...totals].map(([key, sliceDuration]) => ({key, duration: sliceDuration}));
}
