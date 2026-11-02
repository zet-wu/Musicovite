import {t, bindLocalizedText, escapeTranslation, setLocalizedText, th} from '@/shared/i18n';
import type {ScanProgress} from '@api/types/events';
import type {ContentMountManager} from '@/app/runtime/components/ContentMountManager';

interface AppShellViewOptions {
    contentMounts: ContentMountManager;
    onScanMusicFolder(): Promise<void>;
    onAddMusicFiles(): Promise<void>;
    onShowHomePage(): Promise<void>;
}

export class AppShellView {
    private readonly contentMounts: ContentMountManager;
    private readonly onScanMusicFolder: () => Promise<void>;
    private readonly onAddMusicFiles: () => Promise<void>;
    private readonly onShowHomePage: () => Promise<void>;

    constructor({contentMounts, onScanMusicFolder, onAddMusicFiles, onShowHomePage}: AppShellViewOptions) {
        this.contentMounts = contentMounts;
        this.onScanMusicFolder = onScanMusicFolder;
        this.onAddMusicFiles = onAddMusicFiles;
        this.onShowHomePage = onShowHomePage;
    }

    showCacheLoadingStatus(): void {
        const statusElement = document.getElementById('cache-loading-status');
        if (statusElement) {
            statusElement.style.display = 'block';
            setLocalizedText(statusElement, 'app:loadingLibraryFromCache', {}, 'textContent');
        }
    }

    hideCacheLoadingStatus(): void {
        const statusElement = document.getElementById('cache-loading-status');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    showApp(): void {
        const loading = document.getElementById('loading');
        const app = document.getElementById('app');

        if (loading) {
            loading.style.opacity = '0';
            setTimeout(() => {
                loading.style.display = 'none';
            }, 300);
        }

        if (app) {
            app.style.display = 'grid';
            setTimeout(async () => {
                app.style.opacity = '1';
                await this.onShowHomePage();
            }, 100);
        }
    }

    showWelcomeScreen(): void {
        const shellMount = this.contentMounts.showShell(`
            <div class="welcome-screen">
                <div class="welcome-content">
                    <h1 data-i18n="audit:welcome">${th('audit:welcome')}</h1>
                    <p data-i18n="audit:welcomeMusic">${th('audit:welcomeMusic')}</p>
                    <div class="welcome-actions">
                        <button class="primary-button" id="scan-folder-btn">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                            </svg>
                            <span data-i18n="messages:addMusicFolder">${th('messages:addMusicFolder')}</span>
                        </button>
                        <button class="secondary-button" id="add-files-btn">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                            </svg>
                            <span data-i18n="messages:addMusicFiles">${th('messages:addMusicFiles')}</span>
                        </button>
                    </div>
                </div>
            </div>
        `);

        shellMount.querySelector('#scan-folder-btn')?.addEventListener('click', async () => {
            await this.onScanMusicFolder();
        });
        shellMount.querySelector('#add-files-btn')?.addEventListener('click', async () => {
            await this.onAddMusicFiles();
        });
    }

    showScanProgress(): void {
        this.contentMounts.showShell(`
            <div class="scan-progress">
                <div class="scan-content">
                    <h2 data-i18n="audit:scanLibrary">${th('audit:scanLibrary')}</h2>
                    <div class="progress-bar">
                        <div class="progress-fill" id="scan-progress-fill"></div>
                    </div>
                    <p id="scan-status" data-i18n="app:loading">${th('app:loading')}</p>
                </div>
            </div>
        `, true);
    }

    hideScanProgress(): void {
        this.contentMounts.hideShell();
    }

    updateScanProgress(progress: ScanProgress): void {
        const progressFill = document.getElementById('scan-progress-fill');
        const statusText = document.getElementById('scan-status');

        if (progressFill && statusText) {
            const total = progress.totalFiles ?? progress.total ?? 0;
            const current = progress.processedFiles ?? progress.current ?? 0;
            const percent = total > 0 ? (current / total) * 100 : 0;

            progressFill.style.width = `${percent}%`;
            bindLocalizedText(statusText, () => progress.isComplete ? t('messages:scanComplete') : progress.currentFile ? t('audit:processingFile', {file: progress.currentFile}) : t('audit:processingCount', {current, total}));
        }
    }

    showFatalError(message: string): void {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <div class="error-message">
                    <h2 data-i18n="audit:error">${th('audit:error')}</h2>
                    <p>${escapeTranslation(message)}</p>
                    <button onclick="location.reload()" data-i18n="messages:retry">${th('messages:retry')}</button>
                </div>
            `;
        }
    }
}
