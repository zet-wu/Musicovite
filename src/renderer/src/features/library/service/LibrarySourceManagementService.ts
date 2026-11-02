import {t} from '@/shared/i18n';

import type {LibraryDirectoryOverview} from '@api/types/electron';
import type {Track} from '@api/types/track';
import type {Unsubscribe} from '@api/types/common';
import {appConfirmationService} from '@/features/appShell/service/AppConfirmationService';
import {appNotificationService} from '@/features/appShell/service/AppNotificationService';
import {mediaFileDialogService} from '@/features/media/service/MediaFileDialogService';
import {systemGateway} from '@/infrastructure/electron/SystemGateway';
import {libraryDataService} from './LibraryDataService';

export class LibrarySourceManagementService {
    getDirectories(): Promise<LibraryDirectoryOverview[]> {
        return libraryDataService.getLibraryDirectoryOverviews();
    }

    getTracks(sourceId: string): Promise<Track[]> {
        return libraryDataService.getTracksByLibrarySource(sourceId);
    }

    onSourcesUpdated(handler: () => void): Unsubscribe {
        return libraryDataService.onSourcesUpdated(handler);
    }

    async addDirectories(): Promise<boolean> {
        const paths = await mediaFileDialogService.openDirectories();
        if (paths.length === 0) return false;

        appNotificationService.showInfo(t('dynamic:addingFolders', {count: paths.length}));
        let successCount = 0;
        const failedPaths: string[] = [];
        for (const directoryPath of paths) {
            if (await libraryDataService.scanDirectory(directoryPath)) {
                successCount++;
            } else {
                failedPaths.push(directoryPath);
            }
        }

        if (failedPaths.length === 0) {
            appNotificationService.showSuccess(t('dynamic:foldersAddedScanned', {count: successCount}));
        } else if (successCount > 0) {
            appNotificationService.showError(t('dynamic:foldersAddedWithFailures', {added: successCount, failed: failedPaths.length}));
        } else {
            appNotificationService.showError(t('messages:couldNotAddFolderCheckWhetherItIsAccessible'));
        }
        return successCount > 0;
    }

    async rescan(source: LibraryDirectoryOverview): Promise<boolean> {
        appNotificationService.showInfo(t('dynamic:scanningFolder', {name: this.getDisplayName(source.path)}));
        const result = await libraryDataService.rescanLibrarySource(source.id);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotRescanFolder'));
            return false;
        }
        appNotificationService.showSuccess(t('messages:folderScanComplete'));
        return true;
    }

    async remove(source: LibraryDirectoryOverview): Promise<boolean> {
        const confirmed = await appConfirmationService.confirm({
            title: t('messages:removeMusicSource'),
            message: t('dynamic:removeSourceConfirm', {path: source.path, count: source.bindings.length}),
            confirmText: t('messages:remove'),
            cancelText: t('app:cancel'),
            type: 'warning'
        });
        if (!confirmed) return false;

        const result = await libraryDataService.removeLibrarySource(source.id);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotRemoveMusicSource'));
            return false;
        }
        appNotificationService.showSuccess(t('dynamic:sourceRemoved', {count: result.removedTrackCount || 0}));
        return true;
    }

    async open(source: LibraryDirectoryOverview): Promise<boolean> {
        const result = await systemGateway.openPath(source.path);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotOpenFolder'));
            return false;
        }
        return true;
    }

    async bindToPlaylist(sourceId: string, playlistId: string): Promise<boolean> {
        const result = await libraryDataService.bindLibrarySourceToPlaylist(playlistId, sourceId);
        if (!result.success) {
            appNotificationService.showError(result.error || t('messages:couldNotBindPlaylist'));
            return false;
        }
        appNotificationService.showSuccess(t('messages:folderBoundToPlaylist'));
        return true;
    }

    private getDisplayName(sourcePath: string): string {
        return sourcePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || sourcePath;
    }
}

export const librarySourceManagementService = new LibrarySourceManagementService();
