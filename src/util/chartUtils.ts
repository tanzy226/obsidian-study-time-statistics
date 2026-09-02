export function recentDayAxisLabel(index: number, total: number): string {
	const dayNumber = index + 1;
	if (dayNumber === 1 || dayNumber === total || dayNumber % 5 === 0) {
		return String(dayNumber);
	}
	return "";
}
