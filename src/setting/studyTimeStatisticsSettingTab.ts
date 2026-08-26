import {App, PluginSettingTab, SettingDefinitionItem} from "obsidian";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";

const STRICT_MODE_KEY = "strictMode";
const PROGRESS_TRACKING_KEY = "progressTrackingEnabled";

export class StudyTimeStatisticsSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: StudyTimeStatisticsPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [{
			name: I18n.t("strictMode"),
			desc: I18n.t("strictModeDesc"),
			control: {
				type: "toggle",
				key: STRICT_MODE_KEY,
				defaultValue: true
			}
		}, {
			name: I18n.t("progressTracking"),
			desc: I18n.t("progressTrackingDesc"),
			control: {
				type: "toggle",
				key: PROGRESS_TRACKING_KEY,
				defaultValue: false
			}
		}];
	}

	getControlValue(key: string): unknown {
		if (key === STRICT_MODE_KEY) return this.plugin.dataManager.getStrictMode();
		if (key === PROGRESS_TRACKING_KEY) return this.plugin.dataManager.getProgressTrackingEnabled();
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === STRICT_MODE_KEY && typeof value === "boolean") {
			await this.plugin.dataManager.setStrictMode(value);
		}
		if (key === PROGRESS_TRACKING_KEY && typeof value === "boolean") {
			await this.plugin.dataManager.setProgressTrackingEnabled(value);
		}
	}
}
