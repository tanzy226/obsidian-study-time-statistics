import {App, Modal, Notice, Setting, TFile, normalizePath} from "obsidian";
import {dataSafetyMessage} from "../../../core/dataSafety";
import {DataSafetyError} from "../../../core/dataSafetyError";
import StudyTimeStatisticsPlugin from "../../../main";
import {ReadingProgressEntry} from "../../../interface/readingProgress";
import I18n from "../../../language/i18n";
import {countReadableCharacters} from "../../../util/readingProgressUtils";
import {isSafeStudyDuration, isSafeStudyTimestamp, parseDurationInput} from "../../../util/sessionUtils";

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
	private saving = false;

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
		const initialRecordedAt = this.entry?.recordedAt ?? Date.now();
		const initialRecordedAtText = toLocalDateTimeInput(initialRecordedAt);
		let recordedAtText = initialRecordedAtText;
		let percentText = String(this.entry?.percent ?? 0);
		let startPositionText = this.entry?.startPosition === undefined ? "" : String(this.entry.startPosition);
		let endPositionText = this.entry?.endPosition === undefined ? "" : String(this.entry.endPosition);
		let readCharactersText = this.entry?.measurement === "manual" ? String(this.entry.readCharacters) : "";
		const initialDuration = this.entry?.activeDuration ?? this.plugin.getCurrentSessionDuration(filePath);
		const initialDurationText = durationInput(initialDuration);
		let activeDurationText = initialDurationText;

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
		new Setting(this.contentEl)
			.setName(I18n.t("readingStartPosition"))
			.setDesc(I18n.t("readingPositionDesc"))
			.addText(text => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "100";
				text.inputEl.step = "0.1";
				text.setValue(startPositionText).onChange(value => { startPositionText = value; });
			});
		new Setting(this.contentEl)
			.setName(I18n.t("readingEndPosition"))
			.setDesc(I18n.t("readingEndPositionDesc"))
			.addText(text => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "100";
				text.inputEl.step = "0.1";
				text.setValue(endPositionText).onChange(value => { endPositionText = value; });
			});
		new Setting(this.contentEl)
			.setName(I18n.t("charactersReadThisTime"))
			.setDesc(I18n.t("charactersReadThisTimeDesc"))
			.addText(text => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.step = "1";
				text.setValue(readCharactersText).onChange(value => { readCharactersText = value; });
			});
		new Setting(this.contentEl).addButton(button => button
			.setCta()
			.setButtonText(I18n.t("save"))
			.onClick(() => {
				if (this.saving) return;
				const recordedAt = recordedAtText === initialRecordedAtText ? initialRecordedAt : new Date(recordedAtText).getTime();
				const activeDuration = activeDurationText === initialDurationText ? initialDuration : parseDurationInput(activeDurationText);
				button.setDisabled(true);
				void this.save(filePath, recordedAt, percentText, activeDuration, startPositionText, endPositionText, readCharactersText)
					.finally(() => { button.setDisabled(false); });
			}));
	}

	private async save(pathValue: string, recordedAt: number, percentText: string, activeDuration: number | undefined, startText: string, endText: string, charactersText: string): Promise<void> {
		const filePath = normalizePath(pathValue.trim());
		const file = this.app.vault.getFileByPath(filePath);
		const percent = Number(percentText);
		const startPosition = startText.trim() === "" ? undefined : Number(startText);
		const endPosition = endText.trim() === "" ? undefined : Number(endText);
		const readCharacters = charactersText.trim() === "" ? undefined : Number(charactersText);
		if (!(file instanceof TFile) || !["md", "pdf"].includes(file.extension.toLowerCase())) {
			new Notice(I18n.t("sessionInvalidNote"));
			return;
		}
		if (!isSafeStudyTimestamp(recordedAt) || recordedAt === 0 || !Number.isFinite(percent) || percent <= 0 || percent > 100 || !isSafeStudyDuration(activeDuration)) {
			new Notice(I18n.t("progressInvalid"));
			return;
		}
		if ((startPosition !== undefined && (!Number.isFinite(startPosition) || startPosition < 0 || startPosition > 100)) ||
			(endPosition !== undefined && (!Number.isFinite(endPosition) || endPosition < 0 || endPosition > 100)) ||
			(startPosition !== undefined && endPosition !== undefined && startPosition > endPosition) ||
			(readCharacters !== undefined && (!Number.isFinite(readCharacters) || readCharacters < 0 || readCharacters > Number.MAX_SAFE_INTEGER))) {
			new Notice(I18n.t("readingDetailsInvalid"));
			return;
		}
		this.saving = true;
		try {
			let characterCount = this.entry?.characterCount ?? 0;
			if (file.extension.toLowerCase() === "md") {
				characterCount = countReadableCharacters(await this.app.vault.cachedRead(file));
			}
			if (this.app.vault.getFileByPath(filePath) !== file) throw new DataSafetyError("changed");
			const input = {
				fileId: this.plugin.dataManager.getReadRecord(filePath)?.fileId ?? filePath,
				filePath,
				percent,
				recordedAt,
				characterCount,
				activeDuration,
				...(startPosition !== undefined ? {startPosition} : {}),
				...(endPosition !== undefined ? {endPosition} : {}),
				...(readCharacters !== undefined ? {readCharacters, measurement: "manual" as const} : {measurement: "estimated" as const})
			};
			const id = this.entry?.id;
			const saved = await this.plugin.backupService.withSafetyBackup(backup => id
				? this.plugin.dataManager.updateProgressEntry(id, input, backup)
				: this.plugin.dataManager.createProgressEntry(input, backup));
			if (!saved) {
				new Notice(I18n.local("This reading record is no longer available.", "这条阅读记录已不存在。"));
				return;
			}
		} catch (error) {
			console.error("Study Time Statistics failed to save reading progress", error);
			new Notice(dataSafetyMessage(error, I18n.t("actionFailed")));
			return;
		} finally {
			this.saving = false;
		}
		new Notice(I18n.t("progressSaved"));
		this.onSaved();
		this.close();
	}
}
