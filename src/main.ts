import {Plugin} from 'obsidian';
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
		this.init();

	}

	onunload() {
		this.timeTracker?.unload();
		this.noteStatsBarManager?.unload();
	}

	/**
	 * Initialize the plugin
	 * @private
	 */
	private init() {
		this.setLanguage();
		this.timeTracker = new TimeTracker(this, this.app, this._dataManager, this.dailyReadDataManager);
		this._dataAnalyzer = new DataAnalyzer(this, this.app, this._dataManager);
		this._focusDataAggregator = new FocusDataAggregator(this.app, this._dataManager, this.dailyReadDataManager);
		this._studyAnalyticsService = new StudyAnalyticsService(this.app, this._dataManager, this.dailyReadDataManager);
		this._backupService = new DataBackupService(this.app, this._dataManager);
		this.noteStatsBarManager = new NoteStatsBarManager(this, this.app, this._dataManager);
		this.addSettingTab(new StudyTimeStatisticsSettingTab(this.app, this));
		RibbonFactory.createLeaderboardRibbon(this, this.app);

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
