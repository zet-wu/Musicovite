import {t} from '@/shared/i18n';

import {libraryGateway} from '@/infrastructure/electron';
import type {Result, Unsubscribe} from '@api/types/common';
import type {
    EmbeddedTrackCover,
    LibraryDirectoryOverview,
    LibraryImportResult,
    LibraryIndexRebuildResult,
    LibrarySource,
    PlaylistSourceBinding
} from '@api/types/electron';
import type {CacheStatistics, GetTracksOptions, Playlist, Track} from '@api/types/library';

export type PlaylistMutationResult = {
    success: boolean;
    playlist?: Playlist;
    error?: string;
};

export type LibraryTrackMutationResult = {
    success: boolean;
    track?: Track;
    error?: string;
    isNew?: boolean;
};

export type PlaylistDetailResult = {
    success: boolean;
    playlist?: Playlist;
    tracks?: Track[];
    error?: string;
};

export type PlaylistCoverDataResult = {
    success: boolean;
    coverPath?: string;
    errorCode?: string;
    error?: string;
};

class LibraryInputError extends Error {
    constructor(paramName: string, expectedType: string, actualValue: unknown) {
        super(t('audit:parameterInvalid', {name: paramName, expected: expectedType, actual: typeof actualValue}));
        this.name = 'LibraryInputError';
    }
}

export class LibraryDataService {
    async getTracks(options: GetTracksOptions = {}): Promise<Track[]> {
        return libraryGateway.getTracks(options);
    }

    async getTracksByLibrarySource(sourceId: string): Promise<Track[]> {
        this.assertNonEmptyString(sourceId, 'sourceId');
        return await libraryGateway.getTracksByLibrarySource(sourceId);
    }

    async loadCachedTracks(): Promise<Track[]> {
        return libraryGateway.loadCachedTracks();
    }

    async searchLibrary(query: string): Promise<Track[]> {
        this.assertString(query, 'query');

        return await libraryGateway.search(query);
    }

    async getTrackMetadata(filePath: string): Promise<Track | null> {
        this.assertFilePath(filePath, 'filePath');

        return await libraryGateway.getTrackMetadata(filePath);
    }

    async getTrackCover(filePath: string): Promise<EmbeddedTrackCover | null> {
        this.assertFilePath(filePath, 'filePath');

        return await libraryGateway.getTrackCover(filePath);
    }

    async getTrackPlaybackMetadata(filePath: string): Promise<Track | null> {
        this.assertFilePath(filePath, 'filePath');

        return await libraryGateway.getTrackPlaybackMetadata(filePath);
    }

    async updateTrackMetadata(data: unknown): Promise<{success: boolean; code?: string; details?: string; updatedMetadata?: Track}> {
        return await libraryGateway.updateTrackMetadata(data);
    }

    async getCacheStatistics(): Promise<CacheStatistics | null> {
        return libraryGateway.getCacheStatistics();
    }

    async hasCachedLibrary(): Promise<boolean> {
        const stats = await this.getCacheStatistics();
        return stats !== null && stats.totalTracks > 0;
    }

    async rebuildLibraryIndex(): Promise<LibraryIndexRebuildResult> {
        return await libraryGateway.rebuildLibraryIndex();
    }

    async clearIgnoreList(): Promise<Result> {
        return await libraryGateway.clearIgnoreList();
    }

    async getPlaylists(): Promise<Playlist[]> {
        return await libraryGateway.getPlaylists();
    }

    async createPlaylist(name: string, description = ''): Promise<PlaylistMutationResult> {
        this.assertNonEmptyString(name, 'name');

        return await libraryGateway.createPlaylist(name, description);
    }

    async deletePlaylist(playlistId: string): Promise<Result> {
        this.assertNonEmptyString(playlistId, 'playlistId');

        return await libraryGateway.deletePlaylist(playlistId);
    }

    async renamePlaylist(playlistId: string, newName: string, description = ''): Promise<PlaylistMutationResult> {
        this.assertNonEmptyString(playlistId, 'playlistId');
        this.assertNonEmptyString(newName, 'newName');

        return await libraryGateway.renamePlaylist(playlistId, newName, description);
    }

    async addToPlaylist(playlistId: string, trackIds: string | string[]): Promise<Result> {
        this.assertNonEmptyString(playlistId, 'playlistId');

        return await libraryGateway.addTracksToPlaylist(playlistId, Array.isArray(trackIds) ? trackIds : [trackIds]);
    }

    async removeFromPlaylist(playlistId: string, trackIds: string | string[]): Promise<Result> {
        this.assertNonEmptyString(playlistId, 'playlistId');

        return await libraryGateway.removeTracksFromPlaylist(playlistId, Array.isArray(trackIds) ? trackIds : [trackIds]);
    }

    async removeTrack(trackFileId: string): Promise<Result> {
        this.assertNonEmptyString(trackFileId, 'trackFileId');

        return await libraryGateway.removeTrack(trackFileId);
    }

    async scanDirectory(path: string): Promise<boolean> {
        this.assertNonEmptyString(path, 'path');

        return await libraryGateway.scanDirectory(path);
    }

    async importLibraryFiles(paths: string[], targetPlaylistId?: string): Promise<LibraryImportResult> {
        if (!Array.isArray(paths) || paths.some(filePath => typeof filePath !== 'string')) {
            throw new LibraryInputError('paths', 'string[]', paths);
        }
        if (targetPlaylistId !== undefined) {
            this.assertNonEmptyString(targetPlaylistId, 'targetPlaylistId');
        }

        return await libraryGateway.importLibraryFiles(paths, targetPlaylistId);
    }

    async getPlaylistBindings(playlistId: string): Promise<PlaylistSourceBinding[]> {
        this.assertNonEmptyString(playlistId, 'playlistId');
        return await libraryGateway.getPlaylistBindings(playlistId);
    }

    async getLibraryDirectoryOverviews(): Promise<LibraryDirectoryOverview[]> {
        return libraryGateway.getLibraryDirectoryOverviews();
    }

    async registerLibraryDirectory(
        directoryPath: string
    ): Promise<Result & {source?: LibrarySource}> {
        this.assertNonEmptyString(directoryPath, 'directoryPath');
        return await libraryGateway.registerLibraryDirectory(directoryPath);
    }

    async removeLibraryDirectory(
        directoryPath: string
    ): Promise<Result & {removedTrackCount?: number}> {
        this.assertNonEmptyString(directoryPath, 'directoryPath');
        return await libraryGateway.removeLibraryDirectory(directoryPath);
    }

    async removeLibrarySource(
        sourceId: string
    ): Promise<Result & {removedTrackCount?: number}> {
        this.assertNonEmptyString(sourceId, 'sourceId');
        return await libraryGateway.removeLibrarySource(sourceId);
    }

    async rescanLibrarySource(sourceId: string): Promise<Result> {
        this.assertNonEmptyString(sourceId, 'sourceId');
        return await libraryGateway.rescanLibrarySource(sourceId);
    }

    async bindDirectoryToPlaylist(
        playlistId: string,
        directoryPath: string
    ): Promise<Result & {binding?: PlaylistSourceBinding}> {
        this.assertNonEmptyString(playlistId, 'playlistId');
        this.assertNonEmptyString(directoryPath, 'directoryPath');
        return await libraryGateway.bindDirectoryToPlaylist(playlistId, directoryPath);
    }

    async bindLibrarySourceToPlaylist(
        playlistId: string,
        sourceId: string
    ): Promise<Result & {binding?: PlaylistSourceBinding}> {
        this.assertNonEmptyString(playlistId, 'playlistId');
        this.assertNonEmptyString(sourceId, 'sourceId');
        return await libraryGateway.bindLibrarySourceToPlaylist(playlistId, sourceId);
    }

    onSourcesUpdated(handler: () => void): Unsubscribe {
        return libraryGateway.onSourcesUpdated(handler);
    }

    async unbindDirectoryFromPlaylist(
        bindingId: string,
        mode: 'keep' | 'remove'
    ): Promise<Result> {
        this.assertNonEmptyString(bindingId, 'bindingId');
        return await libraryGateway.unbindDirectoryFromPlaylist(bindingId, mode);
    }

    async rescanPlaylistBinding(bindingId: string): Promise<Result> {
        this.assertNonEmptyString(bindingId, 'bindingId');
        return await libraryGateway.rescanPlaylistBinding(bindingId);
    }

    async restorePlaylistBindingExclusions(
        bindingId: string
    ): Promise<Result & {restoredCount?: number}> {
        this.assertNonEmptyString(bindingId, 'bindingId');
        return await libraryGateway.restorePlaylistBindingExclusions(bindingId);
    }

    async scanNetworkDrive(driveId: string | number, relativePath = '/'): Promise<boolean> {
        return await libraryGateway.scanNetworkDrive(driveId, relativePath);
    }

    async scanSingleFile(networkPath: string): Promise<LibraryTrackMutationResult> {
        this.assertNonEmptyString(networkPath, 'networkPath');

        return await libraryGateway.scanSingleFile(networkPath);
    }

    async addTrackToLibrary(audioFile: Partial<Track> | unknown): Promise<LibraryTrackMutationResult> {
        return await libraryGateway.addTrackToLibrary(audioFile);
    }

    async getTracksByDrive(driveId: string): Promise<Track[]> {
        this.assertNonEmptyString(driveId, 'driveId');

        return await libraryGateway.getTracksByDrive(driveId);
    }

    async removeTracksByDrive(driveId: string): Promise<Result> {
        this.assertNonEmptyString(driveId, 'driveId');

        return await libraryGateway.removeTracksByDrive(driveId);
    }

    async getPlaylistDetail(playlistId: string): Promise<PlaylistDetailResult> {
        this.assertNonEmptyString(playlistId, 'playlistId');

        return await libraryGateway.getPlaylistDetail(playlistId);
    }

    async updatePlaylistCover(playlistId: string, imagePath: string): Promise<PlaylistCoverDataResult> {
        this.assertNonEmptyString(playlistId, 'playlistId');
        this.assertFilePath(imagePath, 'imagePath');

        return await libraryGateway.updatePlaylistCover(playlistId, imagePath);
    }

    async setPlaylistCoverFromTrack(playlistId: string, trackId: string): Promise<PlaylistCoverDataResult> {
        this.assertNonEmptyString(playlistId, 'playlistId');
        this.assertNonEmptyString(trackId, 'trackId');

        return await libraryGateway.setPlaylistCoverFromTrack(playlistId, trackId);
    }

    async getPlaylistCover(playlistId: string): Promise<PlaylistCoverDataResult> {
        this.assertNonEmptyString(playlistId, 'playlistId');

        return await libraryGateway.getPlaylistCover(playlistId);
    }

    async removePlaylistCover(playlistId: string): Promise<Result> {
        this.assertNonEmptyString(playlistId, 'playlistId');

        return await libraryGateway.removePlaylistCover(playlistId);
    }

    async getTracksByAlbum(albumId: string): Promise<Track[]> {
        this.assertNonEmptyString(albumId, 'albumId');
        return await this.getTracks({albumId});
    }

    async getTracksByArtist(artistId: string): Promise<Track[]> {
        this.assertNonEmptyString(artistId, 'artistId');
        return await this.getTracks({artistId});
    }

    async getFavoriteTracks(): Promise<Track[]> {
        return await this.getTracks({favorite: true});
    }

    async getTracksByGenre(genre: string): Promise<Track[]> {
        this.assertNonEmptyString(genre, 'genre');
        return await this.getTracks({genre});
    }

    async getTracksByYear(year: number): Promise<Track[]> {
        this.assertNumber(year, 'year');
        return await this.getTracks({year});
    }

    async getRecentlyAddedTracks(limit: number = 50): Promise<Track[]> {
        this.assertNumber(limit, 'limit');

        const tracks = await this.getTracks();
        return tracks
            .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
            .slice(0, limit);
    }

    async getRecentlyPlayedTracks(limit: number = 50): Promise<Track[]> {
        this.assertNumber(limit, 'limit');

        const tracks = await this.getTracks();
        return tracks
            .filter(track => track.lastPlayedAt)
            .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
            .slice(0, limit);
    }

    async getMostPlayedTracks(limit: number = 50): Promise<Track[]> {
        this.assertNumber(limit, 'limit');

        const tracks = await this.getTracks();
        return tracks
            .filter(track => track.playCount && track.playCount > 0)
            .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
            .slice(0, limit);
    }

    private assertString(value: unknown, paramName: string): asserts value is string {
        if (typeof value !== 'string') {
            throw new LibraryInputError(paramName, 'string', value);
        }
    }

    private assertNonEmptyString(value: unknown, paramName: string): asserts value is string {
        this.assertString(value, paramName);
        if (value.trim().length === 0) {
            throw new LibraryInputError(paramName, 'non-empty string', value);
        }
    }

    private assertNumber(value: unknown, paramName: string): asserts value is number {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            throw new LibraryInputError(paramName, 'valid number', value);
        }
    }

    private assertFilePath(value: unknown, paramName: string): asserts value is string {
        this.assertNonEmptyString(value, paramName);
        if (value.includes('\0')) {
            throw new LibraryInputError(paramName, 'valid file path', value);
        }
    }

}

export const libraryDataService = new LibraryDataService();
