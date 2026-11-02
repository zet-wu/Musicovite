import {t} from '@/shared/i18n';

import {
    appConfirmationService,
    appNavigationService,
    appNotificationService
} from "@/features/appShell/service";
import type {ScanProgress} from "@api/types/events";
import type {Track} from "@api/types/track";
import type {MountedNetworkDrive} from "@api/types/electron";
import {networkDriveDetailService} from './NetworkDriveDetailService';

type NetworkDriveActionTarget = MountedNetworkDrive & {
    config: MountedNetworkDrive['config'] & {
        url?: string;
    };
};

export interface NetworkDriveRefreshResult {
    refreshed: boolean;
}

export interface NetworkDriveScanResult {
    scanned: boolean;
    tracks?: Track[];
}

export interface NetworkDriveRemoveResult {
    removed: boolean;
}

export interface NetworkDrivePlayFileResult {
    track?: Track;
    addedTrack?: Track;
}

class NetworkDriveActionService {
    async refreshDrive(drive: NetworkDriveActionTarget): Promise<NetworkDriveRefreshResult> {
        try {
            await networkDriveDetailService.refreshConnection(drive.id);
            appNotificationService.showInfo(t('dynamic:driveRefreshed', {name: getDriveDisplayName(drive)}));
            return {refreshed: true};
        } catch (error) {
            console.error('❌ NetworkDriveActionService: 刷新失败', error);
            appNotificationService.showError(t('messages:couldNotRefreshPleaseTryAgain'));
            return {refreshed: false};
        }
    }

    async scanDrive(
        drive: NetworkDriveActionTarget,
        onProgress: (progress: ScanProgress) => void
    ): Promise<NetworkDriveScanResult> {
        const removeListener = networkDriveDetailService.onScanProgress(onProgress);

        try {
            const result = await networkDriveDetailService.scanNetworkDrive(drive.id, '/');
            if (!result) {
                appNotificationService.showError(t('messages:scanFailedCheckYourNetworkConnection'));
                return {scanned: false};
            }

            const tracks = await networkDriveDetailService.getTracksByDrive(drive.id);
            appNotificationService.showInfo(t('dynamic:scanTracksFound', {count: tracks.length}));
            return {scanned: true, tracks};
        } catch (error) {
            console.error('❌ NetworkDriveActionService: 扫描失败', error);
            appNotificationService.showError(t('messages:scanFailedPleaseTryAgain'));
            return {scanned: false};
        } finally {
            removeListener();
        }
    }

    async removeDrive(drive: NetworkDriveActionTarget): Promise<NetworkDriveRemoveResult> {
        const displayName = getDriveDisplayName(drive);
        const confirmed = await appConfirmationService.confirm({
            title: t('messages:removeNetworkDrive'),
            message: t('dynamic:removeDriveConfirm', {name: displayName}),
            confirmText: t('messages:remove'),
            type: 'warning'
        });

        if (!confirmed) {
            return {removed: false};
        }

        try {
            const result = await networkDriveDetailService.removeTracksByDrive(drive.id);
            if (result.success) {
                await networkDriveDetailService.unmount(drive.id);
                appNotificationService.showInfo(t('dynamic:driveRemoved', {name: displayName}));
                await appNavigationService.navigateToLibrary();
                return {removed: true};
            }

            appNotificationService.showError(t('messages:couldNotRemovePleaseTryAgain'));
        } catch (error) {
            console.error('❌ NetworkDriveActionService: 移除失败', error);
            appNotificationService.showError(t('messages:couldNotRemovePleaseTryAgain'));
        }

        return {removed: false};
    }

    async resolveMusicFileForPlayback(
        driveId: string,
        filePath: string,
        tracks: Track[]
    ): Promise<NetworkDrivePlayFileResult> {
        try {
            const networkPath = this.toNetworkPath(driveId, filePath);
            const cachedTrack = tracks.find((track) => track.filePath === networkPath);

            if (cachedTrack) {
                console.log('✅ NetworkDriveActionService: 文件已在缓存中，直接播放');
                return {track: cachedTrack};
            }

            console.log('🎵 NetworkDriveActionService: 文件未在缓存中，开始扫描...');
            appNotificationService.showInfo(t('messages:loadingMusic'));

            const result = await networkDriveDetailService.scanSingleFile(networkPath);
            if (result.success && result.track) {
                console.log(`✅ NetworkDriveActionService: 文件扫描成功 - ${result.track.title}`);
                if (result.isNew) {
                    appNotificationService.showSuccess(t('messages:musicAddedToLibrary'));
                    return {track: result.track, addedTrack: result.track};
                }
                return {track: result.track};
            }

            console.error('❌ NetworkDriveActionService: 文件扫描失败', result.error);
            appNotificationService.showError(result.error || t('messages:couldNotLoadThisMusicFile'));
        } catch (error) {
            console.error('❌ NetworkDriveActionService: 播放音乐文件失败', error);
            appNotificationService.showError(t('messages:playbackFailedPleaseTryAgain'));
        }

        return {};
    }

    createContextMenuTrack(driveId: string, filePath: string, fileName?: string, tracks: Track[] = []): Track {
        const networkPath = this.toNetworkPath(driveId, filePath);
        const cachedTrack = tracks.find((track) => track.filePath === networkPath);

        if (cachedTrack) {
            return cachedTrack;
        }

        return {
            filePath: networkPath,
            title: (fileName || filePath.split('/').pop() || '未知歌曲').replace(/\.[^/.]+$/, ''),
            artist: t('app:unknownArtist'),
            album: t('messages:unknownAlbum'),
            duration: 0,
            isNetworkFile: true,
            needsScan: true
        };
    }

    toNetworkPath(driveId: string, filePath: string): string {
        return `network://${driveId}${filePath}`;
    }
}

function getDriveDisplayName(drive: NetworkDriveActionTarget): string {
    return drive.config?.displayName || drive.displayName || t('messages:unnamedDrive');
}

export const networkDriveActionService = new NetworkDriveActionService();

