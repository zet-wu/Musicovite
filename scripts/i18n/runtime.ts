import {createInstance} from 'i18next';
import {resources} from './resources';

export type SupportedLocale = 'zh-CN' | 'zh-TW' | 'en';
export type LocalePreference = SupportedLocale | 'system';
export interface LocaleState { preference: LocalePreference; resolvedLocale: SupportedLocale; revision: number }
export const preferences = ['system', 'zh-CN', 'zh-TW', 'en'] as const;
export function isPreference(value: unknown): value is LocalePreference {
    return typeof value === 'string' && (preferences as readonly string[]).includes(value);
}
export function resolveLocale(languages: readonly string[]): SupportedLocale {
    for (const language of languages) {
        try {
            const locale = new Intl.Locale(language);
            if (locale.language === 'en') return 'en';
            if (locale.language !== 'zh') continue;
            if (locale.script === 'Hans') return 'zh-CN';
            if (locale.script === 'Hant') return 'zh-TW';
            return ['TW', 'HK', 'MO'].includes(locale.region || '') ? 'zh-TW' : 'zh-CN';
        } catch { /* 无效系统标签继续匹配下一项。 */ }
    }
    return 'zh-CN';
}
export function createTranslator(locale: SupportedLocale = 'zh-CN') {
    const instance = createInstance();
    void instance.init({resources, lng: locale, supportedLngs: ['zh-CN', 'zh-TW', 'en'],
        fallbackLng: 'zh-CN', load: 'currentOnly', initAsync: false,
        defaultNS: 'common', returnNull: false, returnEmptyString: false,
        interpolation: {escapeValue: false}});
    return instance;
}
