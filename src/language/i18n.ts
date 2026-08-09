import en from "./locale/en.json";
import zh from "./locale/zh.json";
import {moment} from "obsidian";

type Translations = Record<string, string>;
type TranslationParams = Record<string, string | number>;

const ENGLISH_TRANSLATIONS: Translations = en;
const CHINESE_TRANSLATIONS: Translations = zh;

class I18n {
	private static instance: I18n;
	private readonly translations = new Map<string, Translations>([
		["en", ENGLISH_TRANSLATIONS],
		["zh", CHINESE_TRANSLATIONS]
	]);

	private constructor(private language = "en") {}

	public static getInstance(defaultLanguage = "en"): I18n {
		I18n.instance ??= new I18n(defaultLanguage);
		return I18n.instance;
	}

	public setLanguage(language: string): void {
		this.language = language;
	}

	public t(key: string, params: TranslationParams = {}): string {
		const selected = this.translations.get(this.language) ?? ENGLISH_TRANSLATIONS;
		let translation = selected[key] ?? ENGLISH_TRANSLATIONS[key] ?? key;
		for (const [param, value] of Object.entries(params)) {
			translation = translation.replace(`{${param}}`, String(value));
		}
		return translation;
	}

	public static t(key: string, params: TranslationParams = {}): string {
		return I18n.getInstance().t(key, params);
	}

	public static autoDetectLanguage(defaultLanguage = "en"): string {
		return moment.locale().split("-")[0] || defaultLanguage;
	}
}

export default I18n;
