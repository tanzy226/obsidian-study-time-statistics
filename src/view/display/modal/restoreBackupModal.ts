import {Notice} from "obsidian";
import type StudyTimeStatisticsPlugin from "../../../main";
import I18n from "../../../language/i18n";
import {dataSafetyMessage} from "../../../core/dataSafety";
import {ConfirmActionModal} from "./sessionEditorModal";

export async function openRestoreBackupModal(plugin: StudyTimeStatisticsPlugin, onRestored?: () => Promise<void>): Promise<void> {
	try {
		const candidate = await plugin.backupService.findLatestBackup();
		if (!candidate) {
			new Notice(I18n.t("noBackupAvailable"));
			return;
		}
		new ConfirmActionModal(
			plugin.app,
			I18n.t("restoreBackup"),
			I18n.t("restoreBackupConfirm", {
				file: candidate.path.split("/").pop() ?? candidate.path,
				date: new Date(candidate.createdAt).toLocaleString(),
				sessions: candidate.sessionCount,
				progress: candidate.progressCount
			}),
			I18n.t("restore"),
			async () => {
				const path = await plugin.backupService.restoreBackup(candidate);
				new Notice(I18n.t("backupRestored", {path}));
				await onRestored?.();
			}
		).open();
	} catch (error) {
		new Notice(dataSafetyMessage(error, I18n.t("backupLoadError")));
	}
}
