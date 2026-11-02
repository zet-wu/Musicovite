import {getElectronAPI, hasElectronNamespace} from './ElectronBridge';
import {isPreference, resolveLocale} from '@/shared/i18n/generated/runtime';
import type {LocalePreference, LocaleState} from '@/shared/i18n/generated/runtime';

// Vite 预览独立存储，仅使用当前语言契约，不读取旧设置。
let preview: LocaleState = {preference: 'system', resolvedLocale: 'zh-CN', revision: 0};
const listeners = new Set<(state: LocaleState) => void>();
export const localeGateway = {
    async getState(): Promise<LocaleState> {
        if (hasElectronNamespace('locale')) return getElectronAPI().locale.getState();
        let preference: LocalePreference = 'system';
        try {
            const saved = JSON.parse(localStorage.getItem('musicbox-locale-v1') || 'null');
            if (isPreference(saved?.preference)) preference = saved.preference;
        } catch { /* 浏览器存储不可用时仍允许预览。 */ }
        preview = {...preview, preference, resolvedLocale: preference === 'system' ? resolveLocale(navigator.languages) : preference};
        return {...preview};
    },
    async setPreference(preference: LocalePreference): Promise<LocaleState> {
        if (!isPreference(preference)) throw new Error('LOCALE_INVALID_PREFERENCE');
        if (hasElectronNamespace('locale')) return getElectronAPI().locale.setPreference(preference);
        localStorage.setItem('musicbox-locale-v1', JSON.stringify({preference}));
        preview = {preference, resolvedLocale: preference === 'system' ? resolveLocale(navigator.languages) : preference, revision: preview.revision + 1};
        listeners.forEach(listener => listener({...preview}));
        return {...preview};
    },
    onChanged(listener: (state: LocaleState) => void): () => void {
        if (hasElectronNamespace('locale')) return getElectronAPI().locale.onChanged(listener);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }
};
