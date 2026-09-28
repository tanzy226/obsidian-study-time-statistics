import {App, PluginSettingTab, SettingDefinitionItem} from "obsidian";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";

const STRICT_MODE_KEY = "strictMode";
const PROGRESS_TRACKING_KEY = "progressTrackingEnabled";
const IDLE_TIMEOUT_KEY = "idleTimeoutMinutes";
const MINIMUM_SESSION_KEY = "minimumSessionSeconds";

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
		}, {
			name: "Idle timeout / 空闲暂停时间",
			desc: "Pause counting after this many minutes without keyboard, pointer, touch, or scroll activity. Quiet reading remains counted until this limit.",
			control: {type: "number", key: IDLE_TIMEOUT_KEY, defaultValue: 20, min: 1, max: 120, step: 1}
		}, {
			name: "Minimum session / 最短会话",
			desc: "Very short automatic visits stay in total time but are omitted from session history.",
			control: {type: "number", key: MINIMUM_SESSION_KEY, defaultValue: 5, min: 0, max: 300, step: 1}
		}];
	}

	getControlValue(key: string): unknown {
		if (key === STRICT_MODE_KEY) return this.plugin.dataManager.getStrictMode();
		if (key === PROGRESS_TRACKING_KEY) return this.plugin.dataManager.getProgressTrackingEnabled();
		if (key === IDLE_TIMEOUT_KEY) return this.plugin.dataManager.getTrackingPrecision().idleTimeoutMinutes;
		if (key === MINIMUM_SESSION_KEY) return this.plugin.dataManager.getTrackingPrecision().minimumSessionSeconds;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === STRICT_MODE_KEY && typeof value === "boolean") {
			await this.plugin.dataManager.setStrictMode(value);
		}
		if (key === PROGRESS_TRACKING_KEY && typeof value === "boolean") {
			await this.plugin.dataManager.setProgressTrackingEnabled(value);
		}
		if (key === IDLE_TIMEOUT_KEY && typeof value === "number") await this.plugin.dataManager.setTrackingPrecision({idleTimeoutMinutes: value});
		if (key === MINIMUM_SESSION_KEY && typeof value === "number") await this.plugin.dataManager.setTrackingPrecision({minimumSessionSeconds: value});
	}
}
