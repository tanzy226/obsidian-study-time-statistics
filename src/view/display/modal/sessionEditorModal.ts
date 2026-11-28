import {App, Modal, Notice, Setting, TFile, normalizePath} from "obsidian";
import StudyTimeStatisticsPlugin from "../../../main";
import {dataSafetyMessage} from "../../../core/dataSafety";
import {StudySession} from "../../../interface/studySession";
import I18n from "../../../language/i18n";
import {isSafeStudyInterval, parseDurationInput} from "../../../util/sessionUtils";

function toLocalDateTimeInput(timestamp: number): string {
	const date = new Date(timestamp);
	const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

function formatDurationInput(duration: number): string {
	const totalSeconds = Math.max(0, Math.round(duration / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor(totalSeconds % 3600 / 60);
	const seconds = totalSeconds % 60;
	return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

export class SessionEditorModal extends Modal {
	private saving = false;

	constructor(
		app: App,
		private readonly plugin: StudyTimeStatisticsPlugin,
		private readonly session: StudySession | undefined,
		private readonly onSaved: () => void
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.session ? I18n.t("editSession") : I18n.t("addSession"));
		const activePath = this.app.workspace.getActiveFile()?.path ?? "";
		let filePath = this.session?.filePath ?? activePath;
		const initialOpenedAtText = toLocalDateTimeInput(this.session?.openedAt ?? Date.now());
		const initialDurationText = formatDurationInput(this.session?.duration ?? 0);
		let openedAtText = initialOpenedAtText;
		let durationText = initialDurationText;

		new Setting(this.contentEl)
			.setName(I18n.t("sessionNotePath"))
			.setDesc(I18n.t("sessionNotePathDesc"))
			.addText(text => text.setValue(filePath).onChange(value => { filePath = value; }));

		new Setting(this.contentEl)
			.setName(I18n.t("sessionStart"))
			.addText(text => {
				text.inputEl.type = "datetime-local";
				text.setValue(openedAtText).onChange(value => { openedAtText = value; });
			});

		new Setting(this.contentEl)
			.setName(I18n.t("sessionDuration"))
			.setDesc(I18n.t("sessionDurationDesc"))
			.addText(text => text.setPlaceholder("00:25:00").setValue(durationText).onChange(value => { durationText = value; }));

		new Setting(this.contentEl).addButton(button => button
			.setCta()
			.setButtonText(I18n.t("save"))
			.onClick(() => {
				if (this.saving) return;
				const openedAt = this.session && openedAtText === initialOpenedAtText ? this.session.openedAt : new Date(openedAtText).getTime();
				const duration = this.session && durationText === initialDurationText ? this.session.duration : parseDurationInput(durationText);
				button.setDisabled(true);
				void this.save(filePath, openedAt, duration).finally(() => { button.setDisabled(false); });
			}));
	}

	private async save(filePathValue: string, openedAt: number, duration: number | undefined): Promise<void> {
		const filePath = normalizePath(filePathValue.trim());
		const file = this.app.vault.getFileByPath(filePath);
		if (!(file instanceof TFile) || !["md", "pdf"].includes(file.extension.toLowerCase())) {
			new Notice(I18n.t("sessionInvalidNote"));
			return;
		}
		if (duration === undefined || !isSafeStudyInterval(openedAt, duration)) {
			new Notice(I18n.t("sessionInvalidTime"));
			return;
		}
		const input = {
			fileId: this.plugin.dataManager.getReadRecord(filePath)?.fileId ?? filePath,
			filePath,
			openedAt,
			duration
		};
		this.saving = true;
		try {
			const id = this.session?.id;
			const saved = await this.plugin.backupService.withSafetyBackup(backup => id
				? this.plugin.dataManager.updateSession(id, input, backup)
				: this.plugin.dataManager.createManualSession(input, backup));
			if (!saved) {
				new Notice(I18n.local("This session is no longer available.", "这条会话已不存在。"));
				return;
			}
		} catch (error) {
			console.error("Study Time Statistics failed to save a session", error);
			new Notice(dataSafetyMessage(error, I18n.t("actionFailed")));
			return;
		} finally {
			this.saving = false;
		}
		new Notice(I18n.t("sessionSaved"));
		this.onSaved();
		this.close();
	}
}

export class ConfirmActionModal extends Modal {
	private running = false;

	constructor(
		app: App,
		private readonly titleText: string,
		private readonly description: string,
		private readonly confirmText: string,
		private readonly action: () => Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.titleText);
		this.contentEl.createEl("p", {text: this.description});
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText(I18n.t("cancel")).onClick(() => {
				if (!this.running) this.close();
			}))
			.addButton(button => button.setDestructive().setButtonText(this.confirmText).onClick(() => {
				if (this.running) return;
				button.setDisabled(true);
				void this.runAction().finally(() => { button.setDisabled(false); });
			}));
	}

	private async runAction(): Promise<void> {
		this.running = true;
		try {
			await this.action();
			this.close();
		} catch (error) {
			console.error("Study Time Statistics action failed", error);
			new Notice(dataSafetyMessage(error, I18n.t("actionFailed")));
		} finally {
			this.running = false;
		}
	}
}
