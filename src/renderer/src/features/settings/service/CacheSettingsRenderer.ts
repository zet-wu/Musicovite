import {t} from '@/shared/i18n';
export interface CacheSettingsElements {
    viewCacheStatsButton: HTMLButtonElement | null;
    validateCacheButton: HTMLButtonElement | null;
    clearCacheButton: HTMLButtonElement | null;
    clearCoverCacheButton: HTMLButtonElement | null;
    cacheStatsDescription: HTMLElement | null;
}

class CacheSettingsRenderer {
    setStatisticsLoading(elements: CacheSettingsElements, loading: boolean): void {
        this.setButtonState(elements.viewCacheStatsButton, loading, t('messages:retrieving'), t('app:viewStatistics'));
    }

    setValidationLoading(elements: CacheSettingsElements, loading: boolean): void {
        this.setButtonState(elements.validateCacheButton, loading, t('messages:validating'), t('app:validateCache'));
    }

    setClearLoading(elements: CacheSettingsElements, loading: boolean): void {
        this.setButtonState(elements.clearCacheButton, loading, t('messages:rebuilding'), t('app:rebuildIndex'));
    }

    setCoverClearLoading(elements: CacheSettingsElements, loading: boolean): void {
        this.setButtonState(elements.clearCoverCacheButton, loading, t('messages:clearing'), t('app:clearArtworkCache'));
    }

    updateDescription(elements: CacheSettingsElements, description: string): void {
        if (elements.cacheStatsDescription) {
            elements.cacheStatsDescription.textContent = description;
        }
    }

    private setButtonState(
        button: HTMLButtonElement | null,
        disabled: boolean,
        loadingText: string,
        idleText: string
    ): void {
        if (!button) {
            return;
        }

        button.disabled = disabled;
        button.textContent = disabled ? loadingText : idleText;
    }
}

export const cacheSettingsRenderer = new CacheSettingsRenderer();
