import {afterEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({manager: null as any}));
vi.mock('../features/playback/service/PlaybackService', () => ({playbackService: {getAudioEngine: () => state.manager}}));
import {VisualizationService} from '../features/playback/service/VisualizationService';

afterEach(() => {vi.useRealTimers(); state.manager = null;});

it('多个订阅共享采样，最后退订停止采样并关闭后端', async () => {
    vi.useFakeTimers();
    const frame = {session: 1, timestamp: 1, state: 'playing', signal: {samples: [0, 0.5], sampleRate: 48000, channels: 1, sequence: 1}};
    const manager = {setVisualizationEnabled: vi.fn(async () => {}), readVisualization: vi.fn(async () => frame)};
    state.manager = manager;
    const service = new VisualizationService();
    const first = vi.fn(), second = vi.fn();
    const off1 = service.subscribe(first), off2 = service.subscribe(second);
    await vi.advanceTimersByTimeAsync(100);
    expect(first).toHaveBeenCalledWith(frame);
    expect(second).toHaveBeenCalledWith(frame);
    off1(); off2();
    const calls = manager.readVisualization.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(manager.readVisualization).toHaveBeenCalledTimes(calls);
    expect(manager.setVisualizationEnabled).toHaveBeenLastCalledWith(false);
});

it('退订后丢弃尚未返回的异步帧', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    state.manager = {setVisualizationEnabled: vi.fn(async () => {}), readVisualization: vi.fn(() => new Promise(done => {resolve = done;}))};
    const listener = vi.fn();
    const off = new VisualizationService().subscribe(listener);
    await vi.advanceTimersByTimeAsync(0);
    off(); resolve({session: 1});
    await vi.advanceTimersByTimeAsync(100);
    expect(listener).not.toHaveBeenCalled();
});
