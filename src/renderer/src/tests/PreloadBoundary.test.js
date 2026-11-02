import {afterEach, describe, expect, it, vi} from 'vitest';

const {exposeInMainWorld, invoke, on, removeListener} = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
}));

vi.mock('electron', () => ({
    contextBridge: {exposeInMainWorld},
    ipcRenderer: {invoke, on, removeListener}
}));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
});

describe('preload 领域边界', () => {
    it.each([
        ['onConnected', 'network-drive:connected'],
        ['onDisconnected', 'network-drive:disconnected'],
        ['onError', 'network-drive:error']
    ])('网络磁盘 %s 可通过真实 gateway 订阅、转发并单独释放', async (method, channel) => {
        await import('../../../main/preload');
        const [, api] = exposeInMainWorld.mock.calls.find(([name]) => name === 'electronAPI');
        vi.stubGlobal('window', {electronAPI: api});
        const {networkDriveGateway} = await import('../infrastructure/electron/NetworkDriveGateway');
        const listener = vi.fn();
        const dispose = networkDriveGateway[method](listener);
        const [registeredChannel, callback] = on.mock.calls.at(-1);
        expect(registeredChannel).toBe(channel);
        const payload = method === 'onError' ? 'offline' : {name: 'Test drive'};
        callback({}, 'drive-1', payload);
        expect(listener).toHaveBeenCalledWith('drive-1', payload);
        dispose();
        expect(removeListener).toHaveBeenCalledWith(channel, callback);
    });

    it('旧环境变量不能恢复通用 Node 能力，领域请求仍可调用', async () => {
        vi.stubEnv('MUSICBOX_ENABLE_LEGACY_NODE_APIS', '1');
        vi.stubEnv('MUSICBOX_LEGACY_FS_ROOTS', '/');
        await import('../../../main/preload');
        const [, api] = exposeInMainWorld.mock.calls.find(([name]) => name === 'electronAPI');
        for (const key of ['fs', 'os', 'path']) {
            expect(api).not.toHaveProperty(key);
        }

        invoke.mockResolvedValueOnce(['music/song.flac']);
        await expect(api.openFiles()).resolves.toEqual(['music/song.flac']);
        expect(invoke).toHaveBeenLastCalledWith('dialog:openFiles');

        const failure = new Error('dialog unavailable');
        invoke.mockRejectedValueOnce(failure);
        await expect(api.openFiles()).rejects.toBe(failure);

        invoke.mockResolvedValue({success: true});
        const metadata = {filePath: 'music/song.flac', title: 'Title'};
        await api.library.updateTrackMetadata(metadata);
        expect(invoke).toHaveBeenLastCalledWith('library:updateTrackMetadata', metadata);
        await api.library.addTracksToPlaylist('playlist', ['track']);
        expect(invoke).toHaveBeenLastCalledWith('library:addTracksToPlaylist', 'playlist', ['track']);
        await api.library.removeTracksFromPlaylist('playlist', ['track']);
        expect(invoke).toHaveBeenLastCalledWith('library:removeTracksFromPlaylist', 'playlist', ['track']);
    });
});
