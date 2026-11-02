import * as fs from 'fs';
import * as path from 'path';
import {app, BrowserWindow} from 'electron';
import {BaseController, Controller, IpcHandle} from '../decorators/IpcHandler';

const DEFAULT_SETTINGS = {
    autoScanEnabled: false,
    scanFrequency: 'on_startup' as 'on_startup' | 'daily' | 'weekly',
    lastScanTime: 0,
    autoPlaylistCoverFromFirstTrack: false
};
type Settings = typeof DEFAULT_SETTINGS;

@Controller('settings')
export class SettingsController extends BaseController {
    private readonly settingsFilePath: string;
    private settings: Settings | null = null;
    private updates: Promise<unknown> = Promise.resolve();

    constructor(settingsFilePath?: string) {
        super();
        this.settingsFilePath = settingsFilePath ?? path.join(app.getPath('userData'), 'music-folders-settings.json');
    }

    private validate(value: unknown): Settings {
        const data = value as Settings;
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || Object.keys(data).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key))
            || typeof data.autoScanEnabled !== 'boolean' || typeof data.autoPlaylistCoverFromFirstTrack !== 'boolean'
            || !['on_startup', 'daily', 'weekly'].includes(data.scanFrequency)
            || !Number.isFinite(data.lastScanTime) || data.lastScanTime < 0) {
            throw new Error('音乐库设置格式无效');
        }
        return {...data};
    }

    private async ensureSettings(): Promise<Settings> {
        if (this.settings) return this.settings;
        try {
            this.settings = this.validate(JSON.parse(await fs.promises.readFile(this.settingsFilePath, 'utf8')));
        } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
            this.settings = {...DEFAULT_SETTINGS};
        }
        return this.settings;
    }

    private update(values: Partial<Settings>): Promise<Settings> {
        const operation = this.updates.then(async () => {
            const next = this.validate({...await this.ensureSettings(), ...values});
            const temporary = this.settingsFilePath + '.tmp';
            try {
                await fs.promises.mkdir(path.dirname(this.settingsFilePath), {recursive: true});
                await fs.promises.writeFile(temporary, JSON.stringify(next, null, 2), 'utf8');
                try { await fs.promises.copyFile(this.settingsFilePath, this.settingsFilePath + '.bak'); }
                catch (error: any) { if (error.code !== 'ENOENT') throw error; }
                await fs.promises.rename(temporary, this.settingsFilePath);
                this.settings = next;
                return {...next};
            } catch (error) {
                await fs.promises.rm(temporary, {force: true}).catch(() => undefined);
                throw error;
            }
        });
        this.updates = operation.catch(() => undefined);
        return operation;
    }

    async isAutoPlaylistCoverEnabled(): Promise<boolean> {
        return (await this.ensureSettings()).autoPlaylistCoverFromFirstTrack;
    }

    @IpcHandle('settings:getAutoScanSettings')
    async getAutoScanSettings(): Promise<Settings> {
        return {...await this.ensureSettings()};
    }

    @IpcHandle('settings:updateAutoScanSettings')
    async updateAutoScanSettings(values: Partial<Settings>): Promise<{success: boolean; settings: Settings}> {
        const settings = await this.update(values);
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        win?.webContents.send('autoScanScheduler:restart');
        return {success: true, settings};
    }

    @IpcHandle('settings:updateLastScanTime')
    async updateLastScanTime(timestamp: number): Promise<{success: boolean}> {
        await this.update({lastScanTime: timestamp});
        return {success: true};
    }

    @IpcHandle('settings:get')
    async get(key: string): Promise<unknown> {
        if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error('未知设置项');
        return (await this.ensureSettings())[key as keyof Settings];
    }

    @IpcHandle('settings:set')
    async set(key: string, value: unknown): Promise<boolean> {
        if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error('未知设置项');
        await this.update({[key]: value});
        return true;
    }
}
