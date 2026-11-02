import {webAudioChain} from './WebAudioChain';
import WebAudioEqualizer from '@/features/equalizer/service/WebAudioEqualizer';

type VolumeChangedCallback = ((volume: number) => void) | null;
type EqualizerChangedCallback = ((state: {enabled: boolean}) => void) | null;

type WebAudioMixerOptions = {
    getVolumeChangedCallback: () => VolumeChangedCallback;
    getEqualizerChangedCallback: () => EqualizerChangedCallback;
};

class WebAudioMixerController {
    private readonly options: WebAudioMixerOptions;
    private audioContext: AudioContext | null;
    private gainNode: GainNode | null;
    private volume: number;
    private analyser: AnalyserNode | null = null;
    private visualizationEnabled = false;
    private readonly samples = new Float32Array(512);
    private sequence = 0;
    private equalizer: WebAudioEqualizer | null;
    private equalizerEnabled: boolean;

    constructor(options: WebAudioMixerOptions) {
        this.options = options;
        this.audioContext = null;
        this.gainNode = null;
        this.volume = 0.7;
        this.equalizer = null;
        this.equalizerEnabled = false;
    }

    initialize(audioContext: AudioContext): void {
        this.audioContext = audioContext;
        this.gainNode = audioContext.createGain();
        this.gainNode.connect(audioContext.destination);
        this.gainNode.gain.value = this.volume;
        this.equalizer = new WebAudioEqualizer(audioContext);
        if (this.visualizationEnabled) this.setVisualizationEnabled(true);
    }

    setVolume(volume: number): boolean {
        try {
            this.volume = Math.max(0, Math.min(1, volume));

            if (this.audioContext && this.gainNode) {
                this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
            }

            console.log(`🔊 音量设置为: ${(this.volume * 100).toFixed(0)}%`);

            const onVolumeChanged = this.options.getVolumeChangedCallback();
            if (onVolumeChanged) {
                onVolumeChanged(this.volume);
            }

            return true;
        } catch (error) {
            console.error('❌ 音量设置失败:', error);
            return false;
        }
    }

    getVolume(): number {
        return this.volume;
    }

    getEqualizer(): WebAudioEqualizer | null {
        return this.equalizer;
    }

    setEqualizerEnabled(
        enabled: boolean,
        currentSourceNode: AudioNode | null,
        isPlaying: boolean
    ): void {
        if (this.equalizerEnabled === enabled) {
            return;
        }

        this.equalizerEnabled = enabled;

        if (currentSourceNode && isPlaying) {
            this.reconnectSource(currentSourceNode);
        }

        const onEqualizerChanged = this.options.getEqualizerChangedCallback();
        if (onEqualizerChanged) {
            onEqualizerChanged({enabled});
        }
    }

    connectSource(sourceNode: AudioNode | null): void {
        if (!this.audioContext || !sourceNode || !this.gainNode) {
            console.warn('⚠️ sourceNode不存在，无法连接音频链');
            return;
        }

        webAudioChain.connect({
            audioContext: this.audioContext,
            sourceNode,
            gainNode: this.gainNode,
            analyser: this.visualizationEnabled ? this.analyser : null,
            equalizer: this.equalizer,
            equalizerEnabled: this.equalizerEnabled
        });
    }

    reconnectSource(sourceNode: AudioNode | null): boolean {
        if (!this.audioContext || !sourceNode || !this.gainNode) {
            console.warn('⚠️ sourceNode不存在，无法重新连接音频链');
            return false;
        }

        return webAudioChain.reconnect({
            audioContext: this.audioContext,
            sourceNode,
            gainNode: this.gainNode,
            analyser: this.visualizationEnabled ? this.analyser : null,
            equalizer: this.equalizer,
            equalizerEnabled: this.equalizerEnabled
        });
    }

    setVisualizationEnabled(enabled: boolean): void {
        this.visualizationEnabled = enabled;
        if (!this.gainNode || !this.audioContext) return;
        if (enabled) {
            if (!this.analyser) {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 512;
            }
            this.gainNode.connect(this.analyser);
        } else if (this.analyser) {
            try { this.gainNode.disconnect(this.analyser); } catch { /* 音频链重建时可能已断开。 */ }
            this.analyser.disconnect();
            this.analyser = null;
        }
    }

    readVisualization() {
        if (!this.visualizationEnabled || !this.analyser || !this.audioContext) return null;
        this.analyser.getFloatTimeDomainData(this.samples);
        return {samples: this.samples, sampleRate: this.audioContext.sampleRate, channels: 1, sequence: ++this.sequence};
    }

    destroy(): void {
        this.analyser?.disconnect();
        this.analyser = null;
        try {
            this.gainNode?.disconnect();
        } catch (error) {
            console.warn('⚠️ gainNode断开失败:', error);
        }

        if (this.equalizer) {
            this.equalizer.destroy();
            this.equalizer = null;
        }

        this.gainNode = null;
        this.audioContext = null;
    }
}

export {WebAudioMixerController};
export default WebAudioMixerController;
