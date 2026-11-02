import {createTranslator} from '../../i18n/generated/runtime';

export const nativeTranslator = createTranslator();
export const nativeT = (key: string, params: Record<string, unknown> = {}): string => {
    let value = String(nativeTranslator.t(key, params));
    if (!value.trim()) value = String(nativeTranslator.t(key, {...params, lng: 'zh-CN'}));
    return value !== key && value.trim() ? value : String(nativeTranslator.t('common:unavailable', {lng: 'zh-CN'}));
};
