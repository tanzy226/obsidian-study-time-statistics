import {App, MarkdownView} from "obsidian";
import StudyTimeStatisticsPlugin from "../../../main";
import {PluginDataManager} from "../../../core/pluginDataManager";
import {TimeUtils} from "../../../util/timeUtils";
import I18n from "../../../language/i18n";
import {NoteStudyRow} from "../../../core/studyAnalytics";

export class NoteStatsBarManager {
	private readonly app: App;
	private readonly dataManager: PluginDataManager;
	private readonly plugin: StudyTimeStatisticsPlugin;
	private extendedStats = new Map<string, NoteStudyRow>();

	constructor(plugin: StudyTimeStatisticsPlugin, app: App, dataManager: PluginDataManager) {
		this.app = app;
		this.dataManager = dataManager;
		this.plugin = plugin;
		plugin.registerEvent(app.workspace.on("layout-change", () => this.render()));
		plugin.registerEvent(app.workspace.on("file-open", () => this.render()));
		plugin.registerEvent(app.workspace.on("active-leaf-change", () => this.render()));
		plugin.registerInterval(window.setInterval(() => this.render(), 1000));
		plugin.registerInterval(window.setInterval(() => this.refreshExtendedStats(), 15000));
		app.workspace.onLayoutReady(() => {
			this.render();
			this.refreshExtendedStats();
		});
	}

	public render() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			const host = view.contentEl;
			const target = this.getScrollableNoteTarget(view, host);
			let bar = host.querySelector(".study-time-statistics-note-bar") as HTMLElement | null;
			if (!bar) {
				bar = document.createElement("div");
				bar.className = "study-time-statistics-note-bar";
			}
			if (bar.parentElement !== target) target.prepend(bar);

			const record = this.dataManager.get("readData", view.file.path);
			const openCount = Math.max(0, Number(record?.openCount) || 0);
			const duration = Math.max(0, Number(record?.duration) || 0);
			const average = openCount > 0 ? duration / openCount : 0;
			const extended = this.extendedStats.get(view.file.path);
			bar.replaceChildren();
			this.addMetric(bar, I18n.t("inlineOpenCount"), I18n.t("times", {count: openCount}));
			this.addMetric(bar, I18n.t("inlineTotalTime"), TimeUtils.getPreciseFormattedReadingTime(duration));
			this.addMetric(bar, I18n.t("inlineAverageTime"), TimeUtils.getPreciseFormattedReadingTime(average));
			this.addMetric(bar, I18n.t("inlineLongestSession"), TimeUtils.getPreciseFormattedReadingTime(extended?.longestSession || 0));
			this.addMetric(bar, I18n.t("inlineActiveDays"), I18n.t("days", {count: extended?.activeDays || 0}));
			this.addMetric(bar, I18n.t("inlineCurrentStreak"), I18n.t("days", {count: extended?.currentStreak || 0}));
			this.addMetric(bar, I18n.t("inlineLastRead"), this.formatLastRead(extended?.lastReadAt || record?.lastOpenedAt || 0));
		}
	}

	private getScrollableNoteTarget(view: MarkdownView, host: HTMLElement): HTMLElement {
		const selector = view.getMode() === "preview"
			? ".markdown-preview-sizer"
			: ".cm-sizer";
		return (host.querySelector(selector) as HTMLElement | null) || host;
	}

	private async refreshExtendedStats() {
		try {
			const analytics = await this.plugin.studyAnalyticsService.analyze();
			this.extendedStats = new Map(analytics.notes.map(row => [row.filePath, row]));
			this.render();
		} catch (error) {
			console.error("Study Time Statistics failed to refresh inline analytics", error);
		}
	}

	private formatLastRead(timestamp: number): string {
		if (!timestamp) return I18n.t("never");
		return new Date(timestamp).toLocaleString(undefined, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit"
		});
	}

	private addMetric(bar: HTMLElement, label: string, value: string) {
		const item = document.createElement("span");
		item.className = "study-time-statistics-note-bar-item";
		const labelEl = document.createElement("span");
		labelEl.className = "study-time-statistics-note-bar-label";
		labelEl.textContent = `${label}：`;
		const valueEl = document.createElement("span");
		valueEl.className = "study-time-statistics-note-bar-value";
		valueEl.textContent = value;
		item.append(labelEl, valueEl);
		bar.append(item);
	}

	public unload() {
		document.querySelectorAll(".study-time-statistics-note-bar").forEach(element => element.remove());
	}
}
