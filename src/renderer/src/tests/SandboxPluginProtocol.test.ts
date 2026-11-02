import {runInNewContext} from 'node:vm';
import {describe, expect, it, vi} from 'vitest';
import {createSandboxFrameHtml} from '../extensions/core/sandbox/SandboxFrameRuntime';

function runtime() {
    let receive!: (event: {data: unknown}) => Promise<void>;
    const postMessage = vi.fn();
    const log = vi.fn();
    const html = createSandboxFrameHtml();
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
    runInNewContext(script, {
        window: {addEventListener: (_: string, fn: typeof receive) => {receive = fn;}},
        parent: {postMessage}, console: {log}, setTimeout, clearTimeout, setInterval, clearInterval
    });
    return {log, postMessage, send: (data: unknown) => receive({data})};
}

describe('沙箱插件当前模块协议', () => {
    it('按 manifest 的非标识符属性名找到并激活模块', async () => {
        const sandbox = runtime();
        await sandbox.send({type: 'sandbox:init', requestId: 'init', context: {extension: {}}, moduleVarName: '我的插件-module', code: "window['我的插件-module'] = {activate() {return {ready: true};}};"});
        expect(sandbox.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({success: true});
        await sandbox.send({type: 'sandbox:activate', requestId: 'activate'});
        expect(sandbox.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({success: true});
    });

    it.each([
        {moduleVarName: undefined, code: 'window.plugin = {activate() {}};'},
        {moduleVarName: 'plugin', code: 'window.plugin = {default: class {}};'},
        {moduleVarName: 'missing', code: 'window.plugin = {activate() {}};'}
    ])('拒绝未声明、错误模块或类入口：%s', async input => {
        const sandbox = runtime();
        await sandbox.send({type: 'sandbox:init', requestId: 'init', context: {extension: {}}, ...input});
        expect(sandbox.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({success: false});
    });

    it('激活后即使 deactivate 抛错也释放订阅', async () => {
        const sandbox = runtime();
        await sandbox.send({type: 'sandbox:init', requestId: 'init', context: {extension: {}}, moduleVarName: 'plugin', code: `
            window.plugin = {
                activate(context) {
                    context.subscriptions.add({dispose() {throw new Error('dispose failure');}});
                    context.subscriptions.add({dispose() {console.log('disposed');}});
                    return {ready: true};
                },
                deactivate() {throw new Error('deactivation failure');}
            };
        `});
        await sandbox.send({type: 'sandbox:activate', requestId: 'activate'});
        expect(sandbox.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({success: true});
        await sandbox.send({type: 'sandbox:deactivate', requestId: 'deactivate'});
        expect(sandbox.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({success: false});
        expect(sandbox.log).toHaveBeenCalledWith('disposed');
    });
});
