import {expect, it} from 'vitest';
import {readPlaybackSnapshot, savePlaybackSnapshot} from '../features/playback/service/SavedPlaybackState';
import type {PlaybackStateSnapshot} from '../api/types/playback';

it('持久化只保存队列和位置并恢复当前项', () => {
    const queue = {entries: [{queueId: 'one', track: {filePath: 'music.flac'}}], currentQueueId: 'one', playMode: 'sequence'};
    const state = savePlaybackSnapshot({queue, position: 12, playlist: [], currentTrack: null} as unknown as PlaybackStateSnapshot);
    expect(Object.keys(state).sort()).toEqual(['position', 'queue', 'timestamp', 'version']);
    expect(readPlaybackSnapshot(JSON.parse(JSON.stringify(state))).queue.currentQueueId).toBe('one');
});

it.each([
    {playlist: []},
    {version: 9},
    {version: 1, queue: {entries: [], currentQueueId: 'missing', playMode: 'sequence'}, position: 0, timestamp: 1}
])('拒绝旧格式、未知版本和无效当前项：%s', value => {
    expect(() => readPlaybackSnapshot(value)).toThrow();
});
