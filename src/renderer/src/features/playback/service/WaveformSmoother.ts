export class WaveformSmoother {
    readonly points = new Float32Array(128);
    private readonly target = new Float32Array(128);

    setSignal(samples: ArrayLike<number> | null): void {
        if (!samples?.length) {this.target.fill(0); return;}
        // 局部加权平均保留实际波形，减弱高频毛刺；不生成替代信号。
        for (let i = 0; i < this.target.length; i++) {
            const center = Math.round(i * (samples.length - 1) / (this.target.length - 1));
            let sum = 0, weight = 0;
            for (let offset = -8; offset <= 8; offset++) {
                const index = center + offset;
                if (index < 0 || index >= samples.length) continue;
                const amount = 9 - Math.abs(offset);
                sum += samples[index] * amount;
                weight += amount;
            }
            this.target[i] = Math.max(-1, Math.min(1, sum / weight));
        }
    }

    advance(milliseconds: number): boolean {
        const alpha = 1 - Math.exp(-Math.max(0, milliseconds) / 65);
        let moving = false;
        for (let i = 0; i < this.points.length; i++) {
            this.points[i] += (this.target[i] - this.points[i]) * alpha;
            if (Math.abs(this.target[i] - this.points[i]) < 0.0001) this.points[i] = this.target[i];
            else moving = true;
        }
        return moving;
    }

    reset(): void {
        this.target.fill(0);
        this.points.fill(0);
    }
}
