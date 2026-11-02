import {afterEach, describe, expect, it, vi} from 'vitest';

const gateway = vi.hoisted(() => ({
    getTracks: vi.fn(), loadCachedTracks: vi.fn(), getCacheStatistics: vi.fn(),
    onCacheValidationProgress: vi.fn(), validateCache: vi.fn()
}));
vi.mock('@/infrastructure/electron', () => ({libraryGateway: gateway}));
vi.mock('@/shared/i18n', () => ({t: (key: string) => key}));
import {LibraryDataService} from '@/features/library/service/LibraryDataService';
import {LibraryBridge} from '@/features/library/service/LibraryBridge';

afterEach(() => vi.clearAllMocks());

describe('音乐库读取失败与资源释放', () => {
    it('空库与读取失败分别表达', async () => {
        const service = new LibraryDataService();
        gateway.getTracks.mockResolvedValueOnce([]);
        await expect(service.getTracks()).resolves.toEqual([]);
        const error = new Error('corrupt library');
        gateway.getTracks.mockRejectedValueOnce(error);
        gateway.loadCachedTracks.mockRejectedValueOnce(error);
        gateway.getCacheStatistics.mockRejectedValueOnce(error);
        await expect(service.getTracks()).rejects.toBe(error);
        await expect(new LibraryBridge({emit: vi.fn()}).loadCachedTracks()).rejects.toBe(error);
        await expect(service.hasCachedLibrary()).rejects.toBe(error);
    });

    it.each([true, false])('缓存验证成功=%s 时释放进度订阅', async success => {
        const dispose = vi.fn();
        gateway.onCacheValidationProgress.mockReturnValue(dispose);
        const result = {valid: 1, invalid: 0, modified: 0};
        if (success) gateway.validateCache.mockResolvedValueOnce(result);
        else gateway.validateCache.mockRejectedValueOnce(new Error('read failed'));
        const emit = vi.fn();
        const bridge = new LibraryBridge({emit});
        await expect(bridge.validateCache()).resolves.toEqual(success ? result : null);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith(success ? 'cacheValidationCompleted' : 'cacheValidationError', success ? result : 'read failed');
    });
});
