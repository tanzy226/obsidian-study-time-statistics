import * as React from "react";
import I18n from "../../language/i18n";

export interface BarChartData {
	label: string;
	value: number;
}

type TimeUnit = "hours" | "minutes";

interface BarChartProps {
	data: BarChartData[];
	height?: number;
	maxBars?: number;
	onBarClick?: (label: string) => void;
}

export function BarChart({data, height = 200, maxBars, onBarClick}: BarChartProps) {
	const visibleData = maxBars && data.length > maxBars ? data.slice(-maxBars) : data;
	if (visibleData.length === 0) return <div className="bar-chart-empty">{I18n.t("noDataAvailable")}</div>;

	const minutes = visibleData.map(item => Math.max(0, item.value) / 60_000);
	const maxMinutes = Math.max(0, ...minutes);
	const useHours = maxMinutes > 60;
	const unit: TimeUnit = useHours ? "hours" : "minutes";
	const values = minutes.map(value => useHours ? value / 60 : value);
	const maxValue = Math.max(1, Math.ceil(Math.max(0, ...values)));
	const unitLabel = unit === "hours" ? "h" : "min";
	const heightClass = height >= 250 ? "bar-chart-tall" : "bar-chart-regular";

	return <div className="bar-chart-container">
		<div className="bar-chart-y-axis" aria-hidden="true">
			<div className="y-axis-label">{maxValue}{unitLabel}</div>
			<div className="y-axis-label">{(maxValue / 2).toFixed(1)}{unitLabel}</div>
			<div className="y-axis-label">0{unitLabel}</div>
		</div>
		<div className={`bar-chart ${heightClass}`}>
			<div className="bar-chart-grid-line bar-chart-grid-top" />
			<div className="bar-chart-grid-line bar-chart-grid-middle" />
			<div className="bar-chart-grid-line bar-chart-grid-bottom" />
			{visibleData.map((item, index) => {
				const value = values[index] ?? 0;
				const hasData = value > 0;
				const barHeight = hasData ? Math.max((value / maxValue) * 100, 1) : 0;
				const displayValue = value > 0 && value < 0.01 ? "<0.01" : value < 0.1 ? value.toFixed(2) : value.toFixed(1);
				const label = hasData ? `${item.label}: ${displayValue} ${unitLabel}` : `${item.label}: ${I18n.t("noDataAvailable")}`;
				return <div key={`${item.label}-${index}`} className="bar-wrapper">
					<div className="bar-container" {...(!hasData ? {role: "img", "aria-label": label, title: label} : {})}>
						{hasData && <span className="bar-value-tooltip" style={{bottom: `calc(${barHeight}% + 4px)`}}>{displayValue}{unitLabel}</span>}
						{hasData && (onBarClick
							? <div
								className="sts-bar-column is-interactive"
								role="button"
								tabIndex={0}
								aria-label={label}
								title={label}
								style={{height: `${barHeight}%`}}
								onClick={() => onBarClick(item.label)}
								onKeyDown={event => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onBarClick(item.label);
									}
								}}
							/>
							: <div className="sts-bar-column" role="img" aria-label={label} title={label} style={{height: `${barHeight}%`}} />)}
					</div>
					<div className="bar-label" title={item.label}>{item.label}</div>
				</div>;
			})}
		</div>
	</div>;
}
