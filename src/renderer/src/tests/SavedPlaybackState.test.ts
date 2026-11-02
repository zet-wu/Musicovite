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
    {version: 9}
])('拒绝旧格式和未知版本：%s', value => {
    expect(() => readPlaybackSnapshot(value)).toThrow();
});

it('缺少保存时间或当前项失效时保留队列并取消本次定位', () => {
    const queue = {entries: [{queueId: 'one', track: {filePath: 'music.flac'}}], currentQueueId: 'missing', playMode: 'sequence'};
    const state = readPlaybackSnapshot({version: 1, queue, position: 12});
    expect(state.queue.entries).toEqual(queue.entries);
    expect(state.queue.currentQueueId).toBeNull();
    expect(state.position).toBe(0);
    expect(queue.currentQueueId).toBe('missing');
});
