import {bindLocalizedText, th, setLocalizedText, t} from '@/shared/i18n';

import type {Track} from '@api/types/library';
import {libraryDataService} from '@/features/library/service/LibraryDataService';
import {playlistCoverActionService, type PlaylistCoverActionResult} from '@/features/playlists/service/PlaylistCoverActionService';
import {Component} from '@ui/base/Component';

type CoverTrack = Track & {
    fileId?: string;
};

const COVER_PREVIEW_TIMEOUT_MS = 10_000;

class CoverPreviewTimeoutError extends Error {}

export class PlaylistCoverTrackDialog extends Component {
    private overlay!: HTMLElement;
    private list!: HTMLElement;
    private confirmButton!: HTMLButtonElement;
    private tracks: CoverTrack[] = [];
    private playlistId = '';
    private selectedTrackId: string | null = null;
    private observer: IntersectionObserver | null = null;
    private previewUrls = new Map<string, string>();
    private resolveResult: ((result: PlaylistCoverActionResult | null) => void) | null = null;
    private generation = 0;

    constructor() {
        super(null, false);
        this.ensureElements();
    }

    show(playlistId: string, tracks: CoverTrack[]): Promise<PlaylistCoverActionResult | null> {
        this.hide();
        this.generation += 1;
        this.playlistId = playlistId;
        this.tracks = tracks.filter(track => Boolean(track.fileId && track.filePath));
        this.selectedTrackId = null;
        this.confirmButton.disabled = true;
        this.overlay.style.display = 'flex';
        this.renderTracks();
        this.observePreviews(this.generation);
        return new Promise(resolve => {
            this.resolveResult = resolve;
        });
    }

    hide(result: PlaylistCoverActionResult | null = null): void {
        this.generation += 1;
        this.observer?.disconnect();
        this.observer = null;
        this.clearPreviewUrls();
        if (this.overlay) this.overlay.style.display = 'none';
        const resolve = this.resolveResult;
        this.resolveResult = null;
        resolve?.(result);
    }

    destroy(): void {
        this.hide();
        this.overlay.remove();
        super.destroy();
    }

    private ensureElements(): void {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="modal-overlay playlist-cover-track-overlay" style="display: none;">
                <div class="modal-dialog modal-dialog-large playlist-cover-track-dialog">
                    <div class="modal-header">
                        <div>
                            <h3 class="modal-title" data-i18n="messages:chooseArtworkFromTrack">${th('messages:chooseArtworkFromTrack')}</h3>
                            <p class="playlist-cover-track-subtitle" data-i18n="messages:useEmbeddedArtworkFromAnAudioFileAndSaveAn">${th('messages:useEmbeddedArtworkFromAnAudioFileAndSaveAn')}</p>
                        </div>
                        <button class="modal-close-btn" data-cover-dialog-action="close" aria-label="${th('app:close')}" data-i18n-aria-label="app:close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="playlist-cover-track-list"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-cover-dialog-action="close" data-i18n="app:cancel">${th('app:cancel')}</button>
                        <button class="btn btn-primary" data-cover-dialog-action="confirm" disabled data-i18n="messages:useThisArtwork">${th('messages:useThisArtwork')}</button>
                    </div>
                </div>
            </div>
        `;
        this.overlay = container.firstElementChild as HTMLElement;
        document.body.appendChild(this.overlay);
        this.list = this.overlay.querySelector('.playlist-cover-track-list') as HTMLElement;
        this.confirmButton = this.overlay.querySelector('[data-cover-dialog-action="confirm"]') as HTMLButtonElement;
        this.addEventListenerManaged(this.overlay, 'click', event => {
            void this.handleClick(event);
        });
    }

    private renderTracks(): void {
        if (this.tracks.length === 0) {
            this.list.innerHTML = `
                <div class="playlist-cover-track-empty">
                    <strong><span data-i18n="messages:noTracksToChooseFrom">${th('messages:noTracksToChooseFrom')}</span></strong>
                    <span data-i18n="messages:addTracksToThePlaylistFirst">${th('messages:addTracksToThePlaylistFirst')}</span>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.tracks.map(track => `
            <button class="playlist-cover-track-item" type="button"
                    data-cover-track-id="${this.escapeHtml(track.fileId || '')}" disabled>
                <span class="playlist-cover-track-preview">
                    <span class="playlist-cover-track-placeholder">♪</span>
                    <img alt="" hidden>
                </span>
                <span class="playlist-cover-track-info">
                    <strong>${this.escapeHtml(track.title || track.fileName || t('messages:unknownTrack'))}</strong>
                    <span>${this.escapeHtml(track.artist || t('app:unknownArtist'))}</span>
                </span>
                <span class="playlist-cover-track-status" data-i18n="messages:checkingEmbeddedArtwork">${th('messages:checkingEmbeddedArtwork')}</span>
            </button>
        `).join('');
    }

    private observePreviews(generation: number): void {
        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const item = entry.target as HTMLButtonElement;
                this.observer?.unobserve(item);
                void this.loadPreview(item, generation);
            }
        }, {root: this.list.closest('.modal-body'), rootMargin: '120px'});

        this.list.querySelectorAll<HTMLElement>('[data-cover-track-id]').forEach(item => {
            this.observer?.observe(item);
        });
    }

    private async loadPreview(item: HTMLButtonElement, generation: number): Promise<void> {
        const trackId = item.dataset.coverTrackId;
        const track = this.tracks.find(candidate => candidate.fileId === trackId);
        if (!track?.filePath || !trackId) return;

        const status = item.querySelector<HTMLElement>('.playlist-cover-track-status');
        try {
            const cover = await this.getTrackCoverWithTimeout(track.filePath);
            if (generation !== this.generation) return;
            if (!cover?.data) {
                if (status) setLocalizedText(status, 'messages:noEmbeddedArtwork', {}, 'textContent');
                return;
            }
            const bytes = cover.data instanceof Uint8Array ? cover.data : new Uint8Array(cover.data);
            const imageBuffer = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(imageBuffer).set(bytes);
            const url = URL.createObjectURL(new Blob([imageBuffer], {type: cover.format || 'application/octet-stream'}));
            this.manageObjectUrl(url);
            this.previewUrls.set(trackId, url);
            const image = item.querySelector<HTMLImageElement>('img');
            if (image) {
                image.src = url;
                image.hidden = false;
            }
            item.querySelector<HTMLElement>('.playlist-cover-track-placeholder')?.setAttribute('hidden', '');
            if (status) setLocalizedText(status, 'messages:available', {}, 'textContent');
            item.disabled = false;
        } catch (error) {
            console.warn('⚠️ 检查歌曲内嵌封面失败:', error);
            if (generation !== this.generation) return;
            if (status) {
                bindLocalizedText(status, () => error instanceof CoverPreviewTimeoutError ? t('messages:detectionTimedOut') : t('messages:detectionFailed'), 'textContent');
            }
        }
    }

    private async getTrackCoverWithTimeout(filePath: string) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            return await Promise.race([
                libraryDataService.getTrackCover(filePath),
                new Promise<never>((_resolve, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new CoverPreviewTimeoutError(t('messages:embeddedArtworkDetectionTimedOut')));
                    }, COVER_PREVIEW_TIMEOUT_MS);
                })
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>('[data-cover-dialog-action]')?.dataset.coverDialogAction;
        if (action === 'close') {
            this.hide();
            return;
        }
        if (action === 'confirm') {
            await this.confirmSelection();
            return;
        }

        const item = target?.closest<HTMLButtonElement>('[data-cover-track-id]');
        if (!item || item.disabled || !item.dataset.coverTrackId) return;
        this.selectedTrackId = item.dataset.coverTrackId;
        this.list.querySelectorAll('.playlist-cover-track-item').forEach(element => {
            element.classList.toggle('selected', element === item);
        });
        this.confirmButton.disabled = false;
    }

    private async confirmSelection(): Promise<void> {
        if (!this.selectedTrackId || this.confirmButton.disabled) return;
        this.confirmButton.disabled = true;
        setLocalizedText(this.confirmButton, 'messages:savingMessage', {}, 'textContent');
        const result = await playlistCoverActionService.setCoverFromTrack(this.playlistId, this.selectedTrackId);
        setLocalizedText(this.confirmButton, 'messages:useThisArtwork', {}, 'textContent');
        if (result.changed) {
            this.hide(result);
            return;
        }
        this.confirmButton.disabled = false;
    }

    private clearPreviewUrls(): void {
        for (const url of this.previewUrls.values()) this.revokeObjectUrlManaged(url);
        this.previewUrls.clear();
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
