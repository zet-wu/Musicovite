const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist', 'main');
if (path.relative(root, output) !== path.join('dist', 'main')) throw new Error('主进程输出目录无效');

// 仅清理编译器生成的文件，保留各平台独立构建的原生模块和 Python helper。
function clean(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) clean(file);
        else if (entry.isFile() && /(?:\.js(?:\.map)?|\.d\.ts(?:\.map)?)$/.test(entry.name)) fs.unlinkSync(file);
    }
}
clean(output);
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'src/main/tsconfig.json'], {cwd: root, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
