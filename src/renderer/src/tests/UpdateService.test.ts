import {afterEach, describe, expect, it, vi} from 'vitest';
import {updateService} from '../features/appShell/service/UpdateService';
import {systemGateway} from '../infrastructure/electron/SystemGateway';

describe('UpdateService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('从主进程读取运行版本并比较下一发行版', async () => {
        vi.spyOn(systemGateway, 'getVersion').mockResolvedValue('0.4.0');
        vi.spyOn(updateService, 'getLatestRelease').mockResolvedValue({tag_name: 'v0.4.1'});
        await expect(updateService.checkForUpdates()).resolves.toMatchObject({currentVersion: '0.4.0', latestVersion: '0.4.1', hasUpdate: true});
        expect(updateService.isNewerVersion('0.4.0', '0.4.0')).toBe(false);
    });

    it('从当前仓库查询最新发行版', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                tag_name: '0.3.0'
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        await updateService.getLatestRelease();

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/zet-wu/MusicBox/releases/latest'
        );
    });
});
