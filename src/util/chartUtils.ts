export function compactDateLabel(dateKey: string): string {
	const parts = dateKey.split("-").map(Number);
	const month = parts[1];
	const day = parts[2];
	if (!month || !day) return dateKey;
	return `${month}/${day}`;
}
