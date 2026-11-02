# Musicovite 架构

Musicovite 是 Electron 本地音乐播放器。主进程管理文件、设备与持久化；渲染进程按功能域组织状态和界面；Windows 原生模块提供 WASAPI shared/exclusive 音频输出，其他平台使用 Web Audio。

## 启动与身份

`src/main/main.ts` 首先加载 `InitializeProductIdentity`，再加载应用模块。产品名称为 Musicovite，Windows appId 为 `com.musicovite.app`。开发版和安装版使用 Electron appData 下的 `Musicovite` profile；userData 与 Chromium sessionData 指向该目录。配置、语言服务和窗口管理器在身份初始化之后创建。

`Application` 使用 ServiceContainer 注册服务，先加载持久化音乐库并注册 IPC，再创建窗口。首次缺文件使用当前格式初始状态；版本不支持或损坏会保留原文件，启动恢复对话框提供打开数据目录、重新启动和退出操作。

## 代码结构

- `src/main/core/`：应用生命周期、配置、窗口、身份与服务容器。
- `src/main/controllers/`：领域 IPC 入口与输入校验。
- `src/main/services/`：音乐库、歌词、网络盘、插件、音频及语言服务。
- `src/renderer/src/app/`：启动、组合根、生命周期、Shell 与运行时协调。
- `src/renderer/src/features/`：library、playback、playlists、lyrics、equalizer、settings、extensions 等功能域。
- `src/renderer/src/ui/`：页面、弹窗、通用控件与 Component 生命周期。
- `src/renderer/src/infrastructure/electron/`：preload 的类型化领域 gateway。
- `src/renderer/src/api/`：MusicBoxAPI 播放运行时与共享契约类型。
- `src/renderer/src/shared/`：缓存、i18n、网络和共享类型。
- `native/src/`：解码、重采样、均衡器、WASAPI 渲染及有界可视化取样。
- `build/branding/`：Logo 源稿与 Windows/macOS/Linux 平台资源。

内部 MusicBoxApp、MusicBoxAPI、storage key 和音频 scheme 使用稳定的技术标识。

## IPC 与组合

BrowserWindow 启用 contextIsolation、webSecurity，关闭 nodeIntegration。调用链为 UI → feature → gateway → preload → main controller。文件访问由主进程领域服务和路径安全工具处理；DialogGateway 专用于文件/目录选择，MediaGateway 提供媒体读取。

音乐库歌单增删 IPC 使用 `addTracksToPlaylist/removeTracksFromPlaylist(playlistId, trackIds[])`。元数据更新使用 `updateTrackMetadata({filePath, ...metadata})`。外部参数在入口校验；内部调用依赖类型和领域约束，读取异常传播到有能力展示或恢复的层。用户取消文件选择是正常空结果，对话框故障是异常。网络事件订阅失败由网络界面局部处理并释放已注册监听；托盘不可用时关闭窗口保持正常退出行为。

`createMusicBoxApp` 显式绑定应用事件总线、播放适配器并同步初始状态，再构造应用。AppCompositionRoot 注入 feature 与 UI 所需端口。订阅、计时器和临时资源随其所属生命周期释放。

## 数据与来源

`music-library-sources.json` version 1 是目录、精确文件来源及歌单绑定的唯一事实来源。设置页直接通过来源服务增删目录；来源加载验证结构和版本，保存使用串行队列、临时文件替换与备份。

`music-library-cache.json` version 1 同时保存曲目索引、歌单、收藏和忽略列表，属于用户数据。歌单使用 `trackIds/manualTrackIds`；固定系统集合 `system:favorites` 派生歌曲收藏状态。封面使用应用管理的快照文件名。重建索引保留歌单与用户引用，来源绑定负责物化成员与排除项。

SettingsController 持有自动扫描开关、频率、上次扫描时间及自动歌单封面偏好。设置读取允许扩展字段，并补齐缺省项；写入入口校验当前设置项。设置更新串行化，AutoScanScheduler 通过控制器更新时间。损坏 JSON 保留原文件。

音乐库统计由索引重算，缺失的描述和时间使用空值；来源标签可保留扩展值。播放恢复以 queue 快照确定成员、当前项及播放模式；当前项失效时保留队列并取消定位，保存时间不作为恢复条件；最近播放历史单独记录实际播放会话。音乐文件、内嵌标签与外置歌词保留原位置。新 profile 的首次使用通过用户添加来源建立索引。

## 音频与首页

AudioEngineManager 组合 Web Audio 与 WASAPI，并管理引擎切换状态。Web Audio 使用媒体源、EQ 与 gain 图；Windows 原生路径通过 Rust 执行解码、重采样、EQ 和 WASAPI 输出。设备或平台能力由相应后端明确选择。

首页沿用欢迎区、波形画布与添加音乐布局，真实播放信号经空间与时间平滑后绘制。可视化采用最多约 25Hz、512 点有界时域数据；Web Audio 从 gain 后分析支路读取，WASAPI 从 EQ 后按应用音量缩放取样。实时音频线程使用预分配缓冲与非阻塞尝试写入；主进程读取和 IPC 传输在非实时路径。换曲、seek、引擎切换丢弃旧会话帧，隐藏/销毁时退订。

更多状态、布局与可视化细节见 [渲染进程架构](RendererArchitecture.md)，歌词语义见 [歌词架构](LyricsArchitecture.md)。

## 插件

插件使用 `apiVersion: 2`，manifest 以非空字符串属性名声明 `module`，入口对象导出 `activate(context)` 和可选 `deactivate()`。安装与加载校验版本和模块声明。插件在 sandbox host 中通过权限代理访问 `context.api`；安装路径、存储作用域、请求域名及订阅释放由各责任层管理。

宿主 `appReady` 通知只携带 `{isInitialized}`。内置 theme-enhancer 与四个示例遵循同一协议；应用语言变更通过正式 system API 订阅。详见 [插件指南](../src/renderer/src/extensions/docs/PluginSystemGuide.md)。

## 构建与资源

Vite 从 `src/renderer/src` 构建主窗口和桌面歌词入口到 `src/renderer/public`；TypeScript 将主进程输出到 `dist/main`。Windows 包携带对应架构 NativeAudio.node；Python helper 在目标宿主的根目录虚拟环境中打包。品牌资源随包分发，打包流程沿用项目原有配置。

正式文档描述当前架构和使用契约。过程说明、一次性测量、截图证据与实验输出保存在被忽略的 tmp。发布前的自动和平台检查见 [开发指南](Development.md)。
