import {t, setLocalizedText} from '@/shared/i18n';

/**
 * 重命名歌单对话框组件
 */

import {Component} from "@ui/base/Component";
import {playlistDialogActionService} from "@/features/playlists/service/PlaylistDialogActionService";

interface PlaylistLike {
    id: string;
    name: string;
    description?: string;
}

interface RenamePlaylistResult {
    success: boolean;
    playlist?: PlaylistLike;
    error?: string;
}

class RenamePlaylistDialog extends Component {
    private isVisible: boolean;
    private currentPlaylist: PlaylistLike | null;
    private listenersSetup: boolean;
    private overlay!: HTMLElement;
    public dialog!: HTMLElement;
    private closeBtn!: HTMLElement;
    private cancelBtn!: HTMLElement;
    private confirmBtn!: HTMLButtonElement;
    private nameInput!: HTMLInputElement;
    private descriptionInput!: HTMLTextAreaElement;
    private errorElement!: HTMLElement;

    constructor() {
        super(null, false);
        this.isVisible = false;
        this.currentPlaylist = null;
        this.listenersSetup = false; // 事件监听器是否已设置
    }

    show(playlist: PlaylistLike): void {
        if (!this.listenersSetup) {
            this.setupElements();
            this.setupEventListeners();
            this.listenersSetup = true;
        }
        this.isVisible = true;
        this.currentPlaylist = playlist;
        this.overlay.style.display = 'flex';
        this.nameInput.value = playlist.name;
        this.descriptionInput.value = playlist.description || '';
        this.hideError();
        this.validateInput();

        // 聚焦到输入框并选中文本
        setTimeout(() => {
            this.nameInput.focus();
            this.nameInput.select();
        }, 100);
    }

    hide(): void {
        this.isVisible = false;
        this.overlay.style.display = 'none';
        this.currentPlaylist = null;
    }

    destroy(): void {
        this.currentPlaylist = null;
        this.listenersSetup = false;
        super.destroy();
    }

    setupElements(): void {
        this.overlay = document.getElementById('rename-playlist-dialog') as HTMLElement;
        this.dialog = this.overlay.querySelector('.modal-dialog') as HTMLElement;
        this.closeBtn = document.getElementById('rename-playlist-close') as HTMLElement;
        this.cancelBtn = document.getElementById('rename-playlist-cancel') as HTMLElement;
        this.confirmBtn = document.getElementById('rename-playlist-confirm') as HTMLButtonElement;
        this.nameInput = document.getElementById('rename-playlist-input') as HTMLInputElement;
        this.descriptionInput = document.getElementById('rename-playlist-description-input') as HTMLTextAreaElement;
        this.errorElement = document.getElementById('rename-playlist-error') as HTMLElement;
    }

    setupEventListeners(): void {
        this.addEventListenerManaged(this.closeBtn, 'click', () => this.hide());
        this.addEventListenerManaged(this.cancelBtn, 'click', () => this.hide());
        this.addEventListenerManaged(this.confirmBtn, 'click', () => this.renamePlaylist());
        this.addEventListenerManaged(this.nameInput, 'input', () => this.validateInput());
        this.addEventListenerManaged(this.descriptionInput, 'input', () => this.validateInput());
        this.addEventListenerManaged(this.nameInput, 'keydown', (event) => {
            const e = event as KeyboardEvent;
            if (e.key === 'Enter' && !this.confirmBtn.disabled) {
                this.renamePlaylist();
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
        const description = this.descriptionInput.value.trim();
        const hasChanges = name !== this.currentPlaylist?.name
            || description !== (this.currentPlaylist?.description || '');
        const isValid = name.length > 0
            && name.length <= 50
            && description.length <= 200
            && hasChanges;
        this.confirmBtn.disabled = !isValid;

        if (name.length === 0) {
            this.showError(t('messages:playlistNameIsRequired'));
        } else if (name.length > 50) {
            this.showError(t('messages:playlistNamesMustBeAtMost50Characters'));
        } else if (description.length > 200) {
            this.showError(t('messages:playlistDescriptionsMustBeAtMost200Characters'));
        } else if (!hasChanges) {
            this.showError(t('messages:playlistNameAndDescriptionAreUnchanged'));
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

    async renamePlaylist(): Promise<void> {
        if (!this.validateInput() || !this.currentPlaylist) {
            return;
        }

        const newName = this.nameInput.value.trim();
        const description = this.descriptionInput.value.trim();
        const nameChanged = newName !== this.currentPlaylist.name;

        try {
            this.confirmBtn.disabled = true;
            setLocalizedText(this.confirmBtn, 'messages:renaming', {}, 'textContent');
            const result = await playlistDialogActionService.renamePlaylist(
                this.currentPlaylist.id,
                newName,
                description
            ) as RenamePlaylistResult;

            if (result.success) {
                // 触发重命名成功事件
                this.emit('playlistRenamed', result.playlist);
                this.hide();

                const message = nameChanged ? t('dynamic:playlistRenamed', {name: newName}) : t('messages:playlistDescriptionUpdated');
                this.emit('notification', {type: 'info', message});
            } else {
                this.showError(t('messages:couldNotRename'));
                console.error(result);
            }
        } catch (error) {
            this.showError(t('messages:couldNotRenamePleaseTryAgain'));
            console.error(error);
        } finally {
            this.confirmBtn.disabled = false;
            setLocalizedText(this.confirmBtn, 'app:rename', {}, 'textContent');
        }
    }
}

export { RenamePlaylistDialog };
