import {App} from "obsidian";
import {DashboardModal} from "../modal/dashboardModal";
import StudyTimeStatisticsPlugin from "../../../main";
import I18n from "../../../language/i18n";

export class RibbonFactory {
	public static createLeaderboardRibbon(plugin: StudyTimeStatisticsPlugin, app: App) {
		plugin.addRibbonIcon('book-open-text', I18n.t('openLeaderboardModal'), (evt: MouseEvent) => {
			new DashboardModal(plugin, app).open();
		});
	}

}
