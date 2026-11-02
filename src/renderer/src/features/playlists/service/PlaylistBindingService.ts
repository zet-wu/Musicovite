import {t} from '@/shared/i18n';

import type {PlaylistSourceBinding} from '@api/types/electron';
import {appConfirmationService} from '@/features/appShell/service/AppConfirmationService';
import {appNotificationService} from '@/features/appShell/service/AppNotificationService';
import {libraryDataService} from '@/features/library/service/LibraryDataService';
import {mediaFileDialogService} from '@/features/media/service/MediaFileDialogService';

export class PlaylistBindingService {
    async getBindings(playlistId: string): Promise<PlaylistSourceBinding[]> {
        return await libraryDataService.getPlaylistBindings(playlistId);
    }

    async addBindings(playlistId: string): Promise<boolean> {
        const directoryPaths = await mediaFileDialogService.openDirectories();
        if (directoryPaths.length === 0) return false;

        appNotificationService.showInfo(t('dynamic:bindingFolders', {count: directoryPaths.length}));
        let successCount = 0;
        const errors: string[] = [];
        for (const directoryPath of directoryPaths) {
            const result = await libraryDataService.bindDirectoryToPlaylist(playlistId, directoryPath);
            if (result.success) {
                successCount++;
            } else {
                errors.push(result.error || directoryPath);
            }
        }

        if (errors.length === 0) {
            appNotificationService.showSuccess(
                t('dynamic:foldersBound', {count: successCount})
            );
        } else if (successCount > 0) {
            appNotificationService.showError(
                t('dynamic:foldersBoundWithFailures', {bound: successCount, failed: errors.length, details: errors.join('；')})
            );
        } else {
            appNotificationService.showError(t('dynamic:folderBindingFailed', {details: errors.join('；')}));
        }
        return successCount > 0;
    }

    async rescan(bindingId: string): Promise<boolean> {
        appNotificationService.showInfo(t('messages:rescanningBoundFolder'));
        const result = await libraryDataService.rescanPlaylistBinding(bindingId);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:rescanFailed'));
            return false;
        }
        appNotificationService.showSuccess(t('messages:boundFolderScanComplete'));
        return true;
    }

    async restoreExclusions(bindingId: string): Promise<boolean> {
        const result = await libraryDataService.restorePlaylistBindingExclusions(bindingId);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotRestoreExcludedTracks'));
            return false;
        }
        appNotificationService.showSuccess(t('dynamic:excludedTracksRestored', {count: result.restoredCount || 0}));
        return true;
    }

    async unbind(binding: Pick<PlaylistSourceBinding, 'id'>, mode: 'keep' | 'remove'): Promise<boolean> {
        const keepTracks = mode === 'keep';
        const confirmed = await appConfirmationService.confirm({
            title: keepTracks ? t('messages:unbindAndKeepTracks') : t('messages:unbindAndRemoveTracks'),
            message: keepTracks
                ? t('messages:tracksAddedByThisFolderWillBecomeManualPlaylistEntries')
                : t('messages:tracksAddedOnlyByThisBindingWillBeRemovedFrom'),
            confirmText: keepTracks ? t('messages:unbindAndKeep') : t('messages:unbindAndRemove'),
            cancelText: t('app:cancel'),
            type: keepTracks ? 'warning' : 'danger'
        });
        if (!confirmed) return false;

        const result = await libraryDataService.unbindDirectoryFromPlaylist(binding.id, mode);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotUnbindFolder'));
            return false;
        }
        appNotificationService.showSuccess(t('messages:folderUnbound'));
        return true;
    }
}

export const playlistBindingService = new PlaylistBindingService();
