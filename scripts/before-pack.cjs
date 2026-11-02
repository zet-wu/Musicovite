const fs = require('node:fs');
const path = require('node:path');
const {Arch} = require('builder-util');

module.exports = async context => {
    const arch = Arch[context.arch];
    const root = context.packager.projectDir;
    if (context.electronPlatformName !== process.platform || arch !== process.arch) {
        throw new Error(`请在目标平台与架构 ${context.electronPlatformName}/${arch} 上构建 Python helper 和安装包`);
    }
    const helper = path.join(root, 'dist', 'main', process.platform === 'win32' ? 'metadata_editor.exe' : 'metadata_editor');
    if (!fs.existsSync(helper)) throw new Error(`缺少 Python helper: ${helper}`);
    if (process.platform !== 'win32') return;
    // 在打包前检查 PE 机器类型，避免把不同架构的原生文件装入安装包。
    for (const file of [path.join(root, 'dist', 'main', 'NativeAudio.node'), helper]) {
        const bytes = fs.readFileSync(file);
        if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error(`无效 PE 文件: ${file}`);
        const offset = bytes.readUInt32LE(0x3c);
        if (offset + 6 > bytes.length || bytes.readUInt32LE(offset) !== 0x4550) throw new Error(`无效 PE 头: ${file}`);
        const expected = arch === 'arm64' ? 0xaa64 : arch === 'x64' ? 0x8664 : 0x14c;
        if (bytes.readUInt16LE(offset + 4) !== expected) throw new Error(`原生文件架构与 ${arch} 不符: ${file}`);
    }
};
