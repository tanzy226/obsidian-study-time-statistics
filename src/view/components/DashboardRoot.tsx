import * as React from 'react';
import StudyTimeStatisticsPlugin from "../../main";
import I18n from "../../language/i18n";
import { TimeUtils } from "../../util/timeUtils";
import { StatisticsView } from "./StatisticsView";
import { setIcon } from "obsidian";
import { StudyAnalyticsView } from "./StudyAnalyticsView";
import {SessionHistoryView} from "./SessionHistoryView";
import {ReadingProgressView} from "./ReadingProgressView";
import {StudyGoalsView} from "./StudyGoalsView";
import {StudyCockpitView} from "./StudyCockpitView";
import {FeedbackView} from "./FeedbackView";
import {DataHealthView} from "./DataHealthView";

type ViewType = 'overview' | 'analytics' | 'records' | 'more';
type AnalyticsTab = 'summary' | 'trends' | 'ranking';
type RecordsTab = 'sessions' | 'progress' | 'goals';
type MoreTab = 'health' | 'feedback';

export function DashboardRoot(props: { plugin: StudyTimeStatisticsPlugin; onSelect: (filePath: string) => void }) {
    const { plugin, onSelect } = props;
    const [viewType, setViewType] = React.useState<ViewType>('overview');
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const overlayRef = React.useRef<HTMLDivElement>(null);
    const toggleIconRef = React.useRef<HTMLSpanElement>(null);

    React.useEffect(() => {
        if (toggleIconRef.current) {
            setIcon(toggleIconRef.current, 'menu');
        }
    }, []);

    const handleViewChange = (view: ViewType) => {
        setViewType(view);
        setSidebarOpen(false);
    };

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const closeSidebar = () => {
        setSidebarOpen(false);
    };

    function SidebarButton(props: { icon: string; label: string; active: boolean; onClick: () => void }) {
        const iconRef = React.useRef<HTMLSpanElement>(null);
        
        React.useEffect(() => {
            if (iconRef.current) {
                setIcon(iconRef.current, props.icon);
            }
        }, [props.icon]);

        return (
            <button 
                className={`sidebar-button ${props.active ? 'active' : ''}`}
                onClick={props.onClick}
            >
                <span className="sidebar-button-icon" ref={iconRef}></span>
                <span>{props.label}</span>
            </button>
        );
    }

    return (
        <div className="study-time-statistics-modal-container">
            <button className="sidebar-toggle" onClick={toggleSidebar}>
                <span className="sidebar-toggle-icon" ref={toggleIconRef}></span>
                <span>{I18n.t('menu')}</span>
            </button>
            <div 
                className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
                onClick={closeSidebar}
                ref={overlayRef}
            ></div>
            <div className={`study-time-statistics-sidebar ${sidebarOpen ? 'open' : ''}`}>
                <h2 className="sidebar-title">{I18n.t('focusTimeTitle')}</h2>
				<SidebarButton
					icon="layout-dashboard"
					label={I18n.t('studyCockpit')}
					active={viewType === 'overview'}
					onClick={() => handleViewChange('overview')}
				/>
                <SidebarButton
                    icon="bar-chart-3"
					label={I18n.t('analyticsHub')}
					active={viewType === 'analytics'}
					onClick={() => handleViewChange('analytics')}
                />
                <SidebarButton
                    icon="history"
					label={I18n.t('recordsHub')}
					active={viewType === 'records'}
					onClick={() => handleViewChange('records')}
                />
                <SidebarButton
                    icon="ellipsis"
					label={I18n.t('moreHub')}
					active={viewType === 'more'}
					onClick={() => handleViewChange('more')}
                />
            </div>
            
            <div className="study-time-statistics-content">
				{viewType === 'overview' && <StudyCockpitView plugin={plugin} onSelect={onSelect} />}
				{viewType === 'analytics' && <AnalyticsHub plugin={plugin} onSelect={onSelect} />}
				{viewType === 'records' && <RecordsHub plugin={plugin} onSelect={onSelect} />}
				{viewType === 'more' && <MoreHub plugin={plugin} />}
            </div>
        </div>
    );
}

function HubTabs<T extends string>({value, onChange, items}: {value: T; onChange: (value: T) => void; items: Array<{value: T; label: string}>}) {
	return <div className="dashboard-subnav" role="tablist">{items.map(item => <button key={item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

function AnalyticsHub({plugin, onSelect}: {plugin: StudyTimeStatisticsPlugin; onSelect: (filePath: string) => void}) {
	const [tab, setTab] = React.useState<AnalyticsTab>('summary');
	return <><HubTabs value={tab} onChange={setTab} items={[
		{value: 'summary', label: I18n.t('analyticsSummary')},
		{value: 'trends', label: I18n.t('analyticsTrends')},
		{value: 'ranking', label: I18n.t('leaderboard')}
	]} />
		{tab === 'summary' && <StudyAnalyticsView plugin={plugin} onSelect={onSelect} />}
		{tab === 'trends' && <StatisticsView plugin={plugin} onSelect={onSelect} />}
		{tab === 'ranking' && <LeaderboardView plugin={plugin} onSelect={onSelect} />}
	</>;
}

function RecordsHub({plugin, onSelect}: {plugin: StudyTimeStatisticsPlugin; onSelect: (filePath: string) => void}) {
	const [tab, setTab] = React.useState<RecordsTab>('sessions');
	return <><HubTabs value={tab} onChange={setTab} items={[
		{value: 'sessions', label: I18n.t('sessionHistory')},
		{value: 'progress', label: I18n.t('readingCoverage')},
		{value: 'goals', label: I18n.t('studyGoals')}
	]} />
		{tab === 'sessions' && <SessionHistoryView plugin={plugin} onSelect={onSelect} />}
		{tab === 'progress' && <ReadingProgressView plugin={plugin} onSelect={onSelect} />}
		{tab === 'goals' && <StudyGoalsView plugin={plugin} onSelect={onSelect} />}
	</>;
}

function MoreHub({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	const [tab, setTab] = React.useState<MoreTab>('health');
	return <><HubTabs value={tab} onChange={setTab} items={[
		{value: 'health', label: I18n.t('dataHealth')},
		{value: 'feedback', label: I18n.t('feedback')}
	]} />
		{tab === 'health' && <DataHealthView plugin={plugin} />}
		{tab === 'feedback' && <FeedbackView plugin={plugin} />}
	</>;
}

function LeaderboardView(props: { plugin: StudyTimeStatisticsPlugin; onSelect: (filePath: string) => void }) {
    const { plugin, onSelect } = props;
    const leaderboardData = plugin.dataAnalyzer.analyzeLeaderboardTotal();

    if (!leaderboardData || leaderboardData.length === 0) {
        return (
            <div>
                <h2 className="leaderboard-modal-title">{I18n.t('leaderboardTitle')}</h2>
                <p className="leaderboard-no-data">{I18n.t('leaderboardNoData')}</p>
                <p className="leaderboard-no-data">{I18n.t('leaderboardNoData2')}</p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="leaderboard-modal-title">{I18n.t('leaderboardTitle')}</h2>
            <div className="leaderboard-container">
                {leaderboardData.map((item, index) => {
                    const formattedReadTime = TimeUtils.getFormattedReadingTime(item.totalTime);
                    const noteName = getFormattedNoteName(item.filePath);
                    return (
                        <div
                            key={item.filePath}
                            className="leaderboard-entry"
                            onClick={() => onSelect(item.fileRecord.filePath)}
                        >
                            <div className="leaderboard-left">
                                <div className="leaderboard-file-name" title={item.filePath}>{`${index + 1}. ${noteName}`}</div>
                                <div className="leaderboard-file-path" title={item.filePath}>{item.filePath}</div>
                            </div>
                            <span className="leaderboard-time">{formattedReadTime}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getFormattedNoteName(filePath: string) {
    const noteName = filePath.split("/").pop() ?? "";
    if (noteName.length > 25) {
        return noteName.substring(0, 25) + "...";
    } else {
        return noteName;
    }
}
