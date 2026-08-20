import {App, Notice} from 'obsidian';
import {DashboardModal} from "../view/display/modal/dashboardModal";
import StudyTimeStatisticsPlugin from "../main";
import I18n from "../language/i18n";
import {ConfirmActionModal, SessionEditorModal} from "../view/display/modal/sessionEditorModal";
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
					new Notice(I18n.t("actionFailed"));
				});
			}
		});

		this.plugin.addCommand({
			id: "restore-latest-data-backup",
			name: I18n.t("restoreLatestBackup"),
			callback: () => {
				new ConfirmActionModal(
					this.app,
					I18n.t("restoreBackup"),
					I18n.t("restoreBackupConfirm"),
					I18n.t("restore"),
					async () => {
						const path = await this.plugin.backupService.restoreLatestBackup();
						new Notice(path ? I18n.t("backupRestored", {path}) : I18n.t("noBackupAvailable"));
					}
				).open();
			}
		});

	}
}
