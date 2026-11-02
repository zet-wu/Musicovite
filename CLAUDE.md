# Musicovite 开发协作指引

以 [AGENTS.md](AGENTS.md) 的仓库规范为准。源码结构、运行链和边界见 [docs/Architecture.md](docs/Architecture.md)。

- Node.js 22+，依赖用 npm 管理；Python 3.8+ 使用根目录 .venv；Windows WASAPI 使用 rustup 与 MSVC/Windows SDK。
- renderer 源码位于 src/renderer/src 的 app/features/ui/infrastructure/shared；主进程位于 src/main；原生代码位于 native。
- 保持 preload 隔离，文件访问复用主进程领域服务和路径校验。
- Windows 开发运行 npm run dev；macOS/Linux 依次 build:renderer、build:ts，再运行 Electron，使用 Web Audio。
- renderer 改动运行 lint、typecheck、test；主进程运行 build:ts；native 改动运行 cargo test 与 build:rs。
- 打包在目标宿主执行，Python 构建前激活 .venv。图标由 build/branding 源稿通过 npm run build:icons 导出。
- 插件使用 apiVersion 2、明确 module 和 activate(context)，公开能力通过 context.api 提供。
- 用户可见文案同步简中、台湾用词繁中和英语。新增注释使用中文，遵循现有日志约定。
- 当前产品 Musicovite 使用独立 profile；保持用户媒体和其他 profile 原文件完整。
- 过程文档及单次测试记录放在忽略的 tmp，正式文档描述当前行为。版本和发布信息由根 package.json 与 release workflow 管理。
