const {app, BrowserWindow, dialog} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appRoot = process.env.MUSICOVITE_SMOKE_APP_ROOT || root;
const outputRoot = path.join(root, 'tmp', 'startup-smoke');
fs.mkdirSync(outputRoot, {recursive: true});
const output = fs.mkdtempSync(path.join(outputRoot, 'run-'));
const profile = path.join(output, 'profile');
fs.mkdirSync(profile, {recursive: true});
app.setPath('appData', profile);
// 测试入口位于 scripts，显式选择真实应用根；所有数据与窗口均与用户会话隔离。
app.getAppPath = () => appRoot;
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.showInactive = function () {};
BrowserWindow.prototype.focus = function () {};

const messages = [];
let finished = false;
let polling = false;
function finish(success, state) {
    if (finished) return;
    finished = true;
    const report = path.join(output, 'result.json');
    fs.writeFileSync(report, JSON.stringify({success, appRoot, state, messages}, null, 2));
    console.log(`Startup smoke ${success ? 'passed' : 'failed'}: ${report}`);
    app.exit(success ? 0 : 1);
}
dialog.showMessageBox = async options => {
    finish(false, {mainProcessError: options.detail || options.message});
    return {response: 2};
};
app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', details => {
        messages.push({level: details.level, message: details.message});
    });
    contents.on('preload-error', (_event, preloadPath, error) => finish(false, {preloadPath, error: error.message}));
    contents.on('render-process-gone', (_event, details) => finish(false, details));
});

setTimeout(() => finish(false, {error: 'Startup timed out'}), 20000);
setInterval(async () => {
    if (finished || polling || !app.isReady()) return;
    polling = true;
    try {
        const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/index.html'));
        if (!win) return;
        const state = await win.webContents.executeJavaScript(`(() => {
            const app = document.getElementById('app');
            const error = document.querySelector('#loading .error-message');
            return {
                ready: !!app && getComputedStyle(app).display !== 'none' && !!document.querySelector('[data-home-page]'),
                error: error?.textContent || null,
                homeText: document.querySelector('[data-home-page]')?.textContent || null
            };
        })()`);
        if (state.error) finish(false, state);
        else if (state.ready) finish(true, state);
    } catch (error) {
        finish(false, {error: error.message});
    } finally {
        polling = false;
    }
}, 250);

try { require(path.join(appRoot, 'dist', 'main', 'main.js')); }
catch (error) { finish(false, {error: error.stack}); }
