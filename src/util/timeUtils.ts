import I18n from "../language/i18n";

export class TimeUtils {

	/**
	 * Get the formatted reading time
	 * @param timeMilliseconds
	 */
	static getFormattedReadingTime(timeMilliseconds: number): string {
		const readMinutes = timeMilliseconds / 1000 / 60;
		const hours = Math.floor(readMinutes / 60);
		const minutes = Math.floor(readMinutes % 60);

		if (hours === 0) {
			if (minutes === 0) {
				return I18n.t("lessThanOneMinute");
			}
			return I18n.t("minutes", {minute: minutes.toFixed(0)});
		}

		return I18n.t("hours_minutes", {hour: hours, minute: minutes.toFixed(0)});
	}

	static getPreciseFormattedReadingTime(timeMilliseconds: number): string {
		const seconds = Math.max(0, Math.floor(timeMilliseconds / 1000));
		if (seconds < 60) {
			return I18n.t("seconds", {second: seconds});
		}
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return I18n.t("minutes_seconds", {minute: minutes, second: seconds % 60});
		}
		const hours = Math.floor(minutes / 60);
		return I18n.t("hours_minutes", {hour: hours, minute: minutes % 60});
	}

	/**
	 * Returns the current date in the format of YYYY-MM-DD
	 */
	static getDateToday() {
		const today = new Date();
		const year = today.getFullYear();
		const month = today.getMonth() + 1;
		const day = today.getDate();
		return `${year}-${month}-${day}`;
	}

	static getDateFromTimestamp(timestamp: number) {
		const date = new Date(timestamp);
		return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
	}
}
