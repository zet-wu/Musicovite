import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTranslator, isPreference, resolveLocale} from '../shared/i18n/generated/runtime';
import {LocaleService} from '../../../main/services/i18n/LocaleService';
import {escapeTranslation} from '../shared/i18n';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, {recursive: true, force: true}); });
async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), 'musicbox-locale-'));
    directories.push(directory);
    return join(directory, 'locale-settings.json');
}
describe('语言契约', () => {
    it.each([
        [['zh-Hans-TW'], 'zh-CN'], [['zh-Hant-CN'], 'zh-TW'], [['zh-HK'], 'zh-TW'],
        [['zh-MO'], 'zh-TW'], [['en-GB'], 'en'], [['fr', 'en-AU'], 'en'],
        [['fr', 'zh-SG'], 'zh-CN'], [[], 'zh-CN'], [['invalid_!'], 'zh-CN']
    ])('按脚本和偏好顺序解析 %j', (languages, locale) => {
        expect(resolveLocale(languages as string[])).toBe(locale);
    });
    it('显式语言只允许当前白名单', () => {
        expect(isPreference('en-GB')).toBe(false);
        expect(isPreference('system')).toBe(true);
        expect(isPreference({toString: () => 'en'})).toBe(false);
    });
    it('首次跟随系统、持久化并串行广播；重启恢复偏好', async () => {
        const file = await fixture();
        const service = new LocaleService(file, () => ['zh-Hant']);
        await service.initialize();
        expect(service.getState()).toEqual({preference: 'system', resolvedLocale: 'zh-TW', revision: 0});
        const changes = vi.fn();
        const dispose = service.subscribe(changes);
        await Promise.all([service.setPreference('en'), service.setPreference('zh-CN')]);
        expect(changes.mock.calls.map(call => call[0].revision)).toEqual([1, 2]);
        expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({version: 1, preference: 'zh-CN'});
        const restarted = new LocaleService(file, () => ['en']);
        await restarted.initialize();
        expect(restarted.getState().resolvedLocale).toBe('zh-CN');
        dispose();
        await service.setPreference('system');
        expect(changes).toHaveBeenCalledTimes(2);
    });
    it('非法值和写盘失败保留旧状态，并允许重试', async () => {
        const file = await fixture();
        const service = new LocaleService(file, () => ['en']);
        await service.initialize();
        const changes = vi.fn();
        service.subscribe(changes);
        await expect(service.setPreference('../../en')).rejects.toThrow('LOCALE_INVALID_PREFERENCE');
        await mkdir(`${file}.tmp`);
        await expect(service.setPreference('zh-TW')).rejects.toThrow();
        expect(service.getState()).toEqual({preference: 'system', resolvedLocale: 'en', revision: 0});
        expect(changes).not.toHaveBeenCalled();
        await rm(`${file}.tmp`, {recursive: true});
        await service.setPreference('zh-TW');
        expect(service.getState().revision).toBe(1);
    });
    it('损坏配置和系统检测异常回退简中', async () => {
        const file = await fixture();
        await writeFile(file, '{broken');
        const service = new LocaleService(file, () => { throw new Error('unavailable'); });
        await service.initialize();
        expect(service.getState().resolvedLocale).toBe('zh-CN');
    });
    it('复数、缺失值回退和转义不改变原始用户文本', () => {
        const translator = createTranslator('en');
        expect(translator.t('common:tracks', {count: 1})).toBe('1 track');
        expect(translator.t('common:tracks', {count: 0})).toBe('0 tracks');
        expect(translator.t('common:tracks', {count: 2})).toBe('2 tracks');
        translator.addResource('zh-CN', 'common', 'fallbackTest', '简中');
        translator.addResource('en', 'common', 'fallbackTest', '');
        expect(translator.t('common:fallbackTest')).toBe('简中');
        const raw = '<img src=x onerror="alert(1)"> & \'name\'';
        expect(escapeTranslation(raw)).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;name&#39;');
        expect(translator.t('dynamic:playlistCreated', {name: raw})).toContain(raw);
    });
});
