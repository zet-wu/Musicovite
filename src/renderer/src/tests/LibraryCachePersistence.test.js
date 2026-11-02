import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '.'
    }
}));

import {
    LibraryCacheManager
} from '../../../main/services/library/LibraryCacheManager';

const temporaryDirectories = [];

async function createCachePath() {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-cache-test-'));
    temporaryDirectories.push(directory);
    return path.join(directory, 'music-library-cache.json');
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
        fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    )));
});

describe('LibraryCacheManager 持久化保护', () => {
    it('统计和说明字段缺失或无效时仍加载当前歌单并重算统计', async () => {
        const cachePath = await createCachePath();
        await fs.promises.writeFile(cachePath, JSON.stringify({
            version: 1, tracks: [{fileId: 'track', filePath: 'music.flac', fileSize: 25}],
            playlists: [{id: 'playlist', name: '歌单', trackIds: ['track'], manualTrackIds: ['track'], extraField: true, coverImagePath: 'unused'}],
            scannedDirectories: [], ignoredFiles: [], statistics: {totalTracks: 'bad'}
        }));
        const manager = new LibraryCacheManager(null, cachePath);
        await manager.loadCache();
        expect(manager.getPlaylistById('playlist')).toMatchObject({trackIds: ['track'], description: '', createdAt: 0, extraField: true});
        expect(manager.getCacheStatistics()).toMatchObject({totalTracks: 1, totalSize: 25, totalPlaylists: 1});
        await manager.saveCache();
        const reloaded = new LibraryCacheManager(null, cachePath);
        await reloaded.loadCache();
        expect(reloaded.getPlaylistById('playlist').trackIds).toEqual(['track']);
    });

    it('缓存加载完成前拒绝保存，避免空状态覆盖已有文件', async () => {
        const cachePath = await createCachePath();
        const original = JSON.stringify({marker: 'keep-existing-data'});
        await fs.promises.writeFile(cachePath, original, 'utf8');
        const manager = new LibraryCacheManager(null, cachePath);

        await expect(manager.saveCache()).rejects.toThrow('尚未加载');
        await expect(fs.promises.readFile(cachePath, 'utf8')).resolves.toBe(original);
    });

    it('安全保存时保留上一版本备份并写入可解析的新缓存', async () => {
        const cachePath = await createCachePath();
        const original = JSON.stringify({
            version: 1,
            lastUpdated: 1,
            tracks: [],
            playlists: [],
            scannedDirectories: [],
            ignoredFiles: [],
            statistics: {totalTracks: 0, totalSize: 0, totalPlaylists: 0, lastScanTime: 0, scanDuration: 0}
        });
        await fs.promises.writeFile(cachePath, original, 'utf8');
        const manager = new LibraryCacheManager(null, cachePath);
        await manager.loadCache();
        manager.createPlaylist('持久化歌单');

        await manager.saveCache();

        const saved = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
        expect(saved.playlists.some((playlist) => playlist.name === '持久化歌单')).toBe(true);
        await expect(fs.promises.readFile(`${cachePath}.bak`, 'utf8')).resolves.toBe(original);
    });

    it.each(['{broken', '{"version":99}', '{"version":1,"tracks":[],"playlists":[{"tracks":[]}]}'])('拒绝损坏或不支持的数据并保留原文件：%s', async raw => {
        const cachePath = await createCachePath();
        await fs.promises.writeFile(cachePath, raw);
        const manager = new LibraryCacheManager(null, cachePath);
        await expect(manager.loadCache()).rejects.toThrow();
        await expect(manager.saveCache()).rejects.toThrow('尚未加载');
        expect(await fs.promises.readFile(cachePath, 'utf8')).toBe(raw);
    });

});
