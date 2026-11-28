import I18n from "../language/i18n";
import {DataSafetyError} from "./dataSafetyError";

export function dataSafetyMessage(error: unknown, fallback: string): string {
	if (!(error instanceof DataSafetyError)) return fallback;
	switch (error.reason) {
		case "invalid-snapshot": return I18n.local("The snapshot did not pass validation. No changes were applied.", "快照未通过校验，没有应用任何更改。");
		case "future-version": return I18n.local("This data was created by an unsupported version. Use a compatible version of the plugin.", "这些数据来自不受支持的版本，请使用与数据兼容的插件版本。");
		case "unreadable": return I18n.local("The existing data could not be verified. Writes are blocked; keep a copy of the original data file.", "无法确认现有数据完整，已禁止写入。请保留原数据文件的副本。");
		case "ambiguous": return I18n.local("These records cannot be reconciled safely. No changes were applied; keep both copies.", "这些记录无法安全核对，没有应用任何更改。请保留两份原始数据。");
		case "changed": return I18n.local("The data changed before this operation could finish. Review the current data and retry.", "操作期间数据已变化。请核对当前记录后重试。");
		case "write": return I18n.local("The save could not be verified. Keep the backup and check the data before retrying.", "无法确认保存成功。请保留备份并核对数据后再试。");
	}
}
