import {expect, it, vi} from 'vitest';
vi.mock('../features/equalizer/service/WebAudioEqualizer', () => ({default: class {destroy() {}}}));
import {WebAudioMixerController} from '../features/playback/service/audioEngine/webAudio/WebAudioMixerController';

it('音频链重连保留 gain 后的分析支路，关闭时断开分析器', () => {
    const analyser = {fftSize: 0, disconnect: vi.fn()};
    const gain = {connect: vi.fn(), disconnect: vi.fn(), gain: {value: 0, setValueAtTime: vi.fn()}};
    const context = {destination: {}, createGain: () => gain, createAnalyser: () => analyser};
    const source = {connect: vi.fn(), disconnect: vi.fn()};
    const mixer = new WebAudioMixerController({getVolumeChangedCallback: () => null, getEqualizerChangedCallback: () => null});
    mixer.initialize(context as unknown as AudioContext);
    mixer.setVisualizationEnabled(true);
    mixer.connectSource(source as unknown as AudioNode);
    gain.connect.mockClear();
    expect(mixer.reconnectSource(source as unknown as AudioNode)).toBe(true);
    expect(gain.connect).toHaveBeenCalledWith(context.destination);
    expect(gain.connect).toHaveBeenCalledWith(analyser);
    mixer.setVisualizationEnabled(false);
    expect(gain.disconnect).toHaveBeenCalledWith(analyser);
    expect(mixer.readVisualization()).toBeNull();
    mixer.destroy();
});
