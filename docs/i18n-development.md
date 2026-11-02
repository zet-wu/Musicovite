# Musicovite 国际化开发

## 语言与数据契约

- 支持 `zh-CN`、`zh-TW`、`en`。繁体选项显示“繁體中文”，采用台湾用词。
- 首次使用保存 `system`。主进程在 Electron ready 后按系统语言偏好顺序解析；脚本 Hans/Hant 优先于地区，HK/MO 使用同一繁体词库。不支持的语言回退简中。
- 语言设置只保存到 `userData/locale-settings.json`，格式为 `{"version":1,"preference":"system"}`。不继承旧 localStorage 的 language，不建立迁移或双写层。
- 主进程串行执行临时文件写入与重命名，成功后才提交状态并广播 revision。失败保留原状态；设置控件恢复原选择并提示错误。
- 清理音乐库或封面缓存不清理语言。选择“跟随系统”可恢复默认语言策略；目前没有新增“重置全部设置”操作。
- UI 语言不转换歌曲标题、真实艺术家名、歌词正文、路径、自定义预设或用户歌单名。新扫描数据的缺失艺术家/专辑保存为空，由展示层提供翻译。旧缓存不按中文内容猜测或批量改写，可通过现有“重建音乐库索引”重新扫描。
- 系统收藏按 systemType/集合类型显示；同名用户歌单保持原名。最近播放的分组键与显示标签分离。

## 代码与资源

人工维护源位于 `locales/<locale>/*.json`。当前按 app、common、settings、messages、dynamic、lyrics、native、errors、extensions、shortcuts、presets 分类；新增词条应放入语义合适的命名空间。

`scripts/generate-i18n.mjs` 验证词库并生成两个编译根内的资源、key 类型和参数接口。生成目录已忽略，不手动修改或提交。主进程 CommonJS 与两个 Vite HTML 入口均使用静态资源，不请求远程词库。

构建入口已接入生成器：根目录 build:ts/watch:ts，以及 renderer 的 dev/build/typecheck/test。单独运行 renderer 命令也会生成资源。

主进程 `LocaleService` 管理状态；`LocaleController` 只接受应用本地入口的顶层窗口调用。preload 仅暴露 `getState`、`setPreference`、`onChanged`，事件订阅返回释放函数。renderer 的 `LocaleGateway` 是唯一 IPC 接入点；普通浏览器预览使用独立的本地适配。

renderer 先订阅后取快照，忽略旧 revision。切换不重载页面或音频引擎，不重新解析歌词。标记文本原位更新；集合表面只刷新可见行并恢复滚动锚点。运行时动态文本绑定使用弱引用，不依靠扫描整页的 MutationObserver。

## 新增文案

1. 在三语 JSON 中添加稳定的语义 key，例如 `library:importCompleted`。不要使用源码行号、整句中文或用户数据作 key。
2. 整句使用命名插值，如 `{{name}}`、`{{count}}`。带数量的英语同时提供 `_one`、`_other`；现有资源为简中、繁体也保留对应形式，便于统一校验。
3. 静态 HTML 使用 `data-i18n`；属性只允许 title、placeholder、aria-label、alt 和 optgroup 的 label。优先把标记放到现有文字元素，避免增加嵌套改变布局。图标按钮把正文放在单独的 span，禁止翻译 src/href/style/事件属性。
4. `t` 返回未作 HTML 转义的纯文本，供 textContent、属性 setter、Toast 和原生菜单使用。`th` 对完整结果转义，供既有模板使用；`htmlT` 生成带绑定标记的安全文本 span。不要先转义参数再转义结果。
5. 动态状态使用 `setLocalizedText(element, key, params, property)` 或 `bindLocalizedText(element, () => ..., property)`。后者适用于播放/暂停等状态分支，刷新时从当前状态取值。
6. 不在模块顶层缓存翻译结果，不用译文做身份或错误分支判断。业务分支使用 code；外部错误显示本地化摘要和独立的原始诊断详情。
7. 运行校验、类型检查与回归。词库校验拒绝重复 JSON key、空白/HTML 文案、缺词、变量不一致和已知引用缺失；生成的 `TranslationKey`、`TranslationParams` 可用于新的严格类型调用层。

术语：track=歌曲/歌曲/track；playlist=歌单/播放清單/playlist；library=音乐库/音樂庫/library；settings=设置/設定/settings；file=文件/檔案/file；folder=文件夹/資料夾/folder。Musicovite、WASAPI、TTML 等名称保持原样。

繁体初稿可以借助 OpenCC，但必须检查台湾术语、语境和自称，不对用户内容运行转换。运行时不依赖 OpenCC 翻译 UI。

## 插件当前协议

manifest 声明 `"apiVersion": 2`；安装/加载不符合当前协议的外部插件会明确拒绝。没有旧协议降级路径。

需要 `system.info` 权限的只读接口：

```ts
api.system.getSystemLanguage();
api.system.getAppLocale(); // preference / resolvedLocale / revision
api.system.onAppLocaleChanged(state => { /* 更新插件自身显示 */ });
```

沙箱调用为异步，因此插件应 await 返回值。订阅返回 disposable，并随插件上下文释放；插件不能改变宿主语言。旧 `getLanguage` 已移除，系统语言与应用语言语义明确分开。

manifest 可提供 `localization`，按 `zh-CN`、`zh-TW`、`en` 保存 `name`、`description` 显示值，缺项回退简中和声明的基础文本。资源绑定于当前 manifest，不注册到其他插件或宿主命名空间。命令 id、配置 key、enum 值不变。插件自己负责内部贡献界面和词库，宿主不自动翻译第三方网页。

内置 theme-enhancer 提供私有三语资源，订阅应用语言，并更新自己的设置页和主题面板；切换语言不重新应用主题。示例 manifest 已更新协议版本。

## 自动检查

以下命令在仓库根目录执行，PowerShell 与 POSIX shell 均适用：

```text
npm run check:i18n
npm run build:ts
npm run build:renderer
npm --prefix src/renderer run lint
npm --prefix src/renderer run typecheck
npm --prefix src/renderer test
```

Windows 原生模块另运行 `npm run build:rs`。不必为 UI 翻译修改 Rust/Python 构建链。

伪本地化可将英语元音加长并添加括号，用于发现截断。仅对生成产物生效，不改源词库；正式构建前清除环境变量。

PowerShell：

```powershell
$env:MUSICBOX_I18N_PSEUDO = '1'
npm run build:renderer
Remove-Item Env:MUSICBOX_I18N_PSEUDO
npm run build:renderer
```

macOS/Linux：

```bash
MUSICBOX_I18N_PSEUDO=1 npm run build:renderer
npm run build:renderer
```

## 手动验收清单

实际窗口操作由维护者执行。本轮不将自动化通过等同于 UI、音频或安装包验收通过。

- 在正常终端启动 Windows `npm run dev`；保持终端打开。不要使用本轮 `tmp/i18n/launch.cjs` 临时启动器。该启动方式曾因输出管道关闭触发 EPIPE；测试进程已停止。
- 首次打开默认跟随系统；分别切换简中、繁体、英语，再重启检查选择保留。
- 播放期间切换：声音连续、位置和播放队列不变；播放/暂停、收藏、播放模式提示与实际状态一致。
- 同时打开桌面歌词：切换后锁定提示与窗口标题同步；关闭重建后仍使用当前语言；歌词正文和逐字时间轴不变。
- 在未保存的元数据/歌单编辑中切换：输入、焦点、选择、封面预览保留。曲名或歌单名含引号、`&`、`<img>` 时只显示文本。
- 检查音乐库、艺术家、专辑、歌单、最近播放的数量 0/1/2、缺失标签、日期和列表滚动位置。真实名为“未知艺术家”的标签及“收藏”的用户歌单保持原名。
- 检查文件导入、来源扫描、网络磁盘失败、元数据写入失败、确认框、歌词源选择、快捷键和两种均衡器。
- 启用内置主题插件后切换语言，检查设置与面板；关闭插件后不再接收事件。不符合 apiVersion 2 的外部插件应被拒绝。
- 在最小窗口、迷你模式、缩放和伪本地化英语下检查按钮、菜单、弹窗、长说明的截断和溢出。
- 在 Windows/macOS/Linux 各自安装包中离线检查两个入口与托盘/文件选择器。系统按钮、Electron 角色菜单和安装器的语言可能由操作系统控制；不把它们计入应用自定义文案的实时切换承诺。
