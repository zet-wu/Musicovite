import {t} from '@/shared/i18n';

import {playbackService} from "@/features/playback/service/PlaybackService";
import type {AudioEngineType} from "@/features/playback/service/AudioEngineAdapter";
import type {MusicBoxSettings, WasapiShareMode} from "@api/types/settings";

interface ExclusiveModeSettingsView {
    available: boolean;
    enabled: boolean;
    shareMode: WasapiShareMode;
}

interface AudioEngineSettingResult {
    success: boolean;
    message?: string;
    error?: string;
}

class AudioEngineSettingsService {
    getExclusiveModeSettings(settings: MusicBoxSettings, platform = navigator.platform): ExclusiveModeSettingsView {
        return {
            available: platform.toLowerCase().includes('win'),
            enabled: typeof settings.exclusiveMode === 'boolean' ? settings.exclusiveMode : false,
            shareMode: this.getWasapiShareMode(settings)
        };
    }

    async switchExclusiveMode(enabled: boolean): Promise<AudioEngineSettingResult> {
        const engineType: AudioEngineType = enabled ? 'wasapi' : 'webaudio';

        try {
            const success = await playbackService.switchAudioEngine(engineType);
            if (!success) {
                return {
                    success: false,
                    error: t('messages:couldNotSwitchAudioEngineSeeTheConsoleForDetails')
                };
            }

            return {
                success: true,
                message: t('dynamic:audioEngineSwitched', {engine: enabled ? t('messages:wasapiEngine') : t('messages:webAudioEngine')})
            };
        } catch (error) {
            return {
                success: false,
                error: t('dynamic:audioEngineSwitchFailed', {details: error instanceof Error ? error.message : String(error)})
            };
        }
    }

    async switchWasapiShareMode(mode: WasapiShareMode): Promise<AudioEngineSettingResult> {
        try {
            const success = await playbackService.switchWasapiShareMode(mode);
            if (!success) {
                return {
                    success: false,
                    error: t('messages:couldNotSwitchWasapiMode')
                };
            }

            return {
                success: true,
                message: t('dynamic:audioModeSwitched', {mode: mode === 'exclusive' ? t('messages:exclusive') : t('messages:shared')})
            };
        } catch (error) {
            return {
                success: false,
                error: t('dynamic:audioModeSwitchFailed', {details: error instanceof Error ? error.message : String(error)})
            };
        }
    }

    getWasapiShareMode(settings: MusicBoxSettings): WasapiShareMode {
        return settings.wasapiShareMode === 'shared' ? 'shared' : 'exclusive';
    }
}

export const audioEngineSettingsService = new AudioEngineSettingsService();
