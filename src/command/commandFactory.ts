import {App} from 'obsidian';
import {DashboardModal} from "../view/display/modal/dashboardModal";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";
export class CommandFactory {

	private plugin: StudyTimeStatisticsPlugin;

	private app: App;

	constructor(plugin: StudyTimeStatisticsPlugin, app: App) {
		this.plugin = plugin;
		this.app = app;
	}

	create() {

		this.plugin.addCommand({
			id: 'open-leaderboard',
			name: I18n.t('openDashboard'),
			callback: () => {
				new DashboardModal(this.plugin, this.app).open();
			}
		});

	}
}
