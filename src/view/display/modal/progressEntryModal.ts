import {App, Modal, Notice, Setting, TFile, normalizePath} from "obsidian";
import StudyTimeStatisticsPlugin from "../../../main";
import {ReadingProgressEntry} from "../../../interface/readingProgress";
import I18n from "../../../language/i18n";
import {countReadableCharacters} from "../../../util/readingProgressUtils";
import {parseDurationInput} from "../../../util/sessionUtils";

function toLocalDateTimeInput(timestamp: number): string {
	const date = new Date(timestamp);
	const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

function durationInput(duration: number): string {
	const totalSeconds = Math.max(0, Math.round(duration / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor(totalSeconds % 3600 / 60);
	const seconds = totalSeconds % 60;
	return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

export class ProgressEntryModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: StudyTimeStatisticsPlugin,
		private readonly entry: ReadingProgressEntry | undefined,
		private readonly filePathOverride: string | undefined,
		private readonly onSaved: () => void
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.entry ? I18n.t("editProgressEntry") : I18n.t("recordProgress"));
		const activePath = this.app.workspace.getActiveFile()?.path ?? "";
		let filePath = this.entry?.filePath ?? this.filePathOverride ?? activePath;
		let recordedAtText = toLocalDateTimeInput(this.entry?.recordedAt ?? Date.now());
		let percentText = String(this.entry?.percent ?? 0);
		const initialDuration = this.entry?.activeDuration ?? this.plugin.getCurrentSessionDuration(filePath);
		let activeDurationText = durationInput(initialDuration);

		this.contentEl.createEl("p", {cls: "setting-item-description", text: I18n.t("progressMeaning")});
		new Setting(this.contentEl)
			.setName(I18n.t("sessionNotePath"))
			.setDesc(I18n.t("sessionNotePathDesc"))
			.addText(text => text.setValue(filePath).onChange(value => { filePath = value; }));
		new Setting(this.contentEl)
			.setName(I18n.t("progressRecordedAt"))
			.addText(text => {
				text.inputEl.type = "datetime-local";
				text.setValue(recordedAtText).onChange(value => { recordedAtText = value; });
			});
		new Setting(this.contentEl)
			.setName(I18n.t("progressThisReading"))
			.setDesc(I18n.t("progressThisReadingDesc"))
			.addText(text => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "100";
				text.inputEl.step = "0.1";
				text.setValue(percentText).onChange(value => { percentText = value; });
			});
		new Setting(this.contentEl)
			.setName(I18n.t("progressActiveDuration"))
			.setDesc(I18n.t("progressActiveDurationDesc"))
			.addText(text => text.setValue(activeDurationText).onChange(value => { activeDurationText = value; }));
		new Setting(this.contentEl).addButton(button => button
			.setCta()
			.setButtonText(I18n.t("save"))
			.onClick(() => { void this.save(filePath, recordedAtText, percentText, activeDurationText); }));
	}

	private async save(pathValue: string, recordedAtText: string, percentText: string, durationText: string): Promise<void> {
		const filePath = normalizePath(pathValue.trim());
		const file = this.app.vault.getFileByPath(filePath);
		const recordedAt = new Date(recordedAtText).getTime();
		const percent = Number(percentText);
		const activeDuration = parseDurationInput(durationText);
		if (!(file instanceof TFile) || !["md", "pdf"].includes(file.extension.toLowerCase())) {
			new Notice(I18n.t("sessionInvalidNote"));
			return;
		}
		if (!Number.isFinite(recordedAt) || !Number.isFinite(percent) || percent <= 0 || percent > 100 || activeDuration === undefined) {
			new Notice(I18n.t("progressInvalid"));
			return;
		}
		let characterCount = this.entry?.characterCount ?? 0;
		if (file.extension.toLowerCase() === "md") {
			characterCount = countReadableCharacters(await this.app.vault.cachedRead(file));
		}
		await this.plugin.backupService.createSafetyBackup();
		const input = {
			fileId: this.plugin.dataManager.getReadRecord(filePath)?.fileId ?? filePath,
			filePath,
			percent,
			recordedAt,
			characterCount,
			activeDuration
		};
		if (this.entry) await this.plugin.dataManager.updateProgressEntry(this.entry.id, input);
		else await this.plugin.dataManager.createProgressEntry(input);
		new Notice(I18n.t("progressSaved"));
		this.onSaved();
		this.close();
	}
}
