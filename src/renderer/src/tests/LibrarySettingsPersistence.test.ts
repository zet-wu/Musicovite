import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {getPath: () => '.'},
    BrowserWindow: {getFocusedWindow: () => null, getAllWindows: () => []}
}));
import {SettingsController} from '../../../main/controllers/SettingsController';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(p => rm(p, {recursive: true, force: true, maxRetries: 3, retryDelay: 50}))); });
async function setup() {
    const dir = await mkdtemp(join(tmpdir(), 'musicovite-settings-'));
    directories.push(dir);
    const file = join(dir, 'settings.json');
    return {file, controller: new SettingsController(file)};
}

describe('音乐库设置持久化', () => {
    it('并发设置和扫描时间更新串行保存并可重启恢复', async () => {
        const {file, controller} = await setup();
        await Promise.all([
            controller.updateAutoScanSettings({autoScanEnabled: true}),
            controller.updateLastScanTime(123),
            controller.set('autoPlaylistCoverFromFirstTrack', true)
        ]);
        expect(await new SettingsController(file).getAutoScanSettings()).toEqual({
            autoScanEnabled: true, scanFrequency: 'on_startup', lastScanTime: 123, autoPlaylistCoverFromFirstTrack: true
        });
        expect(JSON.parse(await readFile(file + '.bak', 'utf8')).lastScanTime).toBe(123);
    });

    it('损坏文件加载或更新失败时保留原数据', async () => {
        const {file, controller} = await setup();
        await writeFile(file, '{broken');
        await expect(controller.getAutoScanSettings()).rejects.toThrow();
        await expect(controller.updateLastScanTime(42)).rejects.toThrow();
        expect(await readFile(file, 'utf8')).toBe('{broken');
    });

    it('拒绝未知设置和非法频率，后续合法更新仍可保存', async () => {
        const {controller} = await setup();
        await expect(controller.set('musicFolders', [])).rejects.toThrow('未知');
        await expect(controller.set('scanFrequency', 'sometimes')).rejects.toThrow('格式');
        await expect(controller.set('scanFrequency', 'daily')).resolves.toBe(true);
    });
});
