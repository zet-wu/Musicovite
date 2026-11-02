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
    LibrarySourceManager,
    partitionPlaylistBindings
} from '../../../main/services/library/LibrarySourceManager';

const temporaryDirectories = [];

async function createManager() {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'musicbox-source-test-'));
    temporaryDirectories.push(directory);
    return new LibrarySourceManager(path.join(directory, 'music-library-sources.json'));
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
        fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    )));
});

describe('歌单绑定有效性', () => {
    it('区分当前歌单绑定和已丢失歌单的孤儿绑定', () => {
        const active = {id: 'active', playlistId: 'playlist-new', sourceId: 'source'};
        const orphan = {id: 'orphan', playlistId: 'playlist-lost', sourceId: 'source'};

        expect(partitionPlaylistBindings([active, orphan], ['playlist-new'])).toEqual({
            activeBindings: [active],
            orphanBindings: [orphan]
        });
    });

    it('批量删除孤儿绑定并保留当前歌单绑定', async () => {
        const manager = await createManager();
        await manager.load();
        const {source} = await manager.ensureSource('directory', 'C:/Music', 'settings');
        const {binding: active} = await manager.createPlaylistBinding('playlist-new', source.id);
        const {binding: orphan} = await manager.createPlaylistBinding('playlist-lost', source.id);

        const removed = await manager.removeOrphanedPlaylistBindings(['playlist-new']);

        expect(removed.map(binding => binding.id)).toEqual([orphan.id]);
        expect(manager.getPlaylistBindings().map(binding => binding.id)).toEqual([active.id]);

        const reloaded = new LibrarySourceManager(manager.sourceFilePath);
        await reloaded.load();
        expect(reloaded.getPlaylistBindings().map(binding => binding.id)).toEqual([active.id]);
    });
});

describe('LibrarySourceManager 当前格式', () => {
    it('首次创建空来源，已登记来源可重启恢复', async () => {
        const manager = await createManager();
        expect(await manager.load()).toMatchObject({state: 'created', sourceCount: 0});
        const originalPath = path.resolve('test-files', 'original.flac');
        await manager.ensureSource('file', originalPath, 'file_import');
        const reloaded = new LibrarySourceManager(manager.sourceFilePath);
        expect(await reloaded.load()).toMatchObject({state: 'loaded', sourceCount: 1});
        expect(reloaded.getSources()[0].path).toBe(originalPath);
    });

    it.each(['{broken', '{"version":99}', '{"version":1,"sources":[{}],"playlistBindings":[]}'])('加载失败保留原文件：%s', async raw => {
        const manager = await createManager();
        await fs.promises.writeFile(manager.sourceFilePath, raw);
        await expect(manager.load()).rejects.toThrow();
        await expect(manager.save()).rejects.toThrow('尚未加载');
        expect(await fs.promises.readFile(manager.sourceFilePath, 'utf8')).toBe(raw);
        await expect(manager.ensureSource('directory', 'music', 'settings')).rejects.toThrow('尚未加载');
    });

    it('幂等登记来源，并以完整扫描结果替换已知文件', async () => {
        const manager = await createManager();
        await manager.load();
        const directory = path.resolve('test-files', 'library');
        const first = await manager.ensureSource('directory', directory, 'scan');
        const second = await manager.ensureSource('directory', directory, 'playlist_binding');
        const firstFile = path.join(directory, 'first.flac');
        const secondFile = path.join(directory, 'second.flac');

        await manager.updateSourceScan(first.source.id, [{
            path: firstFile,
            canonicalPath: manager.canonicalize(firstFile),
            trackId: 'first'
        }], true);
        await manager.updateSourceScan(first.source.id, [{
            path: secondFile,
            canonicalPath: manager.canonicalize(secondFile),
            trackId: 'second'
        }], true);

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(manager.getSources()).toHaveLength(1);
        expect(manager.getSources()[0].knownFiles).toEqual([{
            path: secondFile,
            canonicalPath: manager.canonicalize(secondFile),
            trackId: 'second'
        }]);
    });

    it('同步绑定成员、记录排除项并支持恢复', async () => {
        const manager = await createManager();
        await manager.load();
        const directory = path.resolve('test-files', 'bound');
        const filePath = path.join(directory, 'bound.flac');
        const {source} = await manager.ensureSource('directory', directory, 'playlist_binding');
        const {binding} = await manager.createPlaylistBinding('playlist-1', source.id);
        await manager.updateSourceScan(source.id, [{
            path: filePath,
            canonicalPath: manager.canonicalize(filePath),
            trackId: 'bound-track'
        }], true);

        const [synchronized] = await manager.synchronizeSourceBindings(source.id);
        const excludedCount = await manager.excludePlaylistFiles('playlist-1', [filePath]);
        const excluded = manager.getPlaylistBinding(binding.id);
        const restoredCount = await manager.restorePlaylistBindingExclusions(binding.id);

        expect(synchronized.managedFiles[0].trackId).toBe('bound-track');
        expect(excludedCount).toBe(1);
        expect(excluded.excludedPaths).toEqual([manager.canonicalize(filePath)]);
        expect(restoredCount).toBe(1);
        expect(manager.getPlaylistBinding(binding.id).excludedPaths).toEqual([]);
    });

    it('移除来源时一并移除绑定，并能识别重叠来源', async () => {
        const manager = await createManager();
        await manager.load();
        const parentDirectory = path.resolve('test-files', 'overlap');
        const childDirectory = path.join(parentDirectory, 'child');
        const filePath = path.join(childDirectory, 'track.flac');
        const {source: parentSource} = await manager.ensureSource('directory', parentDirectory, 'scan');
        const {source: childSource} = await manager.ensureSource('directory', childDirectory, 'playlist_binding');
        await manager.createPlaylistBinding('playlist-1', childSource.id);
        await manager.updateSourceScan(childSource.id, [{
            path: filePath,
            canonicalPath: manager.canonicalize(filePath),
            trackId: 'track'
        }], true);

        expect(manager.isFileCoveredByOtherSource(filePath, childSource.id)).toBe(true);
        const removed = await manager.removeSource(childSource.id);

        expect(removed.removedBindings).toHaveLength(1);
        expect(manager.getSource(parentSource.id)).toBeDefined();
        expect(manager.getPlaylistBindings()).toEqual([]);
    });
});
