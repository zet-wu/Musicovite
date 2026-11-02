import {bindLocalizedText, htmlT, t, th} from '@/shared/i18n';

import type {Track} from "@api/types/library";
import type {Unsubscribe} from "@api/types/common";
import {favoriteService} from "@/features/library/service/FavoriteService";
import {libraryPageDataService} from "@/features/library/service/LibraryPageDataService";
import {CoverLoadQueue} from "@/features/mediaAssets/service/CoverLoadQueue";
import {coverLookupService} from "@/features/mediaAssets/service/CoverLookupService";
import {
    trackCoverDisplayPreferenceService,
    trackCoverNetworkPreferenceService
} from "@/features/settings/service";
import {
    AdaptiveCollectionSurface,
    type CollectionItemKey,
    type CollectionSurfaceSnapshot
} from "@ui/collections";
import type {MainContentScrollCoordinator} from '@/app/runtime/MainContentScrollCoordinator';

export interface TrackCollectionDetailModel {
    identity?: string;
    title: string;
    description?: string;
    cover: string | null;
    backLabel: string;
    metadata: string[];
    tracks: Track[];
    coverArtist?: string;
    coverAlbum?: string;
}

interface LoadedCover {
    success?: boolean;
    imageUrl?: string;
    type?: string;
    filePath?: string;
    error?: string;
}

interface TrackCollectionRow {
    key: string;
    index: number;
    track: Track;
}

export interface TrackCollectionDetailCallbacks {
    onBack(): void;
    onTrackPlayed(track: Track, index: number, tracks: Track[]): void;
    onPlayAll(tracks: Track[]): void;
    onAppendAll(tracks: Track[]): void;
    onTrackRightClick(
        track: Track,
        index: number,
        x: number,
        y: number,
        selectedTracks: Set<number>,
        selectedTrackItems: Track[]
    ): void;
}

interface TrackCollectionDetailOptions {
    observeNetworkPreference?: boolean;
    scroll?: MainContentScrollCoordinator;
    scrollKey?: string;
}

/**
 * 为艺术家、专辑等只读歌曲集合提供统一的歌单式详情交互。
 */
export class TrackCollectionDetail {
    private model: TrackCollectionDetailModel | null = null;
    private rows: TrackCollectionRow[] = [];
    private readonly selectedTracks = new Set<number>();
    private lastSelectedIndex = -1;
    private readonly surface: AdaptiveCollectionSurface<TrackCollectionRow>;
    private showCovers = trackCoverDisplayPreferenceService.isEnabled();
    private readonly coverPreferenceUnsubscribe: Unsubscribe;
    private readonly networkPreferenceUnsubscribe: Unsubscribe;
    private readonly coverLoadQueue = new CoverLoadQueue(4);
    private viewGeneration = 0;
    private readonly scroll: MainContentScrollCoordinator | null;
    private readonly scrollKey: string;

    constructor(
        private readonly container: HTMLElement,
        private readonly callbacks: TrackCollectionDetailCallbacks,
        options: TrackCollectionDetailOptions = {}
    ) {
        this.scroll = options.scroll ?? null;
        this.scrollKey = options.scrollKey ?? 'readonly-collection';
        this.surface = new AdaptiveCollectionSurface<TrackCollectionRow>({
            getKey: row => row.key,
            renderItem: row => this.renderTrackRow(row)
        }, {
            onRenderedRangeChange: keys => this.loadRenderedTrackCovers(keys),
            restoreScrollOffset: this.scroll
                ? scrollTop => this.restoreScrollOffset(scrollTop)
                : undefined
        });
        this.coverPreferenceUnsubscribe = trackCoverDisplayPreferenceService.onChanged((enabled) => {
            this.showCovers = enabled;
            if (this.model) {
                this.render(true);
            }
        });
        this.networkPreferenceUnsubscribe = options.observeNetworkPreference === false
            ? () => undefined
            : trackCoverNetworkPreferenceService.onChanged(() => {
                if (this.model) {
                    this.render(true);
                }
            });
    }

    show(model: TrackCollectionDetailModel): void {
        const preserveScroll = Boolean(
            this.model
            && this.getModelIdentity(this.model) === this.getModelIdentity(model)
            && this.container.firstElementChild
        );
        this.model = model;
        this.rows = this.buildRows(model.tracks);
        this.clearSelection();
        this.render(preserveScroll);
    }

    hide(): void {
        this.viewGeneration++;
        this.coverLoadQueue.beginBatch();
        this.surface.destroy();
        this.model = null;
        this.rows = [];
        this.selectedTracks.clear();
        this.lastSelectedIndex = -1;
    }

    destroy(): void {
        this.hide();
        this.coverPreferenceUnsubscribe();
        this.networkPreferenceUnsubscribe();
        this.coverLoadQueue.destroy();
    }

    private render(preserveScroll = false): void {
        if (!this.model) {
            return;
        }

        const model = this.model;
        const generation = ++this.viewGeneration;
        const snapshot = preserveScroll && this.rows.length > 0
            ? this.surface.captureSnapshot()
            : null;
        this.coverLoadQueue.beginBatch();
        this.surface.destroy();
        const totalDuration = this.model.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
        const trackCount = this.model.tracks.length;
        this.container.innerHTML = `
            <div class="page-content playlist-page readonly-track-collection">
                <div class="collection-detail-nav">
                    <button class="modern-back-btn collection-back-btn" type="button">
                        <svg viewBox="0 0 24 24"><path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z"/></svg>
                        <span>${this.escapeHtml(this.model.backLabel)}</span>
                    </button>
                </div>
                <div class="playlist-hero">
                    <div class="hero-background"><div class="gradient-overlay"></div></div>
                    <div class="hero-content">
                        <div class="playlist-cover-container">
                            <div class="playlist-cover">
                                <img class="collection-cover-image"
                                     src="${this.model.cover || 'assets/images/default-cover.svg'}"
                                     alt="${this.escapeHtml(this.model.title)}">
                                <div class="cover-shadow"></div>
                            </div>
                        </div>
                        <div class="playlist-detail-info align-left">
                            <h1 class="playlist-title">${this.escapeHtml(this.model.title)}</h1>
                            ${this.model.description ? `<p class="playlist-description">${this.escapeHtml(this.model.description)}</p>` : ''}
                            <div class="playlist-meta">
                                <span class="meta-item">${htmlT('common:tracks', {count: trackCount})}</span>
                                <span class="meta-item">${this.formatTotalDuration(totalDuration)}</span>
                                ${this.model.metadata.map(item => `<span class="meta-item">${this.escapeHtml(item)}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="playlist-actions">
                    <div class="actions-primary">
                        <button class="play-btn primary collection-play-all" type="button" ${trackCount === 0 ? 'disabled' : ''}>
                            <div class="btn-content">
                                <svg class="play-icon" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                                <span class="btn-text" data-i18n="messages:playAll">${th('messages:playAll')}</span>
                            </div>
                        </button>
                        <button class="play-btn primary collection-append-all" type="button" ${trackCount === 0 ? 'disabled' : ''}>
                            <div class="btn-content">
                                <svg class="play-icon" viewBox="0 0 24 24"><path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
                                <span class="btn-text" data-i18n="app:addToQueue">${th('app:addToQueue')}</span>
                            </div>
                        </button>
                    </div>
                </div>
                <div class="tracks-section">
                    <div class="tracks-header">
                        <div class="header-left">
                            <h3 class="tracks-title" data-i18n="messages:tracks">${th('messages:tracks')}</h3>
                            <span class="tracks-count">${htmlT('common:tracks', {count: trackCount})}</span>
                        </div>
                        <div class="header-right">
                            <div class="tracks-controls">
                                <button class="control-btn collection-select-all" type="button">
                                    <span data-i18n="messages:selectAll">${th('messages:selectAll')}</span>
                                </button>
                                <button class="control-btn collection-clear-selection" type="button" style="display:none">
                                    <span data-i18n="messages:cancelSelection">${th('messages:cancelSelection')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="tracks-container">
                        ${this.renderTrackListShell()}
                    </div>
                </div>
            </div>
        `;

        const title = this.container.querySelector('.playlist-title');
        const description = this.container.querySelector('.playlist-description');
        const back = this.container.querySelector('.collection-back-btn span');
        if (title) bindLocalizedText(title, () => this.model?.title || '');
        if (description) bindLocalizedText(description, () => this.model?.description || '');
        if (back) bindLocalizedText(back, () => this.model?.backLabel || '');
        this.container.querySelectorAll('.playlist-meta > .meta-item').forEach((element, index) => {
            if (index === 1) bindLocalizedText(element, () => this.formatTotalDuration(totalDuration));
            if (index >= 2) bindLocalizedText(element, () => this.model?.metadata[index - 2] || '');
        });
        this.bindEvents();
        this.mountSurface();
        this.loadCollectionCover(generation);
        if (snapshot) {
            void this.resumeSurface(snapshot, generation, model);
        }
    }

    private getModelIdentity(model: TrackCollectionDetailModel): string {
        return model.identity ?? `${model.title}|${model.coverArtist || ''}|${model.coverAlbum || ''}`;
    }

    private getScrollStateKey(model: TrackCollectionDetailModel): string {
        return `${this.scrollKey}:${this.getModelIdentity(model)}`;
    }

    private renderTrackListShell(): string {
        if (!this.model || this.model.tracks.length === 0) {
            return `<div class="playlist-empty-state"><h3 class="empty-title" data-i18n="messages:noPlayableTracks">${th('messages:noPlayableTracks')}</h3></div>`;
        }

        return `
            <div class="modern-tracks-table ${this.showCovers ? 'with-covers' : ''}">
                <div class="tracks-table-header">
                    <div class="header-cell cell-number">#</div>
                    ${this.showCovers ? `<div class="header-cell cell-cover" data-i18n="app:artwork">${th('app:artwork')}</div>` : ''}
                    <div class="header-cell cell-title" data-i18n="messages:track">${th('messages:track')}</div>
                    <div class="header-cell cell-album" data-i18n="app:albums">${th('app:albums')}</div>
                    <div class="header-cell cell-duration" data-i18n="messages:duration">${th('messages:duration')}</div>
                    <div class="header-cell cell-actions"></div>
                </div>
                <div class="tracks-table-body track-collection-surface-root"></div>
            </div>
        `;
    }

    private bindEvents(): void {
        this.container.querySelector('.collection-back-btn')?.addEventListener('click', () => {
            this.callbacks.onBack();
        });
        this.container.querySelector('.collection-play-all')?.addEventListener('click', () => {
            if (this.model) {
                this.callbacks.onPlayAll(this.model.tracks);
            }
        });
        this.container.querySelector('.collection-append-all')?.addEventListener('click', () => {
            if (this.model) {
                this.callbacks.onAppendAll(this.model.tracks);
            }
        });
        this.container.querySelector('.collection-select-all')?.addEventListener('click', () => {
            this.toggleSelectAll();
        });
        this.container.querySelector('.collection-clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
            this.updateSelectionUI();
        });
        this.container.querySelector('.track-collection-surface-root')?.addEventListener('click', (event) => {
            void this.handleTrackClick(event as MouseEvent);
        });
        this.container.querySelector('.track-collection-surface-root')?.addEventListener('dblclick', (event) => {
            this.handleTrackDoubleClick(event as MouseEvent);
        });
        this.container.querySelector('.track-collection-surface-root')?.addEventListener('contextmenu', (event) => {
            this.handleTrackContextMenu(event as MouseEvent);
        });
    }

    private mountSurface(): void {
        if (!this.model?.tracks.length) {
            return;
        }

        const body = this.container.querySelector<HTMLElement>('.track-collection-surface-root');
        const scrollElement = document.querySelector<HTMLElement>('.main-content');
        if (!body || !scrollElement) {
            return;
        }
        this.surface.update(this.rows, {
            mode: 'list',
            estimateRowSize: this.showCovers ? 73 : 65,
            overscan: 8
        });
        this.surface.mount(body, scrollElement);
    }

    private renderTrackRow(row: TrackCollectionRow): string {
        const {track, index} = row;
        const liked = favoriteService.isFavorite(track);
        return `
            <div class="track-row ${this.selectedTracks.has(index) ? 'selected' : ''}"
                 data-track-index="${index}">
                <div class="track-cell cell-number">
                    <div class="track-number-container">
                        <span class="track-number">${index + 1}</span>
                        <div class="play-indicator">
                            <svg class="play-icon" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                        </div>
                    </div>
                </div>
                ${this.showCovers ? `<div class="track-cell cell-cover">
                    <img class="track-cover" src="${this.getTrackCover(track)}" alt="${th('app:artwork')}" data-i18n-alt="app:artwork" loading="lazy">
                </div>` : ''}
                <div class="track-cell cell-title">
                    <div class="track-main-info">
                        <div class="track-name">${this.escapeHtml(track.title || track.fileName || t('messages:unknownTitle'))}</div>
                        <div class="track-artist">${this.escapeHtml(track.artist || t('app:unknownArtist'))}</div>
                    </div>
                </div>
                <div class="track-cell cell-album"><span class="album-name">${this.escapeHtml(track.album || t('messages:unknownAlbum'))}</span></div>
                <div class="track-cell cell-duration"><span class="duration-text">${this.formatDuration(track.duration)}</span></div>
                <div class="track-cell cell-actions">
                    <button class="track-action-btn like-btn ${liked ? 'active' : ''}" data-action="like"
                            type="button" aria-pressed="${liked}" title="${liked ? t('messages:removeFromFavorites') : t('app:favorites')}">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,16.36 2,13.27 2,9.5 2,6.41 4.42,4 7.5,4C9.24,4 10.91,4.81 12,6.08C13.09,4.81 14.76,4 16.5,4C19.58,4 22,6.41 22,9.5 22,13.27 18.6,16.36 13.45,21.03L12,21.35Z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }

    private async handleTrackClick(event: MouseEvent): Promise<void> {
        const row = (event.target as Element | null)?.closest<HTMLElement>('.track-row') ?? null;
        const index = this.getRowIndex(row);
        const track = index === null ? null : this.model?.tracks[index];
        if (!track || index === null) {
            return;
        }

        if ((event.target as Element).closest('[data-action="like"]')) {
            await favoriteService.toggle(track);
            const row = this.rows[index];
            if (row) this.surface.invalidateItem(row.key);
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            this.toggleSelection(index);
        } else if (event.shiftKey && this.selectedTracks.size > 0) {
            this.selectRange(index);
        } else if (this.selectedTracks.size > 0) {
            this.toggleSelection(index);
        }
        this.updateSelectionUI();
    }

    private handleTrackDoubleClick(event: MouseEvent): void {
        if ((event.target as Element | null)?.closest('.track-action-btn')) {
            return;
        }
        const row = (event.target as Element | null)?.closest<HTMLElement>('.track-row') ?? null;
        const index = this.getRowIndex(row);
        const track = index === null ? null : this.model?.tracks[index];
        if (track && index !== null && this.model) {
            this.callbacks.onTrackPlayed(track, index, this.model.tracks);
        }
    }

    private handleTrackContextMenu(event: MouseEvent): void {
        const row = (event.target as Element | null)?.closest<HTMLElement>('.track-row') ?? null;
        const index = this.getRowIndex(row);
        const track = index === null ? null : this.model?.tracks[index];
        if (!track || index === null || !this.model) {
            return;
        }

        event.preventDefault();
        if (!this.selectedTracks.has(index)) {
            this.selectedTracks.clear();
            this.selectedTracks.add(index);
            this.lastSelectedIndex = index;
            this.updateSelectionUI();
        }
        const selectedItems = Array.from(this.selectedTracks)
            .sort((a, b) => a - b)
            .map(selectedIndex => this.model!.tracks[selectedIndex])
            .filter(Boolean);
        this.callbacks.onTrackRightClick(
            track,
            index,
            event.clientX,
            event.clientY,
            new Set(this.selectedTracks),
            selectedItems
        );
    }

    private toggleSelection(index: number): void {
        if (this.selectedTracks.has(index)) {
            this.selectedTracks.delete(index);
        } else {
            this.selectedTracks.add(index);
        }
        this.lastSelectedIndex = index;
    }

    private selectRange(endIndex: number): void {
        const startIndex = this.lastSelectedIndex >= 0 ? this.lastSelectedIndex : endIndex;
        for (let index = Math.min(startIndex, endIndex); index <= Math.max(startIndex, endIndex); index++) {
            this.selectedTracks.add(index);
        }
    }

    private toggleSelectAll(): void {
        if (!this.model) {
            return;
        }
        if (this.selectedTracks.size === this.model.tracks.length) {
            this.clearSelection();
        } else {
            this.selectedTracks.clear();
            this.model.tracks.forEach((_, index) => this.selectedTracks.add(index));
        }
        this.updateSelectionUI();
    }

    private clearSelection(): void {
        this.selectedTracks.clear();
        this.lastSelectedIndex = -1;
    }

    private updateSelectionUI(): void {
        this.container.querySelectorAll<HTMLElement>('.track-row').forEach(row => {
            const index = this.getRowIndex(row);
            row.classList.toggle('selected', index !== null && this.selectedTracks.has(index));
        });
        const clearButton = this.container.querySelector<HTMLElement>('.collection-clear-selection');
        if (clearButton) {
            clearButton.style.display = this.selectedTracks.size > 0 ? '' : 'none';
        }
        const selectAllLabel = this.container.querySelector<HTMLElement>('.collection-select-all span');
        if (selectAllLabel && this.model) {
            bindLocalizedText(selectAllLabel, () => this.selectedTracks.size === this.model?.tracks.length ? t('messages:deselectAll') : t('messages:selectAll'), 'textContent');
        }
    }

    private getRowIndex(row: HTMLElement | null): number | null {
        const index = Number.parseInt(row?.dataset.trackIndex || '', 10);
        return Number.isInteger(index) && index >= 0 ? index : null;
    }

    private getTrackIdentity(track: Track): string {
        return String(track.fileId || track.id || track.filePath || '');
    }

    private getTrackCover(track: Track): string {
        if (track.cover && typeof track.cover === 'string') {
            return track.cover;
        }
        return 'assets/images/default-cover.svg';
    }

    private loadTrackCover(row: TrackCollectionRow, generation: number): void {
        const {track, index} = row;
        const key = track.filePath || this.getTrackIdentity(track);
        if (!key) return;

        this.coverLoadQueue.schedule(`track:${key}`, async (signal) => {
            const result = await coverLookupService.getCover(
                track.title,
                track.artist,
                track.album,
                track.filePath,
                false,
                {
                    allowNetwork: trackCoverNetworkPreferenceService.isEnabled(),
                    signal
                }
            ) as LoadedCover;
            if (
                signal.aborted
                || generation !== this.viewGeneration
                || !this.model
                || this.model.tracks[index] !== track
                || !result.success
                || !result.imageUrl
            ) {
                return;
            }

            track.cover = this.normalizeCoverUrl(result);
            this.surface.invalidateItem(row.key);
        });
    }

    private loadRenderedTrackCovers(keys: CollectionItemKey[]): void {
        if (!this.showCovers || !this.model) return;
        const renderedKeys = new Set(keys);
        const generation = this.viewGeneration;
        this.rows.forEach(row => {
            if (renderedKeys.has(row.key) && !row.track.cover) {
                this.loadTrackCover(row, generation);
            }
        });
    }

    private loadCollectionCover(generation: number): void {
        if (!this.model || this.model.cover || this.model.tracks.length === 0) {
            return;
        }
        const model = this.model;
        this.coverLoadQueue.schedule(`collection:${generation}`, async (signal) => {
            const firstTrack = model.tracks[0];
            const result = await libraryPageDataService.findCollectionCover(
                model.tracks,
                model.coverArtist || firstTrack.artist || '',
                model.coverAlbum ?? firstTrack.album ?? '',
                trackCoverNetworkPreferenceService.isEnabled(),
                signal
            );
            if (
                signal.aborted
                || generation !== this.viewGeneration
                || this.model !== model
                || !result.success
                || !result.imageUrl
            ) {
                return;
            }
            model.cover = result.imageUrl;
            const image = this.container.querySelector<HTMLImageElement>('.collection-cover-image');
            if (image) {
                image.src = result.imageUrl;
            }
        });
    }

    private normalizeCoverUrl(result: LoadedCover): string {
        if (result.type !== 'local-file' || !result.filePath) {
            return result.imageUrl || 'assets/images/default-cover.svg';
        }
        if (result.imageUrl?.startsWith('file://')) {
            return result.imageUrl;
        }
        let filePath = result.filePath.replace(/\\/g, '/');
        if (!filePath.startsWith('/')) {
            filePath = `/${filePath}`;
        }
        return `file://${filePath}`;
    }

    private buildRows(tracks: Track[]): TrackCollectionRow[] {
        const occurrences = new Map<string, number>();
        return tracks.map((track, index) => {
            const identity = this.getTrackIdentity(track) || `index:${index}`;
            const occurrence = occurrences.get(identity) || 0;
            occurrences.set(identity, occurrence + 1);
            return {
                key: `track:${identity}:${occurrence}`,
                index,
                track
            };
        });
    }

    private async resumeSurface(
        snapshot: CollectionSurfaceSnapshot,
        generation: number,
        model: TrackCollectionDetailModel
    ): Promise<void> {
        await this.surface.resume(snapshot);
        if (generation !== this.viewGeneration || this.model !== model) {
            return;
        }
        this.updateSelectionUI();
    }

    private restoreScrollOffset(scrollTop: number): Promise<void> {
        if (!this.scroll || !this.model) return Promise.resolve();
        const model = this.model;
        const generation = this.viewGeneration;
        const key = this.getScrollStateKey(model);
        this.scroll.remember(key, scrollTop);
        return this.scroll.restore(key, {
            scrollTop,
            whenReady: () => this.surface.whenReady(),
            isCurrent: () => (
                generation === this.viewGeneration
                && this.model === model
                && this.container.style.display !== 'none'
            )
        });
    }

    private formatDuration(duration?: number): string {
        if (!duration || duration <= 0) {
            return '--:--';
        }
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    private formatTotalDuration(duration: number): string {
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        return hours > 0 ? t('dynamic:durationHoursMinutes', {hours: hours, minutes: minutes}) : t('dynamic:durationMinutes', {minutes: minutes});
    }

    private escapeHtml(value: unknown): string {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML;
    }
}
