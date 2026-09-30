import {App, PluginSettingTab, SettingDefinitionItem} from "obsidian";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";

const STRICT_MODE_KEY = "strictMode";
const PROGRESS_TRACKING_KEY = "progressTrackingEnabled";
const IDLE_TIMEOUT_KEY = "idleTimeoutMinutes";
const VISUALIZATION_COLOR_MODE_KEY = "visualizationColorMode";
const VISUALIZATION_CUSTOM_COLOR_KEY = "visualizationCustomColor";

export class StudyTimeStatisticsSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: StudyTimeStatisticsPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [{
			name: I18n.t("strictMode"),
			desc: I18n.t("strictModeDesc"),
			control: {type: "toggle", key: STRICT_MODE_KEY, defaultValue: true}
		}, {
			name: I18n.t("progressTracking"),
			desc: I18n.t("progressTrackingDesc"),
			control: {type: "toggle", key: PROGRESS_TRACKING_KEY, defaultValue: false}
		}, {
			name: I18n.t("idleTimeout"),
			desc: I18n.t("idleTimeoutDesc"),
			control: {type: "number", key: IDLE_TIMEOUT_KEY, defaultValue: 20, min: 0, max: 120, step: 1}
		}, {
			name: I18n.t("visualizationColorMode"),
			desc: I18n.t("visualizationColorModeDesc"),
			control: {
				type: "dropdown",
				key: VISUALIZATION_COLOR_MODE_KEY,
				defaultValue: "theme",
				options: {theme: I18n.t("visualizationColorTheme"), custom: I18n.t("visualizationColorCustom")}
			}
		}, {
			name: I18n.t("visualizationCustomColor"),
			desc: I18n.t("visualizationCustomColorDesc"),
			visible: () => this.plugin.dataManager.getVisualizationAppearance().colorMode === "custom",
			control: {type: "color", key: VISUALIZATION_CUSTOM_COLOR_KEY, defaultValue: "#6366f1"}
		}];
	}

	getControlValue(key: string): unknown {
		if (key === STRICT_MODE_KEY) return this.plugin.dataManager.getStrictMode();
		if (key === PROGRESS_TRACKING_KEY) return this.plugin.dataManager.getProgressTrackingEnabled();
		if (key === IDLE_TIMEOUT_KEY) return this.plugin.dataManager.getTrackingPrecision().idleTimeoutMinutes;
		if (key === VISUALIZATION_COLOR_MODE_KEY) return this.plugin.dataManager.getVisualizationAppearance().colorMode;
		if (key === VISUALIZATION_CUSTOM_COLOR_KEY) return this.plugin.dataManager.getVisualizationAppearance().customColor;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === STRICT_MODE_KEY && typeof value === "boolean") await this.plugin.dataManager.setStrictMode(value);
		if (key === PROGRESS_TRACKING_KEY && typeof value === "boolean") await this.plugin.dataManager.setProgressTrackingEnabled(value);
		if (key === IDLE_TIMEOUT_KEY && typeof value === "number") await this.plugin.dataManager.setTrackingPrecision({idleTimeoutMinutes: value});
		if (key === VISUALIZATION_COLOR_MODE_KEY && (value === "theme" || value === "custom")) {
			await this.plugin.dataManager.setVisualizationAppearance({colorMode: value});
			this.plugin.applyVisualizationAppearance();
			this.update();
		}
		if (key === VISUALIZATION_CUSTOM_COLOR_KEY && typeof value === "string") {
			await this.plugin.dataManager.setVisualizationAppearance({customColor: value});
			this.plugin.applyVisualizationAppearance();
		}
	}
}
