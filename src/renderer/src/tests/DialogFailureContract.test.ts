import {afterEach, expect, it, vi} from 'vitest';
const dialogs = vi.hoisted(() => ({openFiles: vi.fn(), openDirectories: vi.fn()}));
vi.mock('@/infrastructure/electron', () => ({dialogGateway: dialogs}));
import {MediaFileDialogService} from '../features/media/service/MediaFileDialogService';
import {ElectronNamespaceAdapter} from '../infrastructure/electron/ElectronBridge';
afterEach(() => {vi.unstubAllGlobals(); vi.resetAllMocks();});

it('取消返回空选择，对话框失败保留原因', async () => {
    const service = new MediaFileDialogService();
    dialogs.openFiles.mockResolvedValueOnce([]);
    await expect(service.openFiles()).resolves.toEqual([]);
    const failure = new Error('dialog unavailable');
    dialogs.openFiles.mockRejectedValueOnce(failure);
    dialogs.openDirectories.mockRejectedValueOnce(failure);
    await expect(service.openFiles()).rejects.toBe(failure);
    await expect(service.openDirectories()).rejects.toBe(failure);
});

it('浏览器预览无订阅，Electron 缺失接口明确报错', () => {
    vi.stubGlobal('window', {});
    const adapter = new ElectronNamespaceAdapter('library');
    expect(adapter.on('onLibraryUpdated', vi.fn())).toBeTypeOf('function');
    vi.stubGlobal('window', {electronAPI: {library: {}}});
    expect(() => adapter.on('onLibraryUpdated', vi.fn())).toThrow('not available');
    const dispose = vi.fn();
    vi.stubGlobal('window', {electronAPI: {library: {onLibraryUpdated: () => dispose}}});
    adapter.on('onLibraryUpdated', vi.fn())();
    expect(dispose).toHaveBeenCalledOnce();
});
