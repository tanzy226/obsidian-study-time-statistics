import I18n from "../../language/i18n";

export interface BarChartData {
	label: string;
	value: number; // in milliseconds
}

type TimeUnit = 'hours' | 'minutes';

interface BarChartProps {
	data: BarChartData[];
	height?: number;
	maxBars?: number;
	onBarClick?: (label: string) => void;
}

export function BarChart(props: BarChartProps) {
	const { data, height = 200, onBarClick } = props;
	const heightClass = height >= 250 ? 'bar-chart-tall' : 'bar-chart-regular';

	if (!data || data.length === 0) {
		return <div className="bar-chart-empty">No data available</div>;
	}

	const dataInMinutes = data.map(item => ({
		label: item.label,
		value: item.value / (1000 * 60) // Convert to minutes
	}));

	// Determine the best unit based on max value
	const nonZeroValues = dataInMinutes.filter(item => item.value > 0).map(item => item.value);
	const maxMinutes = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) : 1;

	const useHours = maxMinutes > 60;
	const unit: TimeUnit = useHours ? 'hours' : 'minutes';

	// Convert to appropriate unit
	const displayData = dataInMinutes.map(item => ({
		label: item.label,
		value: useHours ? item.value / 60 : item.value
	}));

	const maxValue = useHours ? maxMinutes / 60 : maxMinutes;
	const maxDisplayValue = Math.ceil(maxValue);

	return (
		<div className="bar-chart-container">
			<div className={`bar-chart ${heightClass}`}>
				{displayData.map((item, index) => {
					const barHeight = item.value > 0 ? Math.max((item.value / maxDisplayValue) * 100, 1) : 0;
					const displayValue = item.value < 0.1 ? item.value.toFixed(2) : item.value.toFixed(1);
					const hasData = item.value > 0;
					const unitLabel = unit === 'hours' ? 'h' : 'min';
					const renderedHeight = hasData ? barHeight : 1;

					const handleClick = () => {
						if (hasData && onBarClick) {
							onBarClick(item.label);
						}
					};

					return (
						<div key={index} className="bar-wrapper" onClick={handleClick}>
							<div className="bar-container">
								{hasData && (
									<div className="bar-value-tooltip">
										{displayValue}{unitLabel}
									</div>
								)}
								<svg
									className={`bar ${hasData && onBarClick ? 'bar-clickable' : ''} ${hasData ? '' : 'bar-empty'}`}
									viewBox="0 0 100 100"
									preserveAspectRatio="none"
									aria-label={hasData ? `${item.label}: ${displayValue} ${unitLabel}` : `${item.label}: ${I18n.t('noDataAvailable')}`}
								>
									<rect x="0" y={100 - renderedHeight} width="100" height={renderedHeight} rx="4" />
								</svg>
							</div>
							<div className="bar-label">{item.label}</div>
						</div>
					);
				})}
			</div>
			<div className="bar-chart-y-axis">
				<div className="y-axis-label">{maxDisplayValue}{unit === 'hours' ? 'h' : 'min'}</div>
				<div className="y-axis-label">{(maxDisplayValue / 2).toFixed(1)}{unit === 'hours' ? 'h' : 'min'}</div>
				<div className="y-axis-label">0{unit === 'hours' ? 'h' : 'min'}</div>
			</div>
		</div>
	);
}
