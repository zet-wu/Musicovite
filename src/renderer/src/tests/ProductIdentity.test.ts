import {join} from 'node:path';
import {expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({
    setName: vi.fn(), setPath: vi.fn(), setAppUserModelId: vi.fn(), mkdirSync: vi.fn()
}));
vi.mock('electron', () => ({app: {...mocks, getPath: () => '/profile-root', getAppPath: () => '/app-root'}}));
vi.mock('fs', () => ({mkdirSync: mocks.mkdirSync}));
import {initializeProductIdentity, brandingPath} from '../../../main/core/ProductIdentity';

it('开发与安装身份使用独立 profile，Chromium 与配置同属该目录', () => {
    initializeProductIdentity();
    expect(mocks.setName).toHaveBeenCalledWith('Musicovite');
    const profile = join('/profile-root', 'Musicovite');
    expect(mocks.mkdirSync).toHaveBeenCalledWith(profile, {recursive: true});
    expect(mocks.setPath.mock.calls).toEqual([['userData', profile], ['sessionData', profile]]);
    expect(brandingPath('png', '32.png')).toBe(join('/app-root', 'build', 'branding', 'png', '32.png'));
});
