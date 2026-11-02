import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({root: ''}));
vi.mock('electron', () => ({app: {getPath: () => state.root, getAppPath: () => state.root, isPackaged: false}}));
import {ExtensionInstaller} from '../../../main/services/extensions/ExtensionInstaller';
const AdmZip = createRequire(import.meta.url)('adm-zip');
beforeEach(async () => {state.root = await mkdtemp(join(tmpdir(), 'musicovite-plugin-'));});
afterEach(async () => {await rm(state.root, {recursive: true, force: true, maxRetries: 3, retryDelay: 50});});

async function install(overrides) {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({id: 'test-protocol', name: 'Protocol', version: '1.0.0', apiVersion: 2, main: 'extension.js', module: 'testExtension', ...overrides})));
    zip.addFile('extension.js', Buffer.from('window.testExtension = {activate() {}};'));
    const file = join(state.root, 'extension.zip');
    zip.writeZip(file);
    return new ExtensionInstaller().installFromZip(file);
}

it('安装当前协议并保持模块声明', async () => {
    const result = await install({});
    expect(result.id).toBe('test-protocol');
    const manifest = JSON.parse(await readFile(join(state.root, 'extensions', 'test-protocol', 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({apiVersion: 2, module: 'testExtension'});
});

it('模块属性名允许连字符和 Unicode', async () => {
    const result = await install({module: '我的插件-module'});
    expect(result.module).toBe('我的插件-module');
});

it.each([{apiVersion: 1}, {apiVersion: 3}, {module: ''}])('拒绝不支持的协议或缺失模块：%s', async overrides => {
    await expect(install(overrides)).rejects.toThrow();
});
