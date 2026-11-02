import {settingsSystemGateway} from '@/infrastructure/electron';

export type FolderSelectionResult = {
    filePaths: string[];
    canceled: boolean;
};

export type MainSettingsPayload = {
    autoScanEnabled?: boolean;
    scanFrequency?: string;
    [key: string]: unknown;
};

export type SettingsUpdateResult = {
    success: boolean;
    settings?: MainSettingsPayload;
    error?: string;
};

export type PathResult = {
    success?: boolean;
    path?: string;
    error?: string;
};

export class SettingsShellService {
    async getAutoScanSettings(): Promise<MainSettingsPayload> {
        return await settingsSystemGateway.settings.getAutoScanSettings() as MainSettingsPayload;
    }

    async getSetting<T = unknown>(key: string): Promise<T | null> {
        return await settingsSystemGateway.settings.get<T>(key);
    }

    async setSetting<T = unknown>(key: string, value: T): Promise<boolean> {
        return await settingsSystemGateway.settings.set(key, value);
    }

    async selectFolder(): Promise<FolderSelectionResult> {
        return await settingsSystemGateway.selectFolder();
    }

    async updateAutoScanSettings(settings: MainSettingsPayload): Promise<SettingsUpdateResult> {
        return await settingsSystemGateway.settings.updateAutoScanSettings(settings) as SettingsUpdateResult;
    }

    async getDefaultCoverCachePath(): Promise<PathResult> {
        return await settingsSystemGateway.getDefaultCoverCachePath() as PathResult;
    }

    async ensureDirectoryExists(directoryPath: string): Promise<PathResult> {
        return await settingsSystemGateway.ensureDirectoryExists(directoryPath) as PathResult;
    }
}

export const settingsShellService = new SettingsShellService();
