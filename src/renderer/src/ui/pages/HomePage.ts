import {Component} from '@ui/base/Component';
import {t, th, escapeTranslation, onLocaleChanged} from '@/shared/i18n';
import {homeLibraryActionService} from '@/features/library/service/HomeLibraryActionService';
import {playbackUiStateService} from '@/features/playback/service/PlaybackUiStateService';
import {recentPlaybackHistoryService} from '@/features/playback/service/RecentPlaybackHistoryService';
import {visualizationService, type VisualizationFrame} from '@/features/playback/service/VisualizationService';
import {settingsStore} from '@/features/settings/service/SettingsStore';
import type {Track} from '@api/types/track';

export class HomePage extends Component {
    private visible = false;
    private generation = 0;
    private waveform = settingsStore.load().homeWaveform !== false;
    private ambient = settingsStore.load().homeAmbient === true;
    private disposeSignal: (() => void) | null = null;
    private disposers: Array<() => void> = [];
    private resize: ResizeObserver | null = null;
    private recent: Track[] = [];
    private tracks: Track[] = [];
    private level = 0;
    private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    constructor(container: string | Element | null) {
        super(container);
        if (this.element) this.addEventListenerManaged(this.element, 'click', event => void this.handleClick(event));
        this.addEventListenerManaged(document, 'visibilitychange', () => this.updateSubscription());
        this.addEventListenerManaged(this.reducedMotion, 'change', () => {this.updateSubscription(); this.draw(null);});
        this.disposers.push(onLocaleChanged(() => {if (this.visible) this.render();}));
        this.disposers.push(playbackUiStateService.subscribe(() => {if (this.visible) this.updatePlayback();}));
        this.disposers.push(recentPlaybackHistoryService.subscribe(() => {if (this.visible) this.renderRecent();}));
        this.addAPIEventListenerManaged('libraryUpdated', (tracks: Track[]) => {
            this.tracks = tracks;
            if (this.visible) this.updateLibrary();
        });
    }

    async show(): Promise<void> {
        const generation = ++this.generation;
        this.visible = true;
        if (this.element instanceof HTMLElement) this.element.style.display = 'block';
        this.render();
        try {
            const tracks = await homeLibraryActionService.loadTracks();
            if (generation !== this.generation || !this.visible) return;
            this.tracks = tracks;
            this.updateLibrary();
        } catch (error) {
            this.showError(error);
        }
    }

    hide(): void {
        this.visible = false;
        this.generation++;
        this.updateSubscription();
        this.resize?.disconnect();
        if (this.element instanceof HTMLElement) this.element.style.display = 'none';
    }

    destroy(): void {
        this.hide();
        this.disposers.splice(0).forEach(dispose => dispose());
        super.destroy();
    }

    private render(): void {
        if (!this.element) return;
        const focus = (document.activeElement as HTMLElement | null)?.dataset.homeAction;
        this.element.innerHTML = `
            <div class="musicovite-home">
                <header class="home-heading"><div><p class="home-eyebrow">Musicovite</p><h1>${th('app:homeWelcome')}</h1><p>${th('app:homeSubtitle')}</p></div><img src="favicon.svg" alt="" width="88" height="88"></header>
                <section class="home-now" aria-label="${th('app:homeNowPlaying')}">
                    <div class="home-ambient" aria-hidden="true"></div>
                    <div class="home-now-content"><p class="home-eyebrow">${th('app:homeNowPlaying')}</p><h2 data-home-title></h2><p data-home-artist></p>
                    <button type="button" data-home-action="play" class="home-primary"></button></div>
                    <canvas class="home-waveform" aria-label="${th('app:homeWaveform')}"></canvas>
                    <div class="home-controls"><button type="button" data-home-action="waveform" aria-pressed="${this.waveform}">${th('app:homeWaveform')}</button><button type="button" data-home-action="ambient" aria-pressed="${this.ambient}">${th('app:homeAmbient')}</button><span data-home-signal></span></div>
                </section>
                <div class="home-lower"><section class="home-recent"><h2>${th('app:recentlyPlayed')}</h2><div data-home-recent></div></section>
                <section class="home-add"><h2>${th('app:homeAddMusic')}</h2><p data-home-library></p><button type="button" data-home-action="folder" class="home-primary">${th('app:homeAddFolder')}</button><button type="button" data-home-action="files">${th('app:homeAddFiles')}</button><p class="home-error" role="status"></p></section></div>
            </div>`;
        this.resize?.disconnect();
        this.resize = new ResizeObserver(() => this.draw(null));
        const canvas = this.element.querySelector('canvas');
        if (canvas) this.resize.observe(canvas);
        this.renderRecent();
        this.updatePlayback();
        this.updateLibrary();
        this.updateSubscription();
        this.draw(null);
        if (focus) this.element.querySelector<HTMLElement>(`[data-home-action="${focus}"]`)?.focus();
    }

    private updatePlayback(): void {
        const state = playbackUiStateService.getState();
        const title = this.element?.querySelector('[data-home-title]');
        const artist = this.element?.querySelector('[data-home-artist]');
        const button = this.element?.querySelector<HTMLButtonElement>('[data-home-action="play"]');
        if (title) title.textContent = state.currentTrack?.title || t('app:noTrackSelected');
        if (artist) artist.textContent = state.currentTrack?.artist || t('app:homeChooseTrack');
        if (button) {button.textContent = t(state.isPlaying ? 'app:homePause' : 'app:homePlay'); button.disabled = !state.currentTrack;}
    }

    private updateLibrary(): void {
        const target = this.element?.querySelector('[data-home-library]');
        if (target) target.textContent = this.tracks.length ? t('app:homeLibraryCount', {count: this.tracks.length}) : t('app:homeEmptyLibrary');
    }

    private renderRecent(): void {
        this.recent = recentPlaybackHistoryService.loadHistory(6);
        const target = this.element?.querySelector('[data-home-recent]');
        if (!target) return;
        target.innerHTML = this.recent.length ? this.recent.map((track, index) => `<button type="button" class="home-track" data-home-action="recent" data-index="${index}"><span class="home-track-number">${String(index + 1).padStart(2, '0')}</span><span><strong>${escapeTranslation(track.title || track.fileName || '')}</strong><small>${escapeTranslation(track.artist || t('app:unknownArtist'))}</small></span><span aria-hidden="true">▶</span></button>`).join('') : `<p>${th('app:homeNoHistory')}</p>`;
    }

    private async handleClick(event: Event): Promise<void> {
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-home-action]');
        if (!button) return;
        try {
            switch (button.dataset.homeAction) {
                case 'play': await playbackUiStateService.toggleCurrentPlayback(); break;
                case 'recent': {
                    const index = Number(button.dataset.index);
                    this.emit('trackPlayed', this.recent[index], index, this.recent);
                    break;
                }
                case 'waveform':
                case 'ambient': {
                    const waveform = button.dataset.homeAction === 'waveform';
                    if (waveform) this.waveform = !this.waveform; else this.ambient = !this.ambient;
                    const enabled = waveform ? this.waveform : this.ambient;
                    settingsStore.update(settingsStore.load(), waveform ? 'homeWaveform' : 'homeAmbient', enabled);
                    button.setAttribute('aria-pressed', String(enabled));
                    this.updateSubscription(); this.draw(null); break;
                }
                case 'folder':
                case 'files': {
                    button.disabled = true;
                    const result = button.dataset.homeAction === 'folder' ? await homeLibraryActionService.scanSelectedFolders() : await homeLibraryActionService.addMusicFiles();
                    if (result.changed) {this.tracks = result.tracks; this.updateLibrary();}
                    break;
                }
            }
        } catch (error) {this.showError(error);} finally {if (button.dataset.homeAction !== 'play') button.disabled = false;}
    }

    private showError(error: unknown): void {
        console.error('❌ 首页操作失败:', error);
        const target = this.element?.querySelector('.home-error');
        if (target) target.textContent = t('app:homeOperationFailed');
    }

    private updateSubscription(): void {
        const active = this.visible && !document.hidden && !this.reducedMotion.matches && (this.waveform || this.ambient);
        if (active && !this.disposeSignal) this.disposeSignal = visualizationService.subscribe(frame => this.draw(frame));
        else if (!active) {this.disposeSignal?.(); this.disposeSignal = null;}
    }

    private draw(frame: VisualizationFrame | null): void {
        const canvas = this.element?.querySelector<HTMLCanvasElement>('canvas');
        if (!canvas) return;
        const bounds = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(bounds.width * dpr)), height = Math.max(1, Math.round(bounds.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height;}
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, width, height);
        const samples = frame?.state === 'playing' ? frame.signal?.samples : null;
        let energy = 0;
        if (samples) for (const sample of samples) energy += sample * sample;
        const rms = samples?.length ? Math.sqrt(energy / samples.length) : 0;
        this.level += (rms - this.level) * 0.25;
        const ambient = this.element?.querySelector<HTMLElement>('.home-ambient');
        if (ambient) ambient.style.opacity = this.ambient && !this.reducedMotion.matches && frame?.state === 'playing' ? String(Math.min(0.28, this.level * 0.8)) : '0';
        const status = this.element?.querySelector('[data-home-signal]');
        if (status) status.textContent = frame?.state === 'unavailable' ? t('app:homeSignalUnavailable') : '';
        if (!this.waveform) return;
        context.strokeStyle = getComputedStyle(canvas).color;
        context.lineWidth = 2 * dpr;
        context.beginPath();
        const count = samples?.length || 2;
        for (let i = 0; i < count; i++) {
            const x = i * width / (count - 1), y = height * (0.5 - Math.max(-1, Math.min(1, samples?.[i] || 0)) * 0.42);
            if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
    }
}
