import {Component} from '@ui/base/Component';
import {t, th, onLocaleChanged} from '@/shared/i18n';
import {homeLibraryActionService} from '@/features/library/service/HomeLibraryActionService';
import {visualizationService, type VisualizationFrame} from '@/features/playback/service/VisualizationService';
import {WaveformSmoother} from '@/features/playback/service/WaveformSmoother';

export class HomePage extends Component {
    private visible = false;
    private disposeSignal: (() => void) | null = null;
    private readonly disposeLocale: () => void;
    private resize: ResizeObserver | null = null;
    private readonly smoother = new WaveformSmoother();
    private animation: number | null = null;
    private lastPaint = 0;
    private session = -1;
    private playing = false;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    constructor(container: string | Element | null) {
        super(container);
        if (this.element) this.addEventListenerManaged(this.element, 'click', event => void this.handleClick(event));
        this.addEventListenerManaged(document, 'visibilitychange', () => this.updateSubscription());
        this.addEventListenerManaged(this.reducedMotion, 'change', () => this.updateSubscription());
        this.disposeLocale = onLocaleChanged(() => {if (this.visible) this.render();});
    }

    show(): void {
        this.visible = true;
        if (this.element instanceof HTMLElement) this.element.style.display = 'block';
        this.render();
    }

    hide(): void {
        this.visible = false;
        this.updateSubscription();
        this.resize?.disconnect();
        if (this.element instanceof HTMLElement) this.element.style.display = 'none';
    }

    destroy(): void {
        this.hide();
        this.disposeLocale();
        super.destroy();
    }

    private render(): void {
        if (!this.element) return;
        this.element.innerHTML = `
            <div class="page-content clean-home" data-home-page>
                <div class="welcome-section">
                    <div class="welcome-content">
                        <h1 class="welcome-title" data-i18n="messages:welcomeToMusicbox">${th('messages:welcomeToMusicbox')}</h1>
                        <p class="welcome-subtitle" data-i18n="messages:musicForEveryMoment">${th('messages:musicForEveryMoment')}</p>
                    </div>
                </div>
                <div class="music-visualization-center">
                    <div class="visualization-container">
                        <canvas id="audio-visualizer" class="audio-visualizer active" role="img" aria-label="${th('messages:audioVisualization')}"></canvas>
                    </div>
                </div>
                <div class="quick-start-section">
                    <div class="quick-start-content">
                        <h2 class="quick-start-title" data-i18n="messages:startListening">${th('messages:startListening')}</h2>
                        <p class="quick-start-subtitle" data-i18n="messages:makeMusicPartOfYourLife">${th('messages:makeMusicPartOfYourLife')}</p>
                        <div class="quick-start-actions">
                            <button type="button" class="quick-start-btn primary" id="scan-folder-btn" data-home-action="folder">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/></svg>
                                <span data-i18n="messages:addMusicFolder">${th('messages:addMusicFolder')}</span>
                            </button>
                            <button type="button" class="quick-start-btn secondary" id="add-files-btn" data-home-action="files">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
                                <span data-i18n="messages:addMusicFiles">${th('messages:addMusicFiles')}</span>
                            </button>
                        </div>
                        <p class="home-error" role="status"></p>
                    </div>
                </div>
            </div>`;
        this.resize?.disconnect();
        this.resize = new ResizeObserver(() => this.draw());
        const canvas = this.element.querySelector('canvas');
        if (canvas) this.resize.observe(canvas);
        this.draw();
        this.updateSubscription();
    }

    private async handleClick(event: Event): Promise<void> {
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-home-action]');
        if (!button || button.disabled) return;
        button.disabled = true;
        try {
            if (button.dataset.homeAction === 'folder') await homeLibraryActionService.scanSelectedFolders();
            else await homeLibraryActionService.addMusicFiles();
        } catch (error) {
            console.error('❌ 首页导入音乐失败:', error);
            const target = this.element?.querySelector('.home-error');
            if (target) target.textContent = t('app:homeOperationFailed');
        } finally {button.disabled = false;}
    }

    private updateSubscription(): void {
        if (this.visible && !document.hidden && !this.reducedMotion.matches) {
            if (!this.disposeSignal) this.disposeSignal = visualizationService.subscribe(frame => this.acceptFrame(frame));
        } else {
            this.disposeSignal?.();
            this.disposeSignal = null;
            if (this.animation !== null) cancelAnimationFrame(this.animation);
            this.animation = null;
            this.playing = false;
            this.session = -1;
            this.smoother.reset();
            if (this.visible) this.draw();
        }
    }

    private acceptFrame(frame: VisualizationFrame): void {
        if (this.session !== frame.session) {this.smoother.reset(); this.session = frame.session; this.draw();}
        const wasPlaying = this.playing;
        this.playing = frame.state === 'playing';
        this.smoother.setSignal(this.playing ? frame.signal?.samples ?? null : null);
        if (!this.playing && !wasPlaying && this.animation === null) return;
        if (this.animation === null) {
            this.lastPaint = performance.now();
            this.animation = requestAnimationFrame(time => this.animate(time));
        }
    }

    private animate(time: number): void {
        this.animation = null;
        const moving = this.smoother.advance(Math.min(100, time - this.lastPaint));
        this.lastPaint = time;
        this.draw();
        if (this.playing || moving) this.animation = requestAnimationFrame(next => this.animate(next));
    }

    private draw(): void {
        const canvas = this.element?.querySelector<HTMLCanvasElement>('#audio-visualizer');
        if (!canvas) return;
        const bounds = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(bounds.width * dpr)), height = Math.max(1, Math.round(bounds.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height;}
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, width, height);
        context.strokeStyle = 'rgba(51, 94, 234, 0.6)';
        context.lineWidth = 2 * dpr;
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.beginPath();
        const points = this.smoother.points;
        const scale = Math.min(60 * dpr, height * 0.2);
        const y = (index: number) => height / 2 + Math.max(-1, Math.min(1, points[index] * 3)) * scale;
        context.moveTo(0, y(0));
        for (let i = 1; i < points.length - 1; i++) {
            const x = i * width / (points.length - 1), nextX = (i + 1) * width / (points.length - 1);
            context.quadraticCurveTo(x, y(i), (x + nextX) / 2, (y(i) + y(i + 1)) / 2);
        }
        context.lineTo(width, y(points.length - 1));
        context.stroke();
    }
}
