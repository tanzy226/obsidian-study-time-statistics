import {Notice, Plugin, TFile, TFolder} from 'obsidian';
import {StudyTimeStatisticsSettingTab} from "./setting/studyTimeStatisticsSettingTab";
import {CommandFactory} from "./command/commandFactory";
import I18n from "./language/i18n";
import {TimeTracker} from "./core/timeTracker";
import {PluginDataManager} from "./core/pluginDataManager";
import {DailyReadDataManager} from "./core/dailyReadDataManager";
import {DataAnalyzer} from "./core/dataAnalyzer";
import {RibbonFactory} from "./view/display/ribbon/ribbonFactory";
import {FocusDataAggregator} from "./core/focusDataAggregator";
import {NoteStatsBarManager} from "./view/display/noteStatsBar/noteStatsBarManager";
import {StudyAnalyticsService} from "./core/studyAnalyticsService";
import {DataBackupService} from "./core/dataBackupService";
import {dataSafetyMessage} from "./core/dataSafety";

export default class StudyTimeStatisticsPlugin extends Plugin {
	get dataAnalyzer(): DataAnalyzer {
		return this._dataAnalyzer;
	}

	get dataManager(): PluginDataManager {
		return this._dataManager;
	}

	get focusDataAggregator(): FocusDataAggregator {
		return this._focusDataAggregator;
	}

	get studyAnalyticsService(): StudyAnalyticsService {
		return this._studyAnalyticsService;
	}

	get backupService(): DataBackupService {
		return this._backupService;
	}

	getCurrentSessionDuration(filePath: string): number {
		return this.timeTracker?.getCurrentSessionDuration(filePath) ?? 0;
	}

	private timeTracker?: TimeTracker;
	private _dataManager!: PluginDataManager;
	private dailyReadDataManager!: DailyReadDataManager;
	private _dataAnalyzer!: DataAnalyzer;
	private _focusDataAggregator!: FocusDataAggregator;
	private noteStatsBarManager?: NoteStatsBarManager;
	private _studyAnalyticsService!: StudyAnalyticsService;
	private _backupService!: DataBackupService;

	async onload() {

		this._dataManager = new PluginDataManager(this);
		this.dailyReadDataManager = new DailyReadDataManager(this._dataManager);

		await this.dataManager.loadData();
		this.dataManager.ensureDeviceId();
		this.applyVisualizationAppearance();
		this.init();
		const protection = this.dataManager.getWriteProtection();
		if (protection) new Notice(dataSafetyMessage(protection, I18n.t("actionFailed")));

	}

	onunload() {
		this.timeTracker?.unload();
		this.noteStatsBarManager?.unload();
		document.body.style.removeProperty("--sts-viz-base");
	}

	public applyVisualizationAppearance(): void {
		const appearance = this.dataManager.getVisualizationAppearance();
		document.body.style.setProperty(
			"--sts-viz-base",
			appearance.colorMode === "custom" ? appearance.customColor : "var(--interactive-accent)"
		);
	}

	/**
	 * Initialize the plugin
	 * @private
	 */
	private init() {
		this.setLanguage();
		this.timeTracker = new TimeTracker(this, this.app, this._dataManager, this.dailyReadDataManager);
		this._dataAnalyzer = new DataAnalyzer(this.app, this._dataManager);
		this._focusDataAggregator = new FocusDataAggregator(this.app, this._dataManager, this.dailyReadDataManager);
		this._studyAnalyticsService = new StudyAnalyticsService(this.app, this._dataManager);
		this._backupService = new DataBackupService(this.app, this._dataManager, action => this.timeTracker?.withHistoryReplacement(action) ?? action());
		this._dataManager.setMigrationBackup(snapshot => this._backupService.createBackupFromData(snapshot));
		this.noteStatsBarManager = new NoteStatsBarManager(this, this.app, this._dataManager);
		this.addSettingTab(new StudyTimeStatisticsSettingTab(this.app, this));
		RibbonFactory.createLeaderboardRibbon(this, this.app);
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (file instanceof TFile || file instanceof TFolder) {
				const newPath = file.path;
				const folder = file instanceof TFolder;
				const moveHistory = () => this._backupService.withSafetyBackup(backup => this._dataManager.renameFilePath(oldPath, newPath, folder, backup));
				void (this.timeTracker?.withFileRename(oldPath, newPath, folder, moveHistory) ?? moveHistory()).catch(error => {
					console.error("Study Time Statistics could not move the saved statistics", error);
					new Notice(dataSafetyMessage(error, I18n.t("actionFailed")));
				});
			}
		}));

		// Init commands
		const commandFactory = new CommandFactory(this, this.app);
		commandFactory.create();

	}

	/**
	 * Set the language of the plugin
	 * @private
	 */
	private setLanguage() {
		I18n.getInstance().setLanguage(I18n.autoDetectLanguage());
	}

}
