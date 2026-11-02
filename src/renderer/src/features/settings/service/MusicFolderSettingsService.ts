import {settingsShellService} from "@/features/appShell/service/SettingsShellService";
import {libraryDataService} from "@/features/library/service/LibraryDataService";

export interface AutoScanSettingsView {
    enabled: boolean;
    frequency: string;
}

interface MainSettingsPayload {
    autoScanEnabled?: boolean;
    scanFrequency?: string;
    [key: string]: unknown;
}

interface SettingsUpdateResult {
    success: boolean;
    settings?: MainSettingsPayload;
    error?: string;
}

export interface MusicFoldersUpdateResult {
    success: boolean;
    folders: string[];
    error?: string;
}

export class MusicFolderSettingsService {
    async getMusicFolders(): Promise<string[]> {
        const sources = await libraryDataService.getLibraryDirectoryOverviews();
        return sources.map(source => source.path);
    }

    async getAutoScanSettings(): Promise<AutoScanSettingsView> {
        const settings = await settingsShellService.getAutoScanSettings() as MainSettingsPayload;
        return this.normalizeAutoScanSettings(settings);
    }

    async selectMusicFolder(): Promise<string | null> {
        const result = await settingsShellService.selectFolder();
        if (!result || !result.filePaths || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    }

    async addMusicFolder(folderPath: string): Promise<MusicFoldersUpdateResult> {
        const result = await libraryDataService.registerLibraryDirectory(folderPath);
        return {success: result.success, folders: await this.getMusicFolders(), error: result.error};
    }

    async removeMusicFolder(folderPath: string): Promise<MusicFoldersUpdateResult> {
        const result = await libraryDataService.removeLibraryDirectory(folderPath);
        return {
            success: result.success,
            folders: await this.getMusicFolders(),
            error: result.error
        };
    }

    async updateAutoScanEnabled(enabled: boolean): Promise<SettingsUpdateResult> {
        return settingsShellService.updateAutoScanSettings({
            autoScanEnabled: enabled
        }) as Promise<SettingsUpdateResult>;
    }

    async updateScanFrequency(frequency: string): Promise<SettingsUpdateResult> {
        return settingsShellService.updateAutoScanSettings({
            scanFrequency: frequency
        }) as Promise<SettingsUpdateResult>;
    }

    scanDirectory(folderPath: string): Promise<boolean> {
        return libraryDataService.scanDirectory(folderPath);
    }

    private normalizeAutoScanSettings(settings: MainSettingsPayload | null | undefined): AutoScanSettingsView {
        return {
            enabled: Boolean(settings?.autoScanEnabled ?? false),
            frequency: String(settings?.scanFrequency ?? 'on_startup')
        };
    }

}

export const musicFolderSettingsService = new MusicFolderSettingsService();
