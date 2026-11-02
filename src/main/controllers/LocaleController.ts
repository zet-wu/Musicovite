import {app, BrowserWindow, ipcMain, type IpcMainInvokeEvent} from 'electron';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LocaleService} from '../services/i18n/LocaleService';
import {nativeTranslator} from '../services/i18n/Translation';

export const localeService = new LocaleService(join(app.getPath('userData'), 'locale-settings.json'),
    () => app.getPreferredSystemLanguages());
export async function registerLocaleController(): Promise<() => void> {
    await localeService.initialize();
    await nativeTranslator.changeLanguage(localeService.getState().resolvedLocale);
    const disposeTranslation = localeService.subscribe(state => { void nativeTranslator.changeLanguage(state.resolvedLocale); });
    const validate = (event: IpcMainInvokeEvent) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed() || event.senderFrame !== event.sender.mainFrame) {
            throw new Error('LOCALE_UNTRUSTED_SENDER');
        }
        const normalize = (value: string) => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
        const roots = [join(app.getAppPath(), 'src/renderer/public'), join(__dirname, '../../../src/renderer/public')];
        const allowed = roots.flatMap(root => ['index.html', 'DesktopLyrics.html'].map(file => normalize(join(root, file))));
        let senderPath = '';
        try { senderPath = normalize(fileURLToPath(event.senderFrame.url)); } catch { /* 非本地入口拒绝访问。 */ }
        if (!allowed.includes(senderPath)) throw new Error('LOCALE_UNTRUSTED_ORIGIN');
    };
    ipcMain.handle('locale:getState', event => { validate(event); return localeService.getState(); });
    ipcMain.handle('locale:setPreference', (event, preference: unknown) => {
        validate(event);
        return localeService.setPreference(preference);
    });
    const disposeBroadcast = localeService.subscribe(state => {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) win.webContents.send('locale:changed', state);
        }
    });
    return () => {
        disposeTranslation();
        disposeBroadcast();
        ipcMain.removeHandler('locale:getState');
        ipcMain.removeHandler('locale:setPreference');
    };
}
