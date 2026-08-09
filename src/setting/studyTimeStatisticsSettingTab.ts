import {App, PluginSettingTab, Setting} from "obsidian";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";

export class StudyTimeStatisticsSettingTab extends PluginSettingTab {
	plugin: StudyTimeStatisticsPlugin;

	constructor(app: App, plugin: StudyTimeStatisticsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const {containerEl} = this;
		containerEl.empty();
		await this.plugin.dataManager.loadData();
		this.addStrictModeSetting(containerEl);

	}

	private addStrictModeSetting(containerEl: HTMLElement) {
		const strictModeSetting = this.plugin.dataManager.get('settings', 'strictMode');
		new Setting(containerEl)
			.setName(I18n.t('strictMode'))
			.setDesc(I18n.t('strictModeDesc'))
			.addToggle((toggle) =>
				toggle
					.setValue(strictModeSetting !== undefined ? strictModeSetting : true)
					.onChange((value) => {
						this.plugin.dataManager.put('settings', 'strictMode', value).finally();
					})
			)
	}

}
