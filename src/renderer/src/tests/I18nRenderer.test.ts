import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {LocaleState} from '../shared/i18n/generated/runtime';
import type {LyricsCandidatePreview} from '../features/lyrics/domain/types';

class TextElement {
    textContent = '';
    value = '';
    attributes = new Map<string, string>();
    children: TextElement[] = [];
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    removeAttribute(name: string) { this.attributes.delete(name); }
    matches() { return [...this.attributes.keys()].some(key => key.startsWith('data-i18n') && key !== 'data-i18n-params'); }
    querySelectorAll() { return this.children.filter(child => child.matches()); }
}

let changed: (state: LocaleState) => void;
let revision: number;
let snapshot: () => Promise<LocaleState>;
let root: TextElement;
let languageSelect: TextElement;
const unsubscribe = vi.fn();
beforeEach(() => {
    vi.resetModules();
    revision = 0;
    snapshot = async () => ({preference: 'zh-CN', resolvedLocale: 'zh-CN', revision: 0});
    root = new TextElement();
    languageSelect = new TextElement();
    vi.stubGlobal('HTMLElement', TextElement);
    vi.stubGlobal('document', {
        documentElement: {lang: '', removeAttribute: vi.fn()},
        querySelectorAll: () => root.querySelectorAll(),
        querySelector: () => languageSelect
    });
    vi.stubGlobal('window', {addEventListener: vi.fn()});
    vi.doMock('../infrastructure/electron/LocaleGateway', () => ({localeGateway: {
        onChanged: (callback: typeof changed) => { changed = callback; return unsubscribe; },
        getState: () => snapshot(),
        setPreference: async (preference: 'en' | 'zh-CN' | 'zh-TW') => {
            const state = {preference, resolvedLocale: preference, revision: ++revision};
            changed(state);
            return state;
        }
    }}));
});
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../infrastructure/electron/LocaleGateway'); });

describe('渲染语言同步与状态保留', () => {
    it('快捷键数量、录入提示和菜单分组在切换后原位刷新', async () => {
        const locale = await import('../shared/i18n');
        await locale.initializeLocale();
        const summary = new TextElement();
        const recording = new TextElement();
        const group = new TextElement();
        root.children = [summary, recording, group];
        locale.setLocalizedText(summary as unknown as Element, 'audit:shortcutSummaryDetails', {count: 3, local: 2, global: 1});
        locale.setLocalizedText(recording as unknown as Element, 'audit:pressShortcut');
        locale.setLocalizedText(group as unknown as Element, 'messages:builtinPresets', {}, 'label');
        await locale.setLocalePreference('en');
        expect(summary.textContent).toBe('3 shortcuts configured (2 in-app, 1 global)');
        expect(recording.textContent).toBe('Press a shortcut...');
        expect(group.getAttribute('label')).toBe('Built-in presets');
        await locale.setLocalePreference('zh-TW');
        expect(recording.textContent).toBe('請按下快速鍵...');
        expect(root.children).toEqual([summary, recording, group]);
    });
    it('歌词格式与特性徽章随三语切换，保留原始格式名和歌词正文', async () => {
        const locale = await import('../shared/i18n');
        const {describeLyricsCandidatePreview} = await import('../features/lyrics/domain/describeLyricsCandidatePreview');
        await locale.initializeLocale();
        const preview: LyricsCandidatePreview = {
            format: 'lrc', fallbackFrom: 'qrc', fallbackReason: 'source-unavailable',
            document: {
                ttmlText: '<tt/>', ttml: {metadata: {}, lines: []},
                source: {kind: 'provider', providerId: 'test', candidateId: 'candidate'},
                render: {metadata: [], lines: [{
                    words: [{word: '原文', startTime: 0, endTime: 100,
                        romanWord: 'yuanwen', ruby: [{word: 'かな', startTime: 0, endTime: 100}]}],
                    translatedLyric: '用户歌词翻译', romanLyric: '',
                    startTime: 0, endTime: 100, isBG: false, isDuet: false
                }]}
            }
        };
        const badges = describeLyricsCandidatePreview(preview).map((_label, index) => {
            const badge = new TextElement();
            locale.bindLocalizedText(badge as unknown as Element, () => describeLyricsCandidatePreview(preview)[index]);
            return badge;
        });
        const original = JSON.stringify(preview);
        await locale.setLocalePreference('en');
        expect(badges.map(badge => badge.textContent)).toEqual([
            'LRC', 'Line by line', 'Source has no QRC', 'Translation', 'Romanization', 'Ruby annotations'
        ]);
        await locale.setLocalePreference('zh-TW');
        expect(badges.map(badge => badge.textContent)).toEqual(['LRC', '逐行', '來源未提供 QRC', '翻譯', '音譯', '注音']);
        await locale.setLocalePreference('zh-CN');
        expect(badges.map(badge => badge.textContent)).toEqual(['LRC', '逐行', '来源无 QRC', '翻译', '音译', '注音']);
        expect(JSON.stringify(preview)).toBe(original);
    });
    it('先订阅再取快照，忽略过期快照和事件', async () => {
        snapshot = async () => {
            changed({preference: 'en', resolvedLocale: 'en', revision: 2});
            return {preference: 'zh-CN', resolvedLocale: 'zh-CN', revision: 0};
        };
        const locale = await import('../shared/i18n');
        await locale.initializeLocale();
        expect(locale.getLocale()).toBe('en');
        revision = 2;
        changed({preference: 'zh-CN', resolvedLocale: 'zh-CN', revision: 1});
        await locale.setLocalePreference('zh-TW');
        expect(locale.getLocaleState().revision).toBe(3);
        expect(languageSelect.value).toBe('zh-TW');
    });
    it('更新已绑定文案、复数与动态状态，保留输入和用户写入的文本', async () => {
        const locale = await import('../shared/i18n');
        const label = new TextElement();
        label.setAttribute('data-i18n', 'app:settings');
        const input = new TextElement();
        input.value = '未保存 <tag> & "名称"';
        input.setAttribute('data-i18n-placeholder', 'app:enterPlaylistName');
        const count = new TextElement();
        const state = new TextElement();
        const userName = new TextElement();
        userName.setAttribute('data-i18n', 'app:unknownArtist');
        root.children = [label, input, count, state, userName];
        await locale.initializeLocale();
        locale.setLocalizedText(count as unknown as Element, 'common:tracks', {count: 2});
        let playing = true;
        locale.bindLocalizedText(state as unknown as Element, () => locale.t(playing ? 'app:pause' : 'app:play'), 'title');
        userName.textContent = '<img src=x> & user artist';
        await locale.setLocalePreference('en');
        expect(label.textContent).toBe('Settings');
        expect(count.textContent).toBe('2 tracks');
        expect(state.getAttribute('title')).toBe('Pause');
        expect(input.value).toBe('未保存 <tag> & "名称"');
        expect(userName.textContent).toBe('<img src=x> & user artist');
        expect(root.children[1]).toBe(input);
        playing = false;
        await locale.setLocalePreference('zh-TW');
        expect(state.getAttribute('title')).toBe('播放');
    });
});
