import {t} from '@/shared/i18n';

import {appConfirmationService, appNotificationService} from "@/features/appShell/service";
import {libraryDataService} from "@/features/library/service/LibraryDataService";
import type {Track} from "@api/types/library";

export type PlaylistMutationTrack = Track & {
    fileId?: string;
};

interface PlaylistMutationTarget {
    id: string;
    name: string;
}

export interface PlaylistBatchRemovalResult {
    completed: boolean;
    successCount: number;
    failCount: number;
}

class PlaylistTrackMutationService {
    async clearPlaylist(playlist: PlaylistMutationTarget, tracks: PlaylistMutationTrack[]): Promise<boolean> {
        if (!tracks.length) {
            return false;
        }

        const isFavorites = playlist.id === 'system:favorites';
        const confirmed = await appConfirmationService.confirm({
            title: isFavorites ? t('messages:clearFavorites') : t('messages:clearPlaylist'),
            message: isFavorites
                ? t('dynamic:clearFavoritesConfirm', {count: tracks.length})
                : t('dynamic:clearPlaylistConfirm', {name: playlist.name, count: tracks.length}),
            confirmText: t('app:clear'),
            type: 'warning'
        });

        if (!confirmed) {
            return false;
        }

        try {
            const trackIds = tracks.map((track) => track.fileId).filter((fileId): fileId is string => Boolean(fileId));
            const result = await libraryDataService.removeFromPlaylist(playlist.id, trackIds);

            if (result.success) {
                appNotificationService.showInfo(isFavorites ? t('messages:favoritesCleared') : t('dynamic:playlistCleared', {name: playlist.name}));
                return true;
            }

            appNotificationService.showError(result.error || t('messages:couldNotClearPlaylist'));
        } catch (error) {
            console.error('❌ PlaylistTrackMutationService: 清空歌单失败', error);
            appNotificationService.showError(t('messages:couldNotClearPlaylistPleaseTryAgain'));
        }

        return false;
    }

    async removeSelectedTracks(
        playlistId: string,
        tracks: PlaylistMutationTrack[]
    ): Promise<PlaylistBatchRemovalResult> {
        if (!tracks.length) {
            return {completed: false, successCount: 0, failCount: 0};
        }

        const confirmed = await appConfirmationService.confirm({
            title: t('messages:removeTrack'),
            message: t('dynamic:removePlaylistTracksConfirm', {count: tracks.length}),
            confirmText: t('messages:remove'),
            type: 'warning'
        });

        if (!confirmed) {
            return {completed: false, successCount: 0, failCount: 0};
        }

        let successCount = 0;
        let failCount = 0;

        for (const track of tracks) {
            try {
                const result = await libraryDataService.removeFromPlaylist(
                    playlistId,
                    track.fileId ? [track.fileId] : []
                );

                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                    console.warn('❌ 移除歌曲失败:', track.title, result.error);
                }
            } catch (error) {
                failCount++;
                console.error('❌ 移除歌曲异常:', track.title, error);
            }
        }

        if (failCount === 0) {
            appNotificationService.showInfo(t('dynamic:tracksRemoved', {count: successCount}));
        } else {
            appNotificationService.showInfo(t('dynamic:tracksRemovedWithFailures', {removed: successCount, failed: failCount}));
        }

        return {completed: true, successCount, failCount};
    }

    async removeTrack(playlistId: string, track: PlaylistMutationTrack): Promise<boolean> {
        const confirmed = await appConfirmationService.confirm({
            title: t('messages:removeTrack'),
            message: t('dynamic:removePlaylistTrackConfirm', {title: track.title}),
            confirmText: t('messages:remove'),
            type: 'warning'
        });

        if (!confirmed) {
            return false;
        }

        try {
            const result = await libraryDataService.removeFromPlaylist(
                playlistId,
                track.fileId ? [track.fileId] : []
            );

            if (result.success) {
                appNotificationService.showInfo(t('dynamic:playlistTrackRemoved', {title: track.title}));
                return true;
            }

            appNotificationService.showError(result.error || t('messages:couldNotRemove'));
        } catch (error) {
            console.error('❌ PlaylistTrackMutationService: 移除歌曲失败', error);
            appNotificationService.showError(t('messages:couldNotRemovePleaseTryAgain'));
        }

        return false;
    }
}

export const playlistTrackMutationService = new PlaylistTrackMutationService();
