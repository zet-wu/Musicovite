import {expect, it} from 'vitest';
import {WaveformSmoother} from '../features/playback/service/WaveformSmoother';

it('平滑真实信号并在暂停后衰减为静止直线', () => {
    const smoother = new WaveformSmoother();
    smoother.setSignal(new Float32Array(512).fill(0.5));
    smoother.advance(16);
    expect(smoother.points[64]).toBeGreaterThan(0);
    expect(smoother.points[64]).toBeLessThan(0.5);
    for (let i = 0; i < 60; i++) smoother.advance(16);
    expect(smoother.points[64]).toBeCloseTo(0.5, 4);
    smoother.setSignal(null);
    for (let i = 0; i < 60; i++) smoother.advance(16);
    expect(smoother.points.every(point => point === 0)).toBe(true);
});

it('抑制高频毛刺，重置时不保留上一首歌曲波形', () => {
    const smoother = new WaveformSmoother();
    smoother.setSignal(Float32Array.from({length: 512}, (_, i) => i % 2 ? 1 : -1));
    for (let i = 0; i < 60; i++) smoother.advance(16);
    expect(Math.max(...smoother.points.map(Math.abs))).toBeLessThan(0.2);
    smoother.reset();
    expect(smoother.points.every(point => point === 0)).toBe(true);
    expect(smoother.advance(16)).toBe(false);
});
