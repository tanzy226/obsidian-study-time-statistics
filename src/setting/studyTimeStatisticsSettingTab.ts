import {App, PluginSettingTab, SettingDefinitionItem} from "obsidian";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";

const STRICT_MODE_KEY = "strictMode";

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
		}];
	}

	getControlValue(key: string): unknown {
		return key === STRICT_MODE_KEY ? this.plugin.dataManager.getStrictMode() : undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === STRICT_MODE_KEY && typeof value === "boolean") {
			await this.plugin.dataManager.setStrictMode(value);
		}
	}
}
