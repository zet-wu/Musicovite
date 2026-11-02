import type {PlaybackQueueSnapshot, PlaybackStateSnapshot} from '@api/types/playback';

export interface SavedPlaybackState {
    version: 1;
    queue: PlaybackQueueSnapshot;
    position: number;
    timestamp?: number;
}

export function savePlaybackSnapshot(state: PlaybackStateSnapshot, position = state.position): SavedPlaybackState {
    if (!state.queue) throw new Error('播放状态缺少队列快照');
    return {version: 1, queue: state.queue, position, timestamp: Date.now()};
}

export function readPlaybackSnapshot(value: unknown): SavedPlaybackState {
    const state = value as SavedPlaybackState;
    if (state?.version !== 1 || !state.queue || !Array.isArray(state.queue.entries)
        || !['sequence', 'shuffle', 'repeat-one'].includes(state.queue.playMode)
        || !Number.isFinite(state.position) || state.position < 0) {
        throw new Error('保存的播放状态格式无效');
    }
    const ids = new Set<string>();
    for (const entry of state.queue.entries) {
        if (!entry || typeof entry.queueId !== 'string' || !entry.queueId || ids.has(entry.queueId)
            || typeof entry.track?.filePath !== 'string' || !entry.track.filePath) {
            throw new Error('保存的队列成员无效');
        }
        ids.add(entry.queueId);
    }
    const result = {...state, timestamp: Number.isFinite(state.timestamp) ? state.timestamp : undefined};
    if (state.queue.currentQueueId !== null && !ids.has(state.queue.currentQueueId)) {
        return {...result, queue: {...state.queue, currentQueueId: null}, position: 0};
    }
    return result;
}
