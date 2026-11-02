import {beforeEach, describe, expect, it, vi} from 'vitest';

import {libraryDataService} from '../features/library/service/LibraryDataService';
import {MusicFolderSettingsService} from '../features/settings/service/MusicFolderSettingsService';

describe('MusicFolderSettingsService 来源一致性', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('添加文件夹只登记来源并从来源读取列表', async () => {
        vi.spyOn(libraryDataService, 'getLibraryDirectoryOverviews').mockResolvedValue([{id: 'source', path: 'C:\\Music', origin: 'settings', createdAt: 0, trackCount: 0, bindings: []}]);
        const register = vi.spyOn(libraryDataService, 'registerLibraryDirectory')
            .mockResolvedValue({success: true});
        const service = new MusicFolderSettingsService();

        const result = await service.addMusicFolder('C:\\Music');

        expect(register).toHaveBeenCalledWith('C:\\Music');
        expect(result).toEqual({success: true, folders: ['C:\\Music'], error: undefined});
    });

    it('移除设置文件夹时通过来源 API 立即清理索引', async () => {
        const remove = vi.spyOn(libraryDataService, 'removeLibraryDirectory')
            .mockResolvedValue({success: true, removedTrackCount: 2});
        vi.spyOn(libraryDataService, 'getLibraryDirectoryOverviews').mockResolvedValue([]);
        const service = new MusicFolderSettingsService();

        const result = await service.removeMusicFolder('C:\\Music');

        expect(remove).toHaveBeenCalledWith('C:\\Music');
        expect(result).toEqual({success: true, folders: [], error: undefined});
    });
});
