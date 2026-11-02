import {t} from '@/shared/i18n';

import {showToast} from "@utils/index.js";
import {cacheMaintenanceService} from "./CacheMaintenanceService";
import {musicFolderSettingsService} from "./MusicFolderSettingsService";
import {appConfirmationService} from "@/features/appShell/service";

interface AutoScanToggleResult {
    checked: boolean;
}

class MusicFolderSettingsController {
    async addMusicFolder(): Promise<string[] | null> {
        try {
            const selectedPath = await musicFolderSettingsService.selectMusicFolder();
            if (!selectedPath) {
                return null;
            }

            const addResult = await musicFolderSettingsService.addMusicFolder(selectedPath);
            if (!addResult.success) {
                showToast(addResult.error || t('messages:couldNotAddFolder'), 'error');
                return null;
            }

            showToast(t('messages:folderAdded'), 'success');
            await this.confirmAndScan(selectedPath);
            return addResult.folders;
        } catch (error) {
            console.error('❌ Settings: 添加音乐文件夹失败:', error);
            showToast(t('messages:couldNotAddFolder'), 'error');
            return null;
        }
    }

    async removeMusicFolder(folderPath: string): Promise<string[] | null> {
        const confirmed = await appConfirmationService.confirm({
            title: t('messages:removeFolder'),
            message: t('dynamic:removeFolderConfirm', {path: folderPath}),
            confirmText: t('messages:remove'),
            type: 'warning'
        });

        if (!confirmed) {
            return null;
        }

        try {
            const result = await musicFolderSettingsService.removeMusicFolder(folderPath);
            if (!result.success) {
                showToast(result.error || t('messages:couldNotRemoveFolder'), 'error');
                return null;
            }

            showToast(t('messages:folderRemoved'), 'success');
            return result.folders;
        } catch (error) {
            console.error('❌ Settings: 移除音乐文件夹失败:', error);
            showToast(t('messages:couldNotRemoveFolder'), 'error');
            return null;
        }
    }

    async toggleAutoScan(enabled: boolean): Promise<AutoScanToggleResult> {
        try {
            const result = await musicFolderSettingsService.updateAutoScanEnabled(enabled);
            if (!result.success) {
                showToast(t('messages:couldNotUpdateAutomaticScanning'), 'error');
                return {checked: !enabled};
            }

            showToast(enabled ? t('messages:automaticScanningEnabled') : t('messages:automaticScanningDisabled'), 'success');
            return {checked: enabled};
        } catch (error) {
            console.error('❌ Settings: 更新自动扫描设置失败:', error);
            showToast(t('messages:couldNotUpdateAutomaticScanning'), 'error');
            return {checked: !enabled};
        }
    }

    async updateScanFrequency(frequency: string): Promise<void> {
        try {
            const result = await musicFolderSettingsService.updateScanFrequency(frequency);
            showToast(result.success ? t('messages:scanFrequencyUpdated') : t('messages:couldNotUpdateScanFrequency'), result.success ? 'success' : 'error');
        } catch (error) {
            console.error('❌ Settings: 更新扫描频率失败:', error);
            showToast(t('messages:couldNotUpdateScanFrequency'), 'error');
        }
    }

    async clearIgnoreList(): Promise<void> {
        const confirmed = await appConfirmationService.confirm({
            title: t('app:clearIgnoredTracks'),
            message: t('settings:clearIgnoredConfirm'),
            confirmText: t('app:clear'),
            type: 'warning'
        });

        if (!confirmed) {
            return;
        }

        try {
            const result = await cacheMaintenanceService.clearIgnoreList();
            showToast(result.success ? t('messages:ignoredTracksCleared') : t('messages:couldNotClearIgnoredTracks'), result.success ? 'success' : 'error');
        } catch (error) {
            console.error('❌ Settings: 清空忽略列表失败:', error);
            showToast(t('messages:couldNotClearIgnoredTracks'), 'error');
        }
    }

    private async confirmAndScan(folderPath: string): Promise<void> {
        const shouldScan = await appConfirmationService.confirm({
            title: t('messages:scanFolder'),
            message: t('messages:scanThisFolderNow'),
            confirmText: t('messages:scan')
        });

        if (!shouldScan) {
            return;
        }

        showToast(t('messages:scanningMessage'), 'info');
        await musicFolderSettingsService.scanDirectory(folderPath);
        showToast(t('messages:scanComplete'), 'success');
    }
}

export const musicFolderSettingsController = new MusicFolderSettingsController();
