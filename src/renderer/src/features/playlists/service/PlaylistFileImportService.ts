import {t} from '@/shared/i18n';

import {appNotificationService} from '@/features/appShell/service/AppNotificationService';
import {libraryDataService} from '@/features/library/service/LibraryDataService';
import {mediaFileDialogService} from '@/features/media/service/MediaFileDialogService';

export interface PlaylistFileImportResult {
    changed: boolean;
}

export class PlaylistFileImportService {
    async addFromFiles(playlistId: string): Promise<PlaylistFileImportResult> {
        try {
            const filePaths = await mediaFileDialogService.openFiles();
            if (filePaths.length === 0) return {changed: false};

            appNotificationService.showInfo(t('dynamic:importingMusic', {count: filePaths.length}));
            const result = await libraryDataService.importLibraryFiles(filePaths, playlistId);
            const importedCount = result.tracks.length;
            const failedCount = result.failedPaths.length;

            if (importedCount === 0) {
                appNotificationService.showError(result.error || t('messages:noMusicFilesToImport'));
                return {changed: false};
            }

            const message = failedCount > 0
                ? t('dynamic:tracksImportedWithFailures', {added: importedCount, failed: failedCount})
                : t('dynamic:tracksAddedToPlaylist', {count: importedCount});
            appNotificationService.showSuccess(message);
            return {changed: true};
        } catch (error) {
            console.error('❌ PlaylistFileImportService: 从文件添加音乐失败', error);
            appNotificationService.showError(t('messages:couldNotAddMusicFilesPleaseTryAgain'));
            return {changed: false};
        }
    }
}

export const playlistFileImportService = new PlaylistFileImportService();
