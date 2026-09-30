export type VisualizationColorMode = "theme" | "custom";

export interface VisualizationAppearance {
	colorMode: VisualizationColorMode;
	customColor: string;
}

export const DEFAULT_VISUALIZATION_APPEARANCE: VisualizationAppearance = {
	colorMode: "theme",
	customColor: "#6366f1"
};

export function normalizeVisualizationColorMode(value: unknown): VisualizationColorMode {
	return value === "custom" ? "custom" : "theme";
}

export function normalizeVisualizationColor(value: unknown): string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
		? value.toLowerCase()
		: DEFAULT_VISUALIZATION_APPEARANCE.customColor;
}
