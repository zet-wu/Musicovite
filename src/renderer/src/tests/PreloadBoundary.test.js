import {afterEach, describe, expect, it, vi} from 'vitest';

const {exposeInMainWorld, invoke} = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    invoke: vi.fn()
}));

vi.mock('electron', () => ({
    contextBridge: {exposeInMainWorld},
    ipcRenderer: {invoke}
}));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.resetModules();
});

describe('preload 领域边界', () => {
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
    });
});
