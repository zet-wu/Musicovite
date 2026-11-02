import {t} from '@/shared/i18n';

import {mediaFileDialogService} from "@/features/media/service";
import {appConfirmationService, appNotificationService} from "@/features/appShell/service";
import {libraryDataService} from "@/features/library/service/LibraryDataService";

export interface PlaylistCoverActionResult {
    changed: boolean;
    coverImage?: string | null;
}

class PlaylistCoverActionService {
    async selectAndSetCover(playlistId: string): Promise<PlaylistCoverActionResult> {
        try {
            const imagePath = await this.selectCoverImage();
            if (!imagePath) {
                return {changed: false};
            }

            return await this.setCover(playlistId, imagePath);
        } catch (error) {
            console.error('❌ PlaylistCoverActionService: 选择图片失败', error);
            appNotificationService.showError(t('messages:couldNotSelectImagePleaseTryAgain'));
            return {changed: false};
        }
    }

    async selectCoverImage(): Promise<string | null> {
        const result = await mediaFileDialogService.selectImageFile();
        if (result.success && result.path) {
            console.log('✅ 选择的图片路径:', result.path);
            return result.path;
        }
        return null;
    }

    async setCover(playlistId: string, imagePath: string): Promise<PlaylistCoverActionResult> {
        try {
            if (!this.isValidImageFile(imagePath)) {
                throw new Error(t('audit:unsupportedArtwork'));
            }

            console.log(`🖼️ 设置歌单封面: ${playlistId} -> ${imagePath}`);
            const result = await libraryDataService.updatePlaylistCover(playlistId, imagePath);

            if (result.success) {
                appNotificationService.showInfo(t('messages:playlistArtworkUpdated'));
                return {changed: true, coverImage: result.coverPath || null};
            }

            throw new Error(result.error || t('audit:setArtworkFailed'));
        } catch (error) {
            appNotificationService.showError(getErrorMessage(error) || t('messages:couldNotSetArtworkPleaseTryAgain'));
            return {changed: false};
        }
    }

    async removeCover(playlistId: string): Promise<PlaylistCoverActionResult> {
        try {
            const confirmed = await appConfirmationService.confirm({
                title: t('messages:removePlaylistArtwork'),
                message: t('messages:removePlaylistArtworkMessage'),
                confirmText: t('messages:remove'),
                type: 'warning'
            });

            if (!confirmed) {
                return {changed: false};
            }

            console.log(`🗑️ 移除歌单封面: ${playlistId}`);
            const result = await libraryDataService.removePlaylistCover(playlistId);

            if (result.success) {
                appNotificationService.showInfo(t('messages:playlistArtworkRemoved'));
                return {changed: true, coverImage: null};
            }

            throw new Error(result.error || '移除封面失败');
        } catch (error) {
            appNotificationService.showError(getErrorMessage(error) || t('messages:couldNotRemoveArtworkPleaseTryAgain'));
            return {changed: false};
        }
    }

    async setCoverFromTrack(playlistId: string, trackId: string): Promise<PlaylistCoverActionResult> {
        try {
            const result = await libraryDataService.setPlaylistCoverFromTrack(playlistId, trackId);
            if (result.success && result.coverPath) {
                appNotificationService.showInfo(t('messages:embeddedTrackArtworkApplied'));
                return {changed: true, coverImage: result.coverPath};
            }
            throw new Error(result.error || t('audit:trackArtworkFailed'));
        } catch (error) {
            appNotificationService.showError(getErrorMessage(error) || t('messages:couldNotUseTrackArtworkPleaseTryAgain'));
            return {changed: false};
        }
    }

    isValidImageFile(filePath: unknown): filePath is string {
        if (!filePath || typeof filePath !== 'string') {
            return false;
        }

        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return validExtensions.includes(extension);
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export const playlistCoverActionService = new PlaylistCoverActionService();
