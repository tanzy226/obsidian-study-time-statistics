import {App, Notice} from 'obsidian';
import {DashboardModal} from "../view/display/modal/dashboardModal";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";
import {SessionEditorModal} from "../view/display/modal/sessionEditorModal";
import {ProgressEntryModal} from "../view/display/modal/progressEntryModal";
import {openRestoreBackupModal} from "../view/display/modal/restoreBackupModal";
import {dataSafetyMessage} from "../core/dataSafety";
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

		this.plugin.addCommand({
			id: "record-reading-coverage",
			name: I18n.t("recordProgress"),
			checkCallback: checking => {
				const file = this.app.workspace.getActiveFile();
				if (!this.plugin.dataManager.getProgressTrackingEnabled() || !file || !["md", "pdf"].includes(file.extension.toLowerCase())) return false;
				if (!checking) new ProgressEntryModal(this.app, this.plugin, undefined, file.path, () => undefined).open();
				return true;
			}
		});

		this.plugin.addCommand({
			id: "add-manual-session",
			name: I18n.t("addSession"),
			callback: () => {
				new SessionEditorModal(this.app, this.plugin, undefined, () => undefined).open();
			}
		});

		this.plugin.addCommand({
			id: "create-data-backup",
			name: I18n.t("createBackup"),
			callback: () => {
				void this.plugin.backupService.createBackup().then(path => {
					new Notice(I18n.t("backupCreated", {path}));
				}).catch(error => {
					console.error("Study Time Statistics backup failed", error);
					new Notice(dataSafetyMessage(error, I18n.t("actionFailed")));
				});
			}
		});

		this.plugin.addCommand({
			id: "restore-latest-data-backup",
			name: I18n.t("restoreLatestBackup"),
			callback: () => { void openRestoreBackupModal(this.plugin); }
		});

	}
}
