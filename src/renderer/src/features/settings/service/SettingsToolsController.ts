import {t} from '@/shared/i18n';

import {showToast} from "@utils/index.js";
import type {MusicBoxSettings} from "@api/types/settings";
import {cacheSettingsRenderer} from "./CacheSettingsRenderer";
import {cacheSettingsService} from "./CacheSettingsService";
import {embeddedLyricsDiagnosticsDialogRenderer} from "./EmbeddedLyricsDiagnosticsDialogRenderer";
import {embeddedLyricsDiagnosticsRenderer} from "./EmbeddedLyricsDiagnosticsRenderer";
import {embeddedLyricsDiagnosticsService} from "./EmbeddedLyricsDiagnosticsService";
import {lyricsAppearanceSettingsRenderer} from "./LyricsAppearanceSettingsRenderer";
import {lyricsAppearanceSettingsService} from "./LyricsAppearanceSettingsService";
import {mediaDirectorySettingsRenderer} from "./MediaDirectorySettingsRenderer";
import {mediaDirectorySettingsService} from "./MediaDirectorySettingsService";
import {appConfirmationService} from "@/features/appShell/service";
import type {SettingValue} from "./SettingsStore";
import type {SettingsListenerScope} from "./SettingsListenerScope";
import {desktopLyricsService} from '@/features/desktopLyrics/service/DesktopLyricsService';
import {settingsStore} from './SettingsStore';

export interface SettingsToolsElements {
    selectLyricsFolderButton: HTMLElement | null;
    lyricsFolderPath: HTMLElement | null;
    selectCoverCacheFolderButton: HTMLElement | null;
    coverCacheFolderPath: HTMLElement | null;
    viewCacheStatsButton: HTMLButtonElement | null;
    validateCacheButton: HTMLButtonElement | null;
    clearCacheButton: HTMLButtonElement | null;
    clearCoverCacheButton: HTMLButtonElement | null;
    cacheStatsDescription: HTMLElement | null;
    testEmbeddedLyricsButton: HTMLButtonElement | null;
    lyricsColorModeSelect: HTMLSelectElement | null;
    lyricsColorInput: HTMLInputElement | null;
    lyricsColorValue: HTMLElement | null;
    lyricsFontFamilySelect: HTMLSelectElement | null;
    lyricsCustomFontContainer: HTMLElement | null;
    lyricsCustomLatinFontInput: HTMLInputElement | null;
    lyricsCustomCjkFontInput: HTMLInputElement | null;
    lyricsFontSizeSelect: HTMLSelectElement | null;
    lyricsShowTranslationToggle: HTMLInputElement | null;
    lyricsShowRomanizationToggle: HTMLInputElement | null;
    lyricsShowRubyToggle: HTMLInputElement | null;
}

interface SettingsToolsCallbacks {
    updateSetting: (key: string, value: SettingValue) => void;
    emit: (eventName: string, ...args: unknown[]) => void;
}

class SettingsToolsController {
    initialize(elements: SettingsToolsElements, callbacks: SettingsToolsCallbacks, scope: SettingsListenerScope): void {
        this.bindDirectoryEvents(elements, callbacks, scope);
        this.bindCacheEvents(elements, scope);
        this.bindEmbeddedLyricsDiagnostics(elements, scope);
        this.bindLyricsAppearanceEvents(elements, callbacks, scope);
    }

    initializeLyricsAppearance(settings: MusicBoxSettings, elements: SettingsToolsElements, _callbacks: SettingsToolsCallbacks): void {
        const lyricsAppearanceSettings = lyricsAppearanceSettingsService.getSettings(settings);
        lyricsAppearanceSettingsRenderer.initialize(this.toLyricsAppearanceElements(elements), lyricsAppearanceSettings);
        lyricsAppearanceSettingsService.applyTextColor(lyricsAppearanceSettings);
        lyricsAppearanceSettingsService.applyTypography(lyricsAppearanceSettings);
    }

    initializeLyricsDirectory(settings: MusicBoxSettings, elements: SettingsToolsElements): void {
        const lyricsDirectory = typeof settings.lyricsDirectory === 'string' ? settings.lyricsDirectory : '';
        mediaDirectorySettingsRenderer.updateDirectory(this.toMediaDirectoryElements(elements), 'lyrics', lyricsDirectory || null);

    }

    async initializeCoverCacheDirectory(settings: MusicBoxSettings, elements: SettingsToolsElements, callbacks: SettingsToolsCallbacks): Promise<void> {
        try {
            let coverCacheDirectory = typeof settings.coverCacheDirectory === 'string' ? settings.coverCacheDirectory : null;
            const resolved = await mediaDirectorySettingsService.resolveCoverCacheDirectory(coverCacheDirectory);
            coverCacheDirectory = resolved.directory;

            if (resolved.shouldPersist && coverCacheDirectory) {
                callbacks.updateSetting('coverCacheDirectory', coverCacheDirectory);
                console.log(`✅ Settings: 使用默认封面缓存目录: ${coverCacheDirectory}`);
            }

            if (resolved.error) {
                console.error('❌ Settings:', resolved.error);
            }

            this.applyCoverDirectory(elements, coverCacheDirectory);
        } catch (error) {
            console.error('❌ Settings: 初始化封面缓存目录失败:', error);
            this.applyCoverDirectory(elements, null);
        }
    }

    private bindDirectoryEvents(elements: SettingsToolsElements, callbacks: SettingsToolsCallbacks, scope: SettingsListenerScope): void {
        scope.listen(elements.selectLyricsFolderButton, 'click', async () => {
            await this.selectLyricsDirectory(elements, callbacks);
        });

        scope.listen(elements.selectCoverCacheFolderButton, 'click', async () => {
            await this.selectCoverCacheDirectory(elements, callbacks);
        });
    }

    private async selectLyricsDirectory(elements: SettingsToolsElements, callbacks: SettingsToolsCallbacks): Promise<void> {
        try {
            const selectedPath = await mediaDirectorySettingsService.selectDirectory();
            if (!selectedPath) {
                return;
            }

            callbacks.updateSetting('lyricsDirectory', selectedPath);
            mediaDirectorySettingsRenderer.updateDirectory(this.toMediaDirectoryElements(elements), 'lyrics', selectedPath);
        } catch (error) {
            console.error('❌ Settings: 选择歌词目录失败:', error);
        }
    }

    private async selectCoverCacheDirectory(elements: SettingsToolsElements, callbacks: SettingsToolsCallbacks): Promise<void> {
        try {
            const selectedPath = await mediaDirectorySettingsService.selectDirectory();
            if (!selectedPath) {
                return;
            }

            const resolved = await mediaDirectorySettingsService.resolveCoverCacheDirectory(selectedPath);
            if (!resolved.directory) {
                showToast(resolved.error || t('messages:couldNotCreateArtworkCacheFolder'), 'error');
                return;
            }
            callbacks.updateSetting('coverCacheDirectory', selectedPath);
            this.applyCoverDirectory(elements, resolved.directory);
        } catch (error) {
            console.error('❌ Settings: 选择封面缓存目录失败:', error);
        }
    }

    private applyCoverDirectory(elements: SettingsToolsElements, directory: string | null): void {
        mediaDirectorySettingsRenderer.updateDirectory(this.toMediaDirectoryElements(elements), 'coverCache', directory);

        if (directory) {
            mediaDirectorySettingsService.applyCoverDirectory(directory);
        }
    }

    private bindCacheEvents(elements: SettingsToolsElements, scope: SettingsListenerScope): void {
        scope.listen(elements.viewCacheStatsButton, 'click', async () => {
            await this.showCacheStatistics(elements);
        });

        scope.listen(elements.validateCacheButton, 'click', async () => {
            await this.validateCache(elements);
        });

        scope.listen(elements.clearCacheButton, 'click', async () => {
            await this.rebuildLibraryIndex(elements);
        });

        scope.listen(elements.clearCoverCacheButton, 'click', async () => {
            await this.clearCoverCache(elements);
        });
    }

    async showCacheStatistics(elements: SettingsToolsElements): Promise<void> {
        try {
            cacheSettingsRenderer.setStatisticsLoading(this.toCacheSettingsElements(elements), true);
            const display = await cacheSettingsService.getStatisticsDisplay();
            if (display.success) {
                cacheSettingsRenderer.updateDescription(this.toCacheSettingsElements(elements), display.description || '');
                showToast(display.toastMessage || t('messages:cacheStatisticsUpdated'), 'info');
            } else {
                showToast(display.error || t('messages:couldNotGetCacheStatistics'), 'error');
            }
        } catch (error) {
            console.error('❌ 获取缓存统计失败:', error);
            showToast(t('messages:couldNotGetCacheStatistics'), 'error');
        } finally {
            cacheSettingsRenderer.setStatisticsLoading(this.toCacheSettingsElements(elements), false);
        }
    }

    private async validateCache(elements: SettingsToolsElements): Promise<void> {
        try {
            cacheSettingsRenderer.setValidationLoading(this.toCacheSettingsElements(elements), true);
            showToast(t('messages:validatingCachePleaseWait'), 'info');

            const result = await cacheSettingsService.validateCache();
            showToast(result.message, result.success ? 'success' : 'error');
        } catch (error) {
            console.error('缓存验证失败:', error);
            showToast(t('messages:cacheValidationFailed'), 'error');
        } finally {
            cacheSettingsRenderer.setValidationLoading(this.toCacheSettingsElements(elements), false);
        }
    }

    private async rebuildLibraryIndex(elements: SettingsToolsElements): Promise<void> {
        const confirmed = await appConfirmationService.confirm({
            title: t('app:rebuildLibraryIndex'),
            message: t('messages:rebuildTheLibraryIndexTheTrackIndexWillBeCleared'),
            type: 'warning',
            confirmText: t('app:rebuildIndex')
        });

        if (!confirmed) {
            return;
        }

        try {
            cacheSettingsRenderer.setClearLoading(this.toCacheSettingsElements(elements), true);
            const result = await cacheSettingsService.rebuildLibraryIndex();
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                cacheSettingsRenderer.updateDescription(this.toCacheSettingsElements(elements), result.description || '');
            }
        } catch (error) {
            console.error('重建音乐库索引失败:', error);
            showToast(t('messages:couldNotRebuildLibraryIndex'), 'error');
        } finally {
            cacheSettingsRenderer.setClearLoading(this.toCacheSettingsElements(elements), false);
        }
    }

    private async clearCoverCache(elements: SettingsToolsElements): Promise<void> {
        const confirmed = await appConfirmationService.confirm({
            title: t('app:clearArtworkCache'),
            message: t('messages:clearArtworkCachesThisClearsMemoryAndManagedDiskCaches'),
            type: 'warning',
            confirmText: t('app:clearArtworkCache')
        });
        if (!confirmed) return;

        try {
            cacheSettingsRenderer.setCoverClearLoading(this.toCacheSettingsElements(elements), true);
            const result = await cacheSettingsService.clearCoverCache();
            showToast(result.message, result.success ? 'success' : 'error');
            if (result.success && result.description) {
                cacheSettingsRenderer.updateDescription(this.toCacheSettingsElements(elements), result.description);
            }
        } catch (error) {
            console.error('清除封面缓存失败:', error);
            showToast(t('messages:couldNotClearArtworkCache'), 'error');
        } finally {
            cacheSettingsRenderer.setCoverClearLoading(this.toCacheSettingsElements(elements), false);
        }
    }

    private bindEmbeddedLyricsDiagnostics(elements: SettingsToolsElements, scope: SettingsListenerScope): void {
        scope.listen(elements.testEmbeddedLyricsButton, 'click', async () => {
            await this.testEmbeddedLyrics(elements);
        });
    }

    private async testEmbeddedLyrics(elements: SettingsToolsElements): Promise<void> {
        try {
            embeddedLyricsDiagnosticsRenderer.setState(this.toEmbeddedLyricsDiagnosticsElements(elements), 'selecting');
            const diagnostics = await embeddedLyricsDiagnosticsService.chooseFileAndBuildReport();
            if (!diagnostics.selected) {
                showToast(t('messages:noFileSelected'), 'info');
                return;
            }

            embeddedLyricsDiagnosticsRenderer.setState(this.toEmbeddedLyricsDiagnosticsElements(elements), 'checking');
            console.log(`🎵 测试内嵌歌词: ${diagnostics.filePath}`);
            showToast(diagnostics.foundLyrics ? t('messages:embeddedLyricsFound') : t('messages:noEmbeddedLyricsFound'), diagnostics.foundLyrics ? 'success' : 'info');

            const report = diagnostics.report || diagnostics.error || t('messages:noDiagnosticReport');
            console.log('🔧 内嵌歌词测试报告:\n', report);
            embeddedLyricsDiagnosticsDialogRenderer.show(report);
        } catch (error) {
            console.error('❌ 内嵌歌词测试失败:', error);
            showToast(t('messages:embeddedLyricsTestFailed'), 'error');
        } finally {
            embeddedLyricsDiagnosticsRenderer.setState(this.toEmbeddedLyricsDiagnosticsElements(elements), 'idle');
        }
    }

    private bindLyricsAppearanceEvents(elements: SettingsToolsElements, callbacks: SettingsToolsCallbacks, scope: SettingsListenerScope): void {
        scope.listen(elements.lyricsColorModeSelect, 'change', () => {
            const mode = elements.lyricsColorModeSelect?.value === 'custom' ? 'custom' : 'auto';
            const textColor = elements.lyricsColorInput?.value || '#335eea';
            callbacks.updateSetting('lyricsColorMode', mode);
            lyricsAppearanceSettingsRenderer.updateAvailability(this.toLyricsAppearanceElements(elements), mode);
            lyricsAppearanceSettingsService.applyTextColor({colorMode: mode, textColor});
        });

        scope.listen(elements.lyricsColorInput, 'input', () => {
            const color = elements.lyricsColorInput?.value || '#335eea';
            lyricsAppearanceSettingsRenderer.updateTextColor(this.toLyricsAppearanceElements(elements), color);
            callbacks.updateSetting('lyricsColor', color);
            this.applyCustomLyricsColor(elements);
        });

        scope.listen(elements.lyricsFontFamilySelect, 'change', () => {
            callbacks.updateSetting('lyricsFontFamily', elements.lyricsFontFamilySelect?.value || 'inherit');
            lyricsAppearanceSettingsRenderer.updateFontAvailability(
                this.toLyricsAppearanceElements(elements),
                elements.lyricsFontFamilySelect?.value || 'inherit'
            );
            this.applyLyricsTypography(elements);
        });

        scope.listen(elements.lyricsCustomLatinFontInput, 'input', () => {
            callbacks.updateSetting('lyricsCustomLatinFont', elements.lyricsCustomLatinFontInput?.value.trim() || '');
            this.applyLyricsTypography(elements);
        });

        scope.listen(elements.lyricsCustomCjkFontInput, 'input', () => {
            callbacks.updateSetting('lyricsCustomCjkFont', elements.lyricsCustomCjkFontInput?.value.trim() || '');
            this.applyLyricsTypography(elements);
        });

        scope.listen(elements.lyricsFontSizeSelect, 'change', () => {
            const value = elements.lyricsFontSizeSelect?.value ?? 'auto';
            callbacks.updateSetting('lyricsFontSize', value === 'auto' ? null : Number(value));
            this.applyLyricsTypography(elements);
        });

        this.bindLyricsDisplayToggle(elements.lyricsShowTranslationToggle, 'lyricsShowTranslation', callbacks, scope);
        this.bindLyricsDisplayToggle(elements.lyricsShowRomanizationToggle, 'lyricsShowRomanization', callbacks, scope);
        this.bindLyricsDisplayToggle(elements.lyricsShowRubyToggle, 'lyricsShowRuby', callbacks, scope);
    }

    private applyCustomLyricsColor(elements: SettingsToolsElements): void {
        lyricsAppearanceSettingsService.applyTextColor({
            colorMode: 'custom',
            textColor: elements.lyricsColorInput?.value || '#335eea'
        });
    }

    private applyLyricsTypography(elements: SettingsToolsElements): void {
        const value = elements.lyricsFontSizeSelect?.value ?? 'auto';
        const settings = lyricsAppearanceSettingsService.getSettings({
            lyricsFontFamily: elements.lyricsFontFamilySelect?.value || 'inherit',
            lyricsCustomLatinFont: elements.lyricsCustomLatinFontInput?.value || '',
            lyricsCustomCjkFont: elements.lyricsCustomCjkFontInput?.value || '',
            lyricsFontSize: value === 'auto' ? null : Number(value)
        });
        lyricsAppearanceSettingsService.applyTypography(settings);
        lyricsAppearanceSettingsService.notifyDisplaySettingsChanged();
        void desktopLyricsService.updateSettings(settingsStore.load());
    }

    private bindLyricsDisplayToggle(
        element: HTMLInputElement | null,
        key: string,
        callbacks: SettingsToolsCallbacks,
        scope: SettingsListenerScope
    ): void {
        scope.listen(element, 'change', () => {
            callbacks.updateSetting(key, Boolean(element?.checked));
            lyricsAppearanceSettingsService.notifyDisplaySettingsChanged();
        });
    }

    private toMediaDirectoryElements(elements: SettingsToolsElements) {
        return {
            lyricsFolderPath: elements.lyricsFolderPath,
            coverCacheFolderPath: elements.coverCacheFolderPath
        };
    }

    private toCacheSettingsElements(elements: SettingsToolsElements) {
        return {
            viewCacheStatsButton: elements.viewCacheStatsButton,
            validateCacheButton: elements.validateCacheButton,
            clearCacheButton: elements.clearCacheButton,
            clearCoverCacheButton: elements.clearCoverCacheButton,
            cacheStatsDescription: elements.cacheStatsDescription
        };
    }

    private toEmbeddedLyricsDiagnosticsElements(elements: SettingsToolsElements) {
        return {
            testButton: elements.testEmbeddedLyricsButton
        };
    }

    private toLyricsAppearanceElements(elements: SettingsToolsElements) {
        return {
            colorModeSelect: elements.lyricsColorModeSelect,
            textColorInput: elements.lyricsColorInput,
            textColorValue: elements.lyricsColorValue,
            fontFamilySelect: elements.lyricsFontFamilySelect,
            customFontContainer: elements.lyricsCustomFontContainer,
            customLatinFontInput: elements.lyricsCustomLatinFontInput,
            customCjkFontInput: elements.lyricsCustomCjkFontInput,
            fontSizeSelect: elements.lyricsFontSizeSelect,
            showTranslationToggle: elements.lyricsShowTranslationToggle,
            showRomanizationToggle: elements.lyricsShowRomanizationToggle,
            showRubyToggle: elements.lyricsShowRubyToggle
        };
    }
}

export const settingsToolsController = new SettingsToolsController();
