import {t} from '@/shared/i18n';

import {cacheMaintenanceService} from "./CacheMaintenanceService";

interface CacheStatisticsDisplay {
    success: boolean;
    description?: string;
    toastMessage?: string;
    error?: string;
}

interface CacheActionDisplay {
    success: boolean;
    message: string;
    description?: string;
}

class CacheSettingsService {
    async getStatisticsDisplay(): Promise<CacheStatisticsDisplay> {
        const stats = await cacheMaintenanceService.getStatistics();
        if (!stats) {
            return {
                success: false,
                error: t('messages:couldNotGetCacheStatistics')
            };
        }

        const totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
        const cacheAgeDays = Math.floor((stats.cacheAge || 0) / (1000 * 60 * 60 * 24));

        return {
            success: true,
            description: t('dynamic:cacheSummary', {tracks: stats.totalTracks, size: totalSizeMB, directories: stats.scannedDirectories || 0, days: cacheAgeDays}),
            toastMessage: t('dynamic:cacheStatistics', {files: stats.totalTracks, size: totalSizeMB})
        };
    }

    async validateCache(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.validate();
        if (!result) {
            return {
                success: false,
                message: t('messages:cacheValidationFailed')
            };
        }

        return {
            success: true,
            message: t('dynamic:cacheValidated', {valid: result.valid, invalid: result.invalid, modified: result.modified})
        };
    }

    async rebuildLibraryIndex(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.rebuildLibraryIndex();
        if (result.state === 'no_sources') {
            return {
                success: true,
                message: t('messages:libraryIndexCleared'),
                description: t('messages:noFoldersOrFileSourcesAreConfiguredTheLibraryIs')
            };
        }

        if (result.state === 'partial') {
            return {
                success: true,
                message: t('dynamic:indexPartiallyRebuilt', {count: result.rebuiltTrackCount}),
                description: t('dynamic:sourcesScanned', {scanned: result.scannedSourceCount, total: result.configuredSourceCount, failed: result.failedSources.join('、')})
            };
        }

        return {
            success: result.success,
            message: result.success
                ? t('dynamic:indexRebuilt', {count: result.rebuiltTrackCount})
                : result.error || t('messages:couldNotRebuildLibraryIndex'),
            description: result.success
                ? t('dynamic:indexSourcesPreserved', {folders: result.directorySourceCount, files: result.fileSourceCount})
                : undefined
        };
    }

    async clearCoverCache(): Promise<CacheActionDisplay> {
        const result = await cacheMaintenanceService.clearCoverCache();
        return {
            success: result.success,
            message: result.success
                ? t('dynamic:artworkCacheCleared', {count: result.deletedFileCount})
                : result.error || t('messages:couldNotClearArtworkCache'),
            description: result.success && result.preservedUnknownFileCount > 0
                ? t('dynamic:unknownCacheFilesPreserved', {count: result.preservedUnknownFileCount})
                : result.success ? t('messages:artworkMemoryBlobUrlsAndManagedDiskCachesWereCleared') : undefined
        };
    }
}

export const cacheSettingsService = new CacheSettingsService();
