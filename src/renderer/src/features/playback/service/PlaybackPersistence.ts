import {savePlaybackSnapshot, type SavedPlaybackState} from './SavedPlaybackState';
import {cacheManager} from '@/shared/cache';
import type {PlaybackStateSnapshot} from '@api/types/playback';
import type {MusicBoxSettings} from '@api/types/settings';

interface PlaybackPersistenceOptions {
    getPlaybackState: () => PlaybackStateSnapshot;
}

export class PlaybackPersistence {
    private readonly getPlaybackState: () => PlaybackStateSnapshot;
    private savePositionTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor({getPlaybackState}: PlaybackPersistenceOptions) {
        this.getPlaybackState = getPlaybackState;
    }

    isRememberPositionEnabled(): boolean {
        const settings = (cacheManager.getLocalCache('musicbox-settings') || {}) as MusicBoxSettings;
        return !!settings.rememberPosition;
    }

    createPlaybackState(position?: number): SavedPlaybackState {
        return savePlaybackSnapshot(this.getPlaybackState(), position);
    }

    throttledSavePosition(position: number): void {
        if (!this.isRememberPositionEnabled()) return;

        if (this.savePositionTimeout) {
            clearTimeout(this.savePositionTimeout);
        }

        this.savePositionTimeout = setTimeout(() => {
            try {
                cacheManager.setLocalCache('playback-state', this.createPlaybackState(position));
            } catch (error) {
                console.error('❌ API: 保存播放位置失败:', error);
            }
        }, 2000);
    }

    saveCurrentPlaybackState(): void {
        if (!this.isRememberPositionEnabled()) {
            return;
        }

        try {
            const playbackState = this.createPlaybackState();


            cacheManager.setLocalCache('playback-state', playbackState);
            console.log('✅ API: 播放队列快照已保存');
        } catch (error) {
            console.error('❌ API: 保存播放状态失败:', error);
        }
    }
}
