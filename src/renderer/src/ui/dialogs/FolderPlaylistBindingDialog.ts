import {th, htmlT, setLocalizedText, t} from '@/shared/i18n';

import type {
    FolderPlaylistBindingSummary,
    LibraryDirectoryOverview,
    PlaylistSourceBinding
} from '@api/types/electron';
import type {Playlist} from '@api/types/library';
import {libraryDataService, librarySourceManagementService} from '@/features/library/service';
import {playlistBindingService} from '@/features/playlists/service/PlaylistBindingService';
import {Component} from '@ui/base/Component';

export class FolderPlaylistBindingDialog extends Component {
    private overlay!: HTMLElement;
    private list!: HTMLElement;
    private title!: HTMLElement;
    private query!: HTMLInputElement;
    private source: LibraryDirectoryOverview | null = null;
    private playlists: Playlist[] = [];
    private busy = false;
    private listenersSetup = false;

    constructor() {
        super(null, false);
    }

    async show(source: LibraryDirectoryOverview): Promise<void> {
        this.ensureElements();
        this.source = source;
        setLocalizedText(this.title, 'dynamic:folderPlaylists', {name: this.getDisplayName(source.path)}, 'textContent');
        this.query.value = '';
        this.overlay.style.display = 'flex';
        await this.loadData();
    }

    hide(): void {
        this.overlay.style.display = 'none';
        this.source = null;
        this.playlists = [];
        this.busy = false;
    }

    private ensureElements(): void {
        if (!this.overlay) {
            const container = document.createElement('div');
            container.innerHTML = `
                <div class="modal-overlay" id="folder-playlist-binding-dialog" style="display:none;">
                    <div class="modal-dialog modal-dialog-large playlist-binding-dialog folder-playlist-binding-dialog">
                        <div class="modal-header">
                            <div>
                                <h3 class="modal-title" id="folder-binding-title" data-i18n="messages:manageBoundPlaylists">${th('messages:manageBoundPlaylists')}</h3>
                                <p class="playlist-binding-subtitle" data-i18n="messages:keepTracksInThisFolderSynchronizedWithTheBoundPlaylists">${th('messages:keepTracksInThisFolderSynchronizedWithTheBoundPlaylists')}</p>
                            </div>
                            <button class="modal-close-btn" data-folder-binding-action="close" aria-label="${th('app:close')}" data-i18n-aria-label="app:close">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="folder-binding-source-path"></div>
                            <div class="playlist-binding-toolbar">
                                <div class="search-inline folder-binding-search">
                                    <input id="folder-binding-query" type="search" placeholder="${th('messages:searchPlaylists')}" data-i18n-placeholder="messages:searchPlaylists" aria-label="${th('messages:searchPlaylists')}" data-i18n-aria-label="messages:searchPlaylists">
                                </div>
                            </div>
                            <div class="playlist-binding-list" id="folder-binding-list"></div>
                            <div class="playlist-binding-empty folder-binding-search-empty" hidden data-i18n="messages:noMatchingPlaylists">${th('messages:noMatchingPlaylists')}</div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-folder-binding-action="close" data-i18n="messages:done">${th('messages:done')}</button>
                        </div>
                    </div>
                </div>
            `;
            this.overlay = container.firstElementChild as HTMLElement;
            document.body.appendChild(this.overlay);
            this.list = this.overlay.querySelector('#folder-binding-list') as HTMLElement;
            this.title = this.overlay.querySelector('#folder-binding-title') as HTMLElement;
            this.query = this.overlay.querySelector('#folder-binding-query') as HTMLInputElement;
        }

        if (!this.listenersSetup) {
            this.addEventListenerManaged(this.overlay, 'click', event => void this.handleClick(event));
            this.addEventListenerManaged(this.query, 'input', () => this.applySearchFilter());
            this.listenersSetup = true;
        }
    }

    private async loadData(): Promise<void> {
        if (!this.source) return;
        this.list.innerHTML = `<div class="playlist-binding-empty" data-i18n="messages:loadingPlaylists">${th('messages:loadingPlaylists')}</div>`;
        const [directories, playlists] = await Promise.all([
            librarySourceManagementService.getDirectories(),
            libraryDataService.getPlaylists()
        ]);
        const currentSource = directories.find(candidate => candidate.id === this.source?.id);
        if (!currentSource) {
            this.list.innerHTML = `<div class="playlist-binding-empty" data-i18n="messages:musicFolderSourceNoLongerExists">${th('messages:musicFolderSourceNoLongerExists')}</div>`;
            return;
        }
        this.source = currentSource;
        this.playlists = playlists;
        const sourcePath = this.overlay.querySelector<HTMLElement>('.folder-binding-source-path');
        if (sourcePath) {
            sourcePath.textContent = currentSource.path;
            sourcePath.title = currentSource.path;
        }
        this.renderPlaylists();
    }

    private renderPlaylists(): void {
        if (!this.source) return;
        if (this.playlists.length === 0) {
            this.list.innerHTML = `
                <div class="playlist-binding-empty">
                    <strong><span data-i18n="messages:noPlaylistsCreatedYet">${th('messages:noPlaylistsCreatedYet')}</span></strong>
                    <span data-i18n="messages:createAPlaylistBeforeBindingAFolderHere">${th('messages:createAPlaylistBeforeBindingAFolderHere')}</span>
                </div>
            `;
            return;
        }

        const bindings = new Map(this.source.bindings.map(binding => [binding.playlistId, binding]));
        this.list.innerHTML = this.playlists.map(playlist => (
            this.renderPlaylist(playlist, bindings.get(playlist.id))
        )).join('');
        this.applySearchFilter();
    }

    private renderPlaylist(playlist: Playlist, binding?: FolderPlaylistBindingSummary): string {
        const modified = binding?.lastSyncAt
            ? new Date(binding.lastSyncAt).toLocaleString('zh-CN')
            : t('messages:notSynchronized');
        return `
            <article class="playlist-binding-item folder-binding-playlist" data-playlist-id="${this.escapeHtml(playlist.id)}"
                     data-playlist-name="${this.escapeHtml(playlist.name.toLocaleLowerCase())}">
                <div class="playlist-binding-info">
                    <strong class="playlist-binding-path">${this.escapeHtml(playlist.name)}</strong>
                    <div class="playlist-binding-meta">
                        ${binding ? `
                            <span>${htmlT('common:availableTracks', {count: binding.availableTrackCount})}</span>
                            <span>${htmlT('common:excludedTracks', {count: binding.excludedTrackCount})}</span>
                            <span>${htmlT('common:lastSync', {date: modified})}</span>
                        ` : `<span data-i18n="messages:thisFolderIsNotBound">${th('messages:thisFolderIsNotBound')}</span>`}
                    </div>
                </div>
                <div class="playlist-binding-actions">
                    ${binding ? `
                        <button class="btn btn-outline" data-folder-binding-action="restore"
                                data-binding-id="${this.escapeHtml(binding.id)}"
                                ${binding.excludedTrackCount === 0 || this.busy ? 'disabled' : ''} data-i18n="messages:restoreExcludedTracks">${th('messages:restoreExcludedTracks')}</button>
                        <button class="btn btn-outline" data-folder-binding-action="unbind-keep"
                                data-binding-id="${this.escapeHtml(binding.id)}" ${this.busy ? 'disabled' : ''} data-i18n="messages:unbindAndKeep">${th('messages:unbindAndKeep')}</button>
                        <button class="btn btn-danger" data-folder-binding-action="unbind-remove"
                                data-binding-id="${this.escapeHtml(binding.id)}" ${this.busy ? 'disabled' : ''} data-i18n="messages:unbindAndRemove">${th('messages:unbindAndRemove')}</button>
                    ` : `
                        <button class="btn btn-primary" data-folder-binding-action="bind"
                                ${this.busy ? 'disabled' : ''} data-i18n="messages:bind">${th('messages:bind')}</button>
                    `}
                </div>
            </article>
        `;
    }

    private async handleClick(event: Event): Promise<void> {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-folder-binding-action]')
            : null;
        if (!target || target.hasAttribute('disabled')) return;
        const action = target.dataset.folderBindingAction;
        if (action === 'close') {
            this.hide();
            return;
        }
        if (!this.source || this.busy) return;

        const item = target.closest<HTMLElement>('[data-playlist-id]');
        const playlistId = item?.dataset.playlistId;
        const bindingId = target.dataset.bindingId;
        let changed = false;
        this.busy = true;
        this.renderPlaylists();
        try {
            if (action === 'bind' && playlistId) {
                changed = await librarySourceManagementService.bindToPlaylist(this.source.id, playlistId);
            } else if (action === 'restore' && bindingId) {
                changed = await playlistBindingService.restoreExclusions(bindingId);
            } else if ((action === 'unbind-keep' || action === 'unbind-remove') && bindingId) {
                changed = await playlistBindingService.unbind(
                    {id: bindingId} as Pick<PlaylistSourceBinding, 'id'>,
                    action === 'unbind-keep' ? 'keep' : 'remove'
                );
            }
        } finally {
            this.busy = false;
        }

        if (changed) {
            const sourceId = this.source.id;
            await this.loadData();
            this.emit('bindingsChanged', sourceId);
        } else {
            this.renderPlaylists();
        }
    }

    private applySearchFilter(): void {
        const query = this.query?.value.trim().toLocaleLowerCase() || '';
        let visibleCount = 0;
        this.list?.querySelectorAll<HTMLElement>('.folder-binding-playlist').forEach(item => {
            const matches = !query || (item.dataset.playlistName || '').includes(query);
            item.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
        });
        const empty = this.overlay?.querySelector<HTMLElement>('.folder-binding-search-empty');
        if (empty) empty.hidden = visibleCount > 0 || this.playlists.length === 0;
    }

    private getDisplayName(sourcePath: string): string {
        return sourcePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || sourcePath;
    }

    private escapeHtml(value: unknown): string {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }
}
