import {expect, it, vi} from 'vitest';
vi.mock('electron', () => ({
    app: {getPath: () => '.', getAppPath: () => '.'},
    Tray: vi.fn(), Menu: {}, nativeImage: {createFromPath: () => ({isEmpty: () => true})}
}));
vi.mock('fs', () => ({promises: {access: vi.fn(async () => {}), writeFile: vi.fn(async () => {})}}));
vi.mock('../../../main/controllers/LocaleController', () => ({localeService: {subscribe: () => () => {}}}));
import {TrayController} from '../../../main/controllers/TrayController';

it('托盘图标失败时返回局部错误，不启用关闭到不存在的托盘', async () => {
    const tray = new TrayController({} as never);
    await expect(tray.updateSettings({enabled: true, closeToTray: true})).resolves.toMatchObject({success: false});
    expect(tray.getSettings()).toMatchObject({enabled: false});
});
