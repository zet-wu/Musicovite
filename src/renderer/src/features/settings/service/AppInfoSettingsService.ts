import {systemShellService, updateService} from "@/features/appShell/service";

class AppInfoSettingsService {
    private readonly repositoryUrl = 'https://github.com/zet-wu/MusicBox';

    async updateVersionInfo(versionElementId = 'app-version-info'): Promise<void> {
        const versionElement = document.getElementById(versionElementId);
        if (!versionElement) {
            return;
        }

        const version = await updateService.getCurrentVersion();
        versionElement.textContent = `Musicovite v${version || 'unknown'}`;
    }

    async openRepository(): Promise<{success: boolean; error?: string}> {
        return await systemShellService.openExternal(this.repositoryUrl);
    }
}

export const appInfoSettingsService = new AppInfoSettingsService();
