import {t, setLocalizedText} from '@/shared/i18n';

import {showToast} from '@utils/index.js';
import {libraryDataService} from "@/features/library/service/LibraryDataService";

export interface FileImportHost {
    addManagedEventListener(
        element: EventTarget,
        event: string,
        handler: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ): void;
    showScanProgress(): void;
    hideScanProgress(): void;
    showSuccess(message: string): void;
    showError(message: string): void;
    showInfo(message: string): void;
}

interface FileImportIntegrations {
    openDirectories(): Promise<string[]>;
    openFiles(): Promise<string[]>;
    loadTrack(filePath: string): Promise<boolean>;
    play(): Promise<boolean>;
}

interface FileImportControllerOptions {
    app: FileImportHost;
    integrations: FileImportIntegrations;
}

interface LocalAudioFile extends File {
    path: string;
}

export class FileImportController {
    private readonly app: FileImportHost;
    private readonly integrations: FileImportIntegrations;

    constructor({app, integrations}: FileImportControllerOptions) {
        this.app = app;
        this.integrations = integrations;
    }

    async scanMusicFolder(): Promise<void> {
        try {
            await this.selectAndScanDirectories();
        } catch (error) {
            showToast(t('messages:musicFolderScanFailed'), 'error');
        }
    }

    async addMusicFiles(): Promise<void> {
        try {
            const filePaths = await this.integrations.openFiles();
            if (filePaths.length > 0) {
                let successCount = 0;
                for (const filePath of filePaths) {
                    const metadata = await libraryDataService.getTrackMetadata(filePath);
                    if (metadata) {
                        const result = await libraryDataService.addTrackToLibrary(metadata);
                        if (result && result.success) {
                            successCount++;
                            console.log('🎉 [App] 文件添加成功:', metadata.title);
                        }
                    }
                }

                if (successCount > 0) {
                    showToast(t('dynamic:musicAdded', {count: successCount}), 'success');
                } else {
                    showToast(t('messages:couldNotAddMusic'), 'error');
                }
            }
        } catch (error) {
            showToast(t('messages:couldNotAddMusic'), 'error');
        }
    }

    setupFileLoading(): void {
        this.app.addManagedEventListener(document, 'dragover', (event) => {
            const e = event as DragEvent;
            if (!Array.from(e.dataTransfer?.types || []).includes('Files')) {
                return;
            }
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        this.app.addManagedEventListener(document, 'drop', async (event) => {
            const e = event as DragEvent;
            if (!Array.from(e.dataTransfer?.types || []).includes('Files')) {
                return;
            }
            e.preventDefault();
            await this.handleFileDrop(e);
        });

        this.addFileMenuItems();
    }

    async handleFileDrop(e: DragEvent): Promise<void> {
        const files = Array.from(e.dataTransfer?.files || []) as LocalAudioFile[];
        const audioFiles = files.filter(file =>
            file.type.startsWith('audio/') ||
            /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(file.name)
        );

        if (audioFiles.length > 0) {
            if (audioFiles.length === 1) {
                const filePath = audioFiles[0].path;
                if (filePath) {
                    await this.loadAndPlayFile(filePath);
                }
            } else {
                await this.addFilesToPlaylist(audioFiles);
            }
        }
    }

    async openDirectoryDialog(): Promise<void> {
        try {
            await this.selectAndScanDirectories();
        } catch (error) {
            this.app.showError(t('messages:couldNotOpenFolderPicker'));
        }
    }

    async loadAndPlayFile(filePath: string): Promise<void> {
        try {
            const success = await this.integrations.loadTrack(filePath);
            if (success) {
                await this.integrations.play();
                this.app.showSuccess(`正常播放: ${filePath.split(/[/\\]/).pop()}`);
            } else {
                this.app.showError(t('dynamic:fileLoadFailed', {path: filePath}));
            }
        } catch (error) {
            this.app.showError(t('messages:couldNotLoadMusicFiles'));
        }
    }

    async addFilesToPlaylist(files: Array<LocalAudioFile | string>): Promise<void> {
        try {
            if (files.length > 0) {
                const firstFile = files[0];
                const filePath = typeof firstFile === 'string' ? firstFile : firstFile.path;
                if (filePath) {
                    await this.loadAndPlayFile(filePath);
                }
            }
            this.app.showSuccess(`Added ${files.length} files to playlist`);
        } catch (error) {
            console.error('Failed to add files to playlist:', error);
            this.app.showError('Failed to add files to playlist');
        }
    }

    async scanDirectory(directoryPath: string): Promise<void> {
        try {
            this.app.showInfo(t('messages:scanningMusicFiles'));
            const success = await libraryDataService.scanDirectory(directoryPath);
            if (success) {
                this.app.showSuccess(t('messages:musicFolderScanComplete'));
            } else {
                this.app.showError(t('messages:scanFailed'));
            }
        } catch (error) {
            console.error('扫描失败：', error);
            this.app.showError(t('messages:scanFailed'));
        }
    }

    private async selectAndScanDirectories(): Promise<void> {
        const directories = await this.integrations.openDirectories();
        if (directories.length === 0) return;

        this.app.showScanProgress();
        try {
            let successCount = 0;
            for (const directory of directories) {
                if (await libraryDataService.scanDirectory(directory)) {
                    successCount++;
                }
            }

            if (successCount === directories.length) {
                this.app.showSuccess(t('dynamic:musicFoldersAdded', {count: successCount}));
            } else if (successCount > 0) {
                this.app.showError(t('dynamic:foldersScannedWithFailures', {scanned: successCount, failed: directories.length - successCount}));
            } else {
                this.app.showError(t('messages:musicFolderScanFailedMessage'));
            }
        } finally {
            this.app.hideScanProgress();
        }
    }

    addFileMenuItems(): void {
        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
        if (searchInput) {
            setLocalizedText(searchInput, 'messages:searchCtrloAddMusicCtrlshiftoAddFolder', {}, 'placeholder');
        }
    }
}
