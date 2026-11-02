import {localeService} from './LocaleController';
import {nativeT} from '../services/i18n/Translation';
// 系统托盘控制器

import * as fs from 'fs';
import * as path from 'path';
import {app, Tray, Menu, nativeImage} from 'electron';
import {BaseController, Controller, IpcHandle} from '../decorators/IpcHandler';
import {WindowManager} from '../core/WindowManager';
import {brandingPath} from '../core/ProductIdentity';

interface TraySettings {
    enabled: boolean;
    closeToTray: boolean;
    startMinimized: boolean;
}

@Controller('tray')
export class TrayController extends BaseController {
    private tray: Tray | null = null;
    private disposeLocale = localeService.subscribe(() => this.updateTrayMenu());

    override unregister(): void { this.disposeLocale(); super.unregister(); }
    private settings: TraySettings = {enabled: true, closeToTray: false, startMinimized: false};
    private settingsFilePath: string;

    constructor(private windowManager: WindowManager) {
        super();
        this.settingsFilePath = path.join(app.getPath('userData'), 'tray-settings.json');
    }

    private async createTrayIcon(): Promise<Electron.NativeImage> {
        const iconPath = process.platform === 'darwin'
            ? brandingPath('tray', 'mac', 'musicoviteTemplate.png')
            : process.platform === 'win32' ? brandingPath('tray', 'musicovite-tray.ico') : brandingPath('tray', 'color', '24.png');
        await fs.promises.access(iconPath);
        const icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) throw new Error('无法加载托盘图标: ' + iconPath);
        if (process.platform === 'darwin') icon.setTemplateImage(true);
        return icon;
    }

    private updateTrayMenu(): void {
        if (!this.tray) return;
        const menu = Menu.buildFromTemplate([
            {type: 'separator'},
            {label: nativeT('native:showWindow'), click: () => this.showMainWindow()},
            {type: 'separator'},
            {
                label: nativeT('native:quit'), click: () => {
                    this.windowManager.sendToMainWindow('tray:quit');
                    setTimeout(() => app.quit(), 300);
                }
            }
        ]);
        this.tray.setContextMenu(menu);
    }

    private showMainWindow(): void {
        const win = this.windowManager.getMainWindow();
        if (win) {
            win.show();
            win.focus();
        }
    }

    private async createTrayInstance(): Promise<void> {
        if (this.tray) return;
        const icon = await this.createTrayIcon();
        this.tray = new Tray(icon);
        this.tray.setToolTip('Musicovite');
        this.updateTrayMenu();
        this.tray.on('click', () => {
            const win = this.windowManager.getMainWindow();
            if (!win) return;
            if (win.isVisible()) {
                if (win.isFocused()) win.hide();
                else {
                    win.show();
                    win.focus();
                }
            } else {
                this.showMainWindow();
            }
        });
    }

    private destroyTrayInstance(): void {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }

    private async saveTraySettings(): Promise<void> {
        await fs.promises.writeFile(this.settingsFilePath, JSON.stringify(this.settings, null, 2), 'utf8');
    }

    @IpcHandle('tray:create')
    async create(): Promise<{ success: boolean; error?: string }> {
        try {
            await this.createTrayInstance();
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('tray:destroy')
    destroy(): { success: boolean; error?: string } {
        try {
            this.destroyTrayInstance();
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('tray:updateSettings')
    async updateSettings(settings: Partial<TraySettings>): Promise<{ success: boolean; error?: string }> {
        try {
            this.settings = {...this.settings, ...settings};
            await this.saveTraySettings();
            if (settings.enabled === false) this.destroyTrayInstance();
            else if (settings.enabled === true && !this.tray) await this.createTrayInstance();
            return {success: true};
        } catch (error: any) {
            return {success: false, error: error.message};
        }
    }

    @IpcHandle('tray:getSettings')
    getSettings(): TraySettings {
        // 图标或托盘创建失败时，窗口不能继续使用“关闭到托盘”。
        return {...this.settings, enabled: this.settings.enabled && this.tray !== null};
    }
}
