import {playbackService} from './PlaybackService';

export interface SignalSnapshot {
    samples: Float32Array<ArrayBuffer> | number[];
    sampleRate: number;
    channels: number;
    sequence: number;
}

export interface VisualizationFrame {
    session: number;
    timestamp: number;
    state: 'playing' | 'paused' | 'stopped' | 'muted' | 'unavailable';
    signal: SignalSnapshot | null;
}

type Listener = (frame: VisualizationFrame) => void;

export class VisualizationService {
    private listeners = new Set<Listener>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private generation = 0;
    private manager: ReturnType<typeof playbackService.getAudioEngine> = null;

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        if (this.listeners.size === 1) void this.sample(++this.generation);
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.generation++;
                if (this.timer !== null) clearTimeout(this.timer);
                this.timer = null;
                void this.manager?.setVisualizationEnabled(false).catch(error => console.error('❌ 停止可视化采样失败:', error));
                this.manager = null;
            }
        };
    }

    private async sample(generation: number): Promise<void> {
        try {
            const manager = playbackService.getAudioEngine();
            if (manager !== this.manager) {
                await this.manager?.setVisualizationEnabled(false);
                if (generation !== this.generation) return;
                this.manager = manager;
                await manager?.setVisualizationEnabled(true);
            }
            const frame = manager ? await manager.readVisualization() : null;
            if (generation !== this.generation) return;
            for (const listener of this.listeners) listener(frame ?? {session: 0, timestamp: performance.now(), state: 'unavailable', signal: null});
        } catch (error) {
            if (generation !== this.generation) return;
            console.error('❌ 可视化采样失败:', error);
            for (const listener of this.listeners) listener({session: 0, timestamp: performance.now(), state: 'unavailable', signal: null});
        } finally {
            if (generation === this.generation && this.listeners.size) {
                this.timer = setTimeout(() => void this.sample(generation), 40);
            }
        }
    }
}

export const visualizationService = new VisualizationService();
