import {t} from '@/shared/i18n';

import {showToast} from "@utils/index.js";
import {hardwareAccelerationSettingsService} from "./HardwareAccelerationSettingsService";
import {appConfirmationService} from "@/features/appShell/service";

interface HardwareAccelerationChangeResult {
    checked: boolean;
}

class HardwareAccelerationSettingsController {
    async getInitialEnabled(): Promise<boolean> {
        try {
            return await hardwareAccelerationSettingsService.getEnabled();
        } catch (error) {
            console.error('❌ Settings: 初始化硬件加速设置失败:', error);
            return true;
        }
    }

    async handleChange(enabled: boolean): Promise<HardwareAccelerationChangeResult> {
        try {
            if (!enabled) {
                const shouldRestart = await this.confirmDisableAndRestart();
                if (!shouldRestart) {
                    return {checked: true};
                }
            }

            const result = await hardwareAccelerationSettingsService.updateEnabled(enabled);
            if (!result.success) {
                showToast(t('messages:couldNotUpdateHardwareAccelerationSetting'), 'error');
                return {checked: !enabled};
            }

            if (!enabled) {
                await this.restartApplication();
            } else {
                this.showEnabledNotification();
            }

            return {checked: enabled};
        } catch (error) {
            showToast(t('messages:couldNotApplyHardwareAccelerationSetting'), 'error');
            return {checked: !enabled};
        }
    }

    async openUserDataFolder(): Promise<void> {
        const result = await hardwareAccelerationSettingsService.openUserDataFolder();
        if (result.success) {
            showToast(t('messages:applicationDataFolderOpened'), 'success');
            return;
        }

        showToast(t('messages:couldNotOpenFolderMessage'), 'error');
        console.error('❌ Settings: 打开应用数据文件夹失败:', result.error);
    }

    async openDevTools(): Promise<void> {
        const result = await hardwareAccelerationSettingsService.openDevTools();
        if (result.success) {
            showToast(t('messages:developerToolsOpened'), 'success');
            return;
        }

        showToast(t('messages:couldNotOpenDeveloperTools'), 'error');
        console.error('❌ Settings: 打开开发者工具失败:', result.error);
    }

    private async confirmDisableAndRestart(): Promise<boolean> {
        return await appConfirmationService.confirm({
            title: t('messages:hardwareAccelerationSettings'),
            message: t('settings:restartHardwareConfirm'),
            confirmText: t('messages:restartApplication'),
            type: 'warning'
        });
    }

    private async restartApplication(): Promise<void> {
        showToast(t('messages:restartingApplication'), 'info');
        setTimeout(async () => {
            try {
                await hardwareAccelerationSettingsService.restartApplication();
            } catch (error) {
                showToast(t('messages:couldNotRestartPleaseRestartTheApplicationManually'), 'error');
            }
        }, 1000);
    }

    private showEnabledNotification(): void {
        showToast(t('messages:hardwareAccelerationEnabledRestartForBestPerformance'), 'success');
    }
}

export const hardwareAccelerationSettingsController = new HardwareAccelerationSettingsController();
