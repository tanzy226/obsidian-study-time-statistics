export function adaptiveLevel(values: readonly number[], value: number, levels = 5): number {
	if (!Number.isFinite(value) || value <= 0 || levels < 1) return 0;
	const positive = values.filter(candidate => Number.isFinite(candidate) && candidate > 0).sort((a, b) => a - b);
	if (!positive.length) return 0;
	const lowerOrEqual = positive.filter(candidate => candidate <= value).length;
	return Math.min(levels, Math.max(1, Math.ceil(lowerOrEqual / positive.length * levels)));
}

export function linearHeight(values: readonly number[], value: number, minimumVisible = 4): number {
	if (!Number.isFinite(value) || value <= 0) return 0;
	const maximum = Math.max(0, ...values.filter(Number.isFinite));
	if (maximum <= 0) return 0;
	return Math.min(100, Math.max(minimumVisible, value / maximum * 100));
}
