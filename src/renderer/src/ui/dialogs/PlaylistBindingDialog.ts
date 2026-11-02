import {htmlT, th, setLocalizedText, t} from '@/shared/i18n';

import type {PlaylistSourceBinding} from '@api/types/electron';
import type {Playlist} from '@api/types/library';
import {playlistBindingService} from '@/features/playlists/service/PlaylistBindingService';
import {Component} from '@ui/base/Component';

export class PlaylistBindingDialog extends Component {
    private overlay!: HTMLElement;
    private list!: HTMLElement;
    private title!: HTMLElement;
    private currentPlaylist: Playlist | null = null;
    private bindings: PlaylistSourceBinding[] = [];
    private listenersSetup = false;

    constructor() {
        super(null, false);
    }

    async show(playlist: Playlist): Promise<void> {
        this.ensureElements();
        this.currentPlaylist = playlist;
        setLocalizedText(this.title, 'dynamic:playlistFolders', {name: playlist.name}, 'textContent');
        this.overlay.style.display = 'flex';
        await this.loadBindings();
    }

    hide(): void {
        this.overlay.style.display = 'none';
        this.currentPlaylist = null;
        this.bindings = [];
    }

    private ensureElements(): void {
        if (!this.overlay) {
            const container = document.createElement('div');
            container.innerHTML = `
                <div id="playlist-binding-dialog" class="modal-overlay" style="display: none;">
                    <div class="modal-dialog modal-dialog-large playlist-binding-dialog">
                        <div class="modal-header">
                            <div>
                                <h3 class="modal-title" id="playlist-binding-title" data-i18n="messages:manageBoundFolders">${th('messages:manageBoundFolders')}</h3>
                                <p class="playlist-binding-subtitle" data-i18n="messages:boundFoldersBecomeLibrarySourcesNewTracksAreAddedTo">${th('messages:boundFoldersBecomeLibrarySourcesNewTracksAreAddedTo')}</p>
                            </div>
                            <button class="modal-close-btn" data-binding-action="close" aria-label="${th('app:close')}" data-i18n-aria-label="app:close">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="playlist-binding-toolbar">
                                <button class="btn btn-primary" data-binding-action="add" data-i18n="messages:bindFolder">${th('messages:bindFolder')}</button>
                            </div>
                            <div class="playlist-binding-list" id="playlist-binding-list"></div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-binding-action="close" data-i18n="messages:done">${th('messages:done')}</button>
                        </div>
                    </div>
                </div>
            `;
            this.overlay = container.firstElementChild as HTMLElement;
            document.body.appendChild(this.overlay);
            this.list = this.overlay.querySelector('#playlist-binding-list') as HTMLElement;
            this.title = this.overlay.querySelector('#playlist-binding-title') as HTMLElement;
        }

        if (!this.listenersSetup) {
            this.addEventListenerManaged(this.overlay, 'click', event => {
                void this.handleClick(event);
            });
            this.listenersSetup = true;
        }
    }

    private async loadBindings(): Promise<void> {
        if (!this.currentPlaylist) return;
        this.list.innerHTML = `<div class="playlist-binding-empty" data-i18n="messages:loadingBindings">${th('messages:loadingBindings')}</div>`;
        this.bindings = await playlistBindingService.getBindings(this.currentPlaylist.id);
        this.renderBindings();
    }

    private renderBindings(): void {
        if (this.bindings.length === 0) {
            this.list.innerHTML = `
                <div class="playlist-binding-empty">
                    <strong><span data-i18n="messages:noFoldersBound">${th('messages:noFoldersBound')}</span></strong>
                    <span data-i18n="messages:keepTracksInThisFolderAndItsSubfoldersSynchronizedWith">${th('messages:keepTracksInThisFolderAndItsSubfoldersSynchronizedWith')}</span>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.bindings.map(binding => {
            const lastScan = binding.lastSyncAt
                ? new Date(binding.lastSyncAt).toLocaleString('zh-CN')
                : t('messages:notYetScanned');
            const sourcePath = binding.source?.path || t('messages:sourceUnavailable');
            return `
                <article class="playlist-binding-item" data-binding-id="${binding.id}">
                    <div class="playlist-binding-info">
                        <strong class="playlist-binding-path" title="${this.escapeHtml(sourcePath)}">
                            ${this.escapeHtml(sourcePath)}
                        </strong>
                        <div class="playlist-binding-meta">
                            <span>${htmlT('common:availableTracks', {count: binding.availableTrackCount || 0})}</span>
                            <span>${htmlT('common:excludedTracks', {count: binding.excludedTrackCount || 0})}</span>
                            <span>${htmlT('common:lastSync', {date: lastScan})}</span>
                        </div>
                    </div>
                    <div class="playlist-binding-actions">
                        <button class="btn btn-outline" data-binding-action="rescan" data-i18n="messages:rescan">${th('messages:rescan')}</button>
                        <button class="btn btn-outline" data-binding-action="restore"
                            ${(binding.excludedTrackCount || 0) === 0 ? 'disabled' : ''} data-i18n="messages:restoreExcludedTracks">${th('messages:restoreExcludedTracks')}</button>
                        <button class="btn btn-outline" data-binding-action="unbind-keep" data-i18n="messages:unbindAndKeep">${th('messages:unbindAndKeep')}</button>
                        <button class="btn btn-danger" data-binding-action="unbind-remove" data-i18n="messages:unbindAndRemove">${th('messages:unbindAndRemove')}</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-binding-action]')
            : null;
        if (!target || target.hasAttribute('disabled')) return;
        const action = target.dataset.bindingAction;

        if (action === 'close') {
            this.hide();
            return;
        }
        if (action === 'add') {
            if (this.currentPlaylist && await playlistBindingService.addBindings(this.currentPlaylist.id)) {
                await this.handleChanged();
            }
            return;
        }

        const item = target.closest<HTMLElement>('[data-binding-id]');
        const binding = this.bindings.find(candidate => candidate.id === item?.dataset.bindingId);
        if (!binding) return;

        let changed = false;
        if (action === 'rescan') changed = await playlistBindingService.rescan(binding.id);
        if (action === 'restore') changed = await playlistBindingService.restoreExclusions(binding.id);
        if (action === 'unbind-keep') changed = await playlistBindingService.unbind(binding, 'keep');
        if (action === 'unbind-remove') changed = await playlistBindingService.unbind(binding, 'remove');
        if (changed) await this.handleChanged();
    }

    private async handleChanged(): Promise<void> {
        await this.loadBindings();
        this.emit('bindingsChanged', this.currentPlaylist);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
