import {t, setLocalizedText} from '@/shared/i18n';

/**
 * 创建歌单对话框组件
 */

import {Component} from "@ui/base/Component";
import {playlistDialogActionService} from "@/features/playlists/service/PlaylistDialogActionService";
import type {Playlist, Track} from "@api/types/library";

interface PlaylistResult {
    success: boolean;
    playlist?: Playlist;
    error?: string;
    bindingError?: string;
}

export interface CreatePlaylistDialogOptions {
    tracksToAdd?: Track | Track[] | null;
    initialName?: string;
    bindSource?: {
        id: string;
        name: string;
    };
}

class CreatePlaylistDialog extends Component {
    private isVisible: boolean;
    private currentTracksToAdd: Track[];
    private bindSource: CreatePlaylistDialogOptions['bindSource'] | null;
    private listenersSetup: boolean;
    private overlay!: HTMLElement;
    public dialog!: HTMLElement;
    private closeBtn!: HTMLElement;
    private cancelBtn!: HTMLElement;
    private confirmBtn!: HTMLButtonElement;
    private nameInput!: HTMLInputElement;
    private descriptionInput!: HTMLInputElement;
    private errorElement!: HTMLElement;

    constructor() {
        super(null, false);
        this.isVisible = false;
        this.currentTracksToAdd = []; // 用于记录要添加到新歌单的歌曲
        this.bindSource = null;
        this.listenersSetup = false; // 事件监听器是否已设置
    }

    show(options: CreatePlaylistDialogOptions = {}): void {
        if (!this.listenersSetup) {
            this.setupElements();
            this.setupEventListeners();
            this.listenersSetup = true;
        }
        this.isVisible = true;
        const tracksToAdd = options.tracksToAdd;
        this.currentTracksToAdd = tracksToAdd
            ? (Array.isArray(tracksToAdd) ? [...tracksToAdd] : [tracksToAdd])
            : [];
        this.bindSource = options.bindSource ? {...options.bindSource} : null;
        this.overlay.style.display = 'flex';

        // 重置表单
        this.nameInput.value = options.initialName || '';
        this.descriptionInput.value = '';
        this.hideError();
        this.validateInput();

        // 聚焦到输入框
        setTimeout(() => {
            this.nameInput.focus();
            if (options.initialName) this.nameInput.select();
        }, 100);
    }

    hide(): void {
        this.isVisible = false;
        this.overlay.style.display = 'none';
        this.currentTracksToAdd = [];
        this.bindSource = null;
    }

    destroy(): void {
        this.listenersSetup = false;
        super.destroy();
    }

    setupElements(): void {
        this.overlay = document.getElementById('create-playlist-dialog') as HTMLElement;
        this.dialog = this.overlay.querySelector('.modal-dialog') as HTMLElement;
        this.closeBtn = document.getElementById('create-playlist-close') as HTMLElement;
        this.cancelBtn = document.getElementById('create-playlist-cancel') as HTMLElement;
        this.confirmBtn = document.getElementById('create-playlist-confirm') as HTMLButtonElement;
        this.nameInput = document.getElementById('playlist-name-input') as HTMLInputElement;
        this.descriptionInput = document.getElementById('playlist-description-input') as HTMLInputElement;
        this.errorElement = document.getElementById('playlist-name-error') as HTMLElement;
    }

    setupEventListeners(): void {
        this.addEventListenerManaged(this.closeBtn, 'click', () => this.hide());
        this.addEventListenerManaged(this.cancelBtn, 'click', () => this.hide());
        this.addEventListenerManaged(this.confirmBtn, 'click', () => this.createPlaylist());

        // 输入框事件
        this.addEventListenerManaged(this.nameInput, 'input', () => this.validateInput());
        this.addEventListenerManaged(this.nameInput, 'keydown', (event) => {
            const e = event as KeyboardEvent;
            if (e.key === 'Enter' && !this.confirmBtn.disabled) {
                this.createPlaylist();
            }
        });

        // 点击遮罩层关闭
        this.addEventListenerManaged(this.overlay, 'click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        this.addEventListenerManaged(document, 'keydown', (event) => {
            const e = event as KeyboardEvent;
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    validateInput(): boolean {
        const name = this.nameInput.value.trim();
        const isValid = name.length > 0 && name.length <= 50;
        this.confirmBtn.disabled = !isValid;

        if (name.length > 50) {
            this.showError(t('messages:playlistNamesMustBeAtMost50Characters'));
        } else {
            this.hideError();
        }
        return isValid;
    }

    showError(message: string): void {
        this.errorElement.textContent = message;
        this.errorElement.style.display = 'block';
    }

    hideError(): void {
        this.errorElement.style.display = 'none';
    }

    async createPlaylist(): Promise<void> {
        if (!this.validateInput()) {
            return;
        }

        const name = this.nameInput.value.trim();
        const description = this.descriptionInput.value.trim();
        const bindSource = this.bindSource;

        try {
            // 显示加载状态
            this.confirmBtn.disabled = true;
            setLocalizedText(this.confirmBtn, 'messages:creating', {}, 'textContent');
            const result = await playlistDialogActionService.createPlaylist(
                name,
                description,
                this.currentTracksToAdd,
                bindSource?.id
            ) as PlaylistResult;
            if (result.success && result.playlist) {
                // 触发歌单创建事件
                this.emit('playlistCreated', result.playlist);
                this.hide();
                const message = bindSource
                    ? t('dynamic:playlistCreatedBound', {name: name})
                    : t('dynamic:playlistCreated', {name: name});
                this.emit('notification', {type: 'success', message});
            } else if (result.playlist && result.bindingError) {
                // 歌单已经创建，绑定失败时保留歌单并刷新导航。
                this.emit('playlistCreated', result.playlist);
                this.hide();
                this.emit('notification', {
                    type: 'error',
                    message: t('dynamic:playlistCreatedBindingFailed', {name: name, details: result.bindingError})
                });
            } else {
                this.showError(result.error || t('messages:couldNotCreatePlaylist'));
            }
        } catch (error) {
            console.error('❌ 创建歌单失败:', error);
            this.showError(t('messages:couldNotCreatePlaylistPleaseTryAgain'));
        } finally {
            this.confirmBtn.disabled = false;
            setLocalizedText(this.confirmBtn, 'app:create', {}, 'textContent');
        }
    }
}

export { CreatePlaylistDialog };
