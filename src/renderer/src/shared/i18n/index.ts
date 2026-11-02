import {createTranslator} from './generated/runtime';
import type {LocalePreference, LocaleState} from './generated/runtime';
import {localeGateway} from '@/infrastructure/electron/LocaleGateway';

export type {LocalePreference, LocaleState, SupportedLocale} from './generated/runtime';
const translator = createTranslator();
let state: LocaleState = {preference: 'system', resolvedLocale: 'zh-CN', revision: -1};
const listeners = new Set<() => void>();
let initialization: Promise<void> | undefined;
let queue = Promise.resolve();
const renderedBindings = new WeakMap<Element, Map<string, string>>();
const liveBindings = new WeakMap<Element, Map<string, {render: () => string; last: string}>>();
const liveElements = new Set<WeakRef<Element>>();
export const getLocaleState = (): LocaleState => ({...state});
export const getLocale = () => state.resolvedLocale;
export const t = (key: string, params: Record<string, unknown> = {}): string => {
    let value = String(translator.t(key, params));
    if (!value.trim()) value = String(translator.t(key, {...params, lng: 'zh-CN'}));
    return value.trim() && value !== key ? value : String(translator.t('common:unavailable', {lng: 'zh-CN'}));
};
export const escapeTranslation = (value: string): string => value.replace(/[&<>"']/g, character =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]!));
export const th = (key: string, params: Record<string, unknown> = {}) => escapeTranslation(t(key, params));
export const htmlT = (key: string, params: Record<string, unknown> = {}): string =>
    `<span data-i18n="${escapeTranslation(key)}" data-i18n-params="${escapeTranslation(JSON.stringify(params))}">${th(key, params)}</span>`;
export function onLocaleChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
function apply(next: LocaleState): Promise<void> {
    const operation = queue.then(async () => {
        if (next.revision <= state.revision) return;
        await translator.changeLanguage(next.resolvedLocale);
        state = {...next};
        if (typeof document !== 'undefined') {
            document.documentElement.lang = next.resolvedLocale;
            translateDOM(document);
            const languageSelect = document.querySelector<HTMLSelectElement>('#language-select');
            if (languageSelect) languageSelect.value = state.preference;
            for (const reference of liveElements) {
                const element = reference.deref();
                if (!element) { liveElements.delete(reference); continue; }
                for (const [property, binding] of liveBindings.get(element) || []) {
                    const current = property === 'textContent' ? element.textContent : element.getAttribute(property);
                    if (current !== binding.last) { liveBindings.get(element)?.delete(property); continue; }
                    const render = () => binding.last = binding.render();
                    if (property === 'textContent') element.textContent = render();
                    else element.setAttribute(property, render());
                }
            }
        }
        listeners.forEach(listener => {
            try { listener(); } catch (error) { console.warn('⚠️ 语言刷新失败:', error); }
        });
    });
    queue = operation.catch(() => {});
    return operation;
}
export function initializeLocale(): Promise<void> {
    return initialization ??= (async () => {
        const dispose = localeGateway.onChanged(next => { void apply(next); });
        window.addEventListener('beforeunload', dispose, {once: true});
        await apply(await localeGateway.getState());
        document.documentElement.removeAttribute('data-locale-loading');
    })();
}
export async function setLocalePreference(preference: LocalePreference): Promise<void> {
    await apply(await localeGateway.setPreference(preference));
}
export function bindLocalizedText(element: Element, render: () => string, property = 'textContent'): void {
    if (!['textContent', 'title', 'placeholder', 'aria-label', 'alt', 'label'].includes(property)) throw new Error('Invalid text binding');
    if (!liveBindings.has(element)) { liveBindings.set(element, new Map()); liveElements.add(new WeakRef(element)); }
    liveBindings.get(element)!.set(property, {render, last: render()});
    element.removeAttribute(property === 'textContent' ? 'data-i18n' : `data-i18n-${property}`);
    if (property === 'textContent') element.textContent = render();
    else element.setAttribute(property, render());
}
export function setLocalizedText(element: Element, key: string, params: Record<string, unknown> = {}, property = 'textContent'): void {
    liveBindings.get(element)?.delete(property);
    const attribute = property === 'textContent' || property === 'innerText' ? 'data-i18n' : `data-i18n-${property}`;
    element.setAttribute(attribute, key);
    element.setAttribute('data-i18n-params', JSON.stringify(params));
    if (property === 'textContent' || property === 'innerText') element.textContent = t(key, params);
    else if (['title', 'placeholder', 'aria-label', 'alt', 'label'].includes(property)) element.setAttribute(property, t(key, params));
    const previous = renderedBindings.get(element) || new Map<string, string>();
    previous.set(attribute, t(key, params));
    renderedBindings.set(element, previous);
}
export function translateDOM(root: ParentNode): void {
    const attributes = ['title', 'placeholder', 'aria-label', 'alt', 'label'] as const;
    const selector = ['[data-i18n]', ...attributes.map(attribute => `[data-i18n-${attribute}]`)].join(',');
    const elements = [...root.querySelectorAll<HTMLElement>(selector)];
    if (root instanceof HTMLElement && root.matches(selector)) elements.unshift(root);
    for (const element of elements) {
        const previous = renderedBindings.get(element) || new Map<string, string>();
        const params = JSON.parse(element.getAttribute('data-i18n-params') || '{}');
        const key = element.getAttribute('data-i18n');
        // 业务已写入用户内容时取消旧占位绑定，绝不将用户内容覆盖为翻译。
        if (key && (!previous.has('data-i18n') || previous.get('data-i18n') === element.textContent)) {
            element.textContent = t(key, params);
            previous.set('data-i18n', element.textContent);
        } else if (key) element.removeAttribute('data-i18n');
        for (const attribute of attributes) {
            const marker = `data-i18n-${attribute}`;
            const attributeKey = element.getAttribute(marker);
            if (attributeKey && (!previous.has(marker) || previous.get(marker) === element.getAttribute(attribute))) {
                const value = t(attributeKey, params);
                element.setAttribute(attribute, value);
                previous.set(marker, value);
            } else if (attributeKey) element.removeAttribute(marker);
        }
        renderedBindings.set(element, previous);
    }
}
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(getLocale(), options).format(value);
export const formatDateTime = (value: number | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(getLocale(), options).format(value);
export const formatRelativeTime = (value: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat(getLocale(), {numeric: 'auto'}).format(value, unit);
