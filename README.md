# Musicovite

![Musicovite](build/branding/musicovite.svg)

Musicovite 是基于 Electron、TypeScript 与 Rust 的本地音乐播放器，是 [MusicBox](https://github.com/asxez/MusicBox) 的独立下游。

- 音乐库目录与文件来源、歌单、收藏、最近播放及元数据编辑。
- TTML/逐字歌词、桌面歌词、播放队列与均衡器。
- 首页沿用欢迎区、波形画布和音乐导入布局；实际播放信号平滑显示，隐藏时停止取样与绘制。
- Windows WASAPI shared/exclusive 音频引擎；Windows、macOS 和 Linux 的 Web Audio 路径。
- 简体中文、繁体中文（台湾用词）、英语，以及权限受控的沙箱插件。

## 下载与反馈

[发行版本](https://github.com/zet-wu/MusicBox/releases) · [问题反馈](https://github.com/zet-wu/MusicBox/issues) · [贡献代码](https://github.com/zet-wu/MusicBox/pulls)

## 数据目录

开发版与安装版均使用独立的 Musicovite profile：Windows 为 Electron appData 下的 Musicovite，macOS 为 Application Support/Musicovite，Linux 为用户配置目录下的 Musicovite。Chromium 存储和应用配置使用同一 profile。

首次启动请重新添加音乐目录或文件。旧 MusicBox 的歌单、收藏、预设、歌词绑定、网络盘、插件及日记资料保留在原目录；媒体文件、标签和外置歌词保持原状。

## 开发

需要 Node.js 22+、npm，以及仓库根目录的 Python 3.8+ 虚拟环境。Windows WASAPI 构建另需 rustup 稳定工具链、MSVC C++ 工具和 Windows SDK。

```sh
git clone https://github.com/zet-wu/MusicBox.git
cd MusicBox
npm install
npm run install:renderer
npm run install:rs
```

Windows 可运行 `npm run dev`。macOS/Linux 使用 Web Audio 路径：

```sh
npm run build:renderer
npm run build:ts
npx electron dist/main/main.js --expose-gc
```

图标源稿与平台资源位于 `build/branding/`，执行 `npm run build:icons` 重新导出。

## 文档

- [开发与构建](docs/Development.md)
- [应用架构](docs/Architecture.md)
- [渲染进程](docs/RendererArchitecture.md)
- [歌词架构](docs/LyricsArchitecture.md)
- [插件协议](src/renderer/src/extensions/docs/PluginSystemGuide.md)
- [多语言开发](docs/i18n-development.md)

## 许可

项目遵循 [MIT](LICENSE) 许可，保留上游作者署名。第三方依赖按各自许可分发；打包保留依赖许可文件。
