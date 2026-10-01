# TTML 消费端实施记录

## M0 基线与接入设计（2026-10-01）

- 按用户要求在当前 `feature-ttml` 分支开发；起点 `ce26833b81161924b80a446a53abb5a1280b7d7a`，初始工作区干净。未切换或重置到 dev。
- AMLL core 0.5.2、lyric 1.0.2、ttml 1.0.1。实际入口位于 renderer 的 `features/lyrics`，不是旧 js 目录。
- 当前缓存无条件提前返回；外置逐词提前返回；内嵌仅取第一标签且逐词提前返回；在线采用身份桶、质量、身份排序。质量公式已是 25/40/15/10/10。
- 接入顺序：有效手动绑定 → 按最终文件顺序首条可解析 STPP → 既有非内嵌自动缓存 → 外置逐词 → 内嵌与在线评分比较；外置逐行保留原有回退优先关系。每次加载重新检查 STPP，不持久缓存“没有 STPP”，避免媒体变化被旧自动缓存遮蔽。
- 内嵌候选身份与顺序分离：STPP 使用 track ID，标签使用标签格式、标签 ID、语言、描述与同类序号；绑定保存具体 ID。刷新缺失候选报错，不偷偷换成另一条。
- 主进程只读枚举标签及 ISO BMFF sample 表，返回候选级错误；renderer 共用归一化和 TTML 投影。IPC 保持 preload 边界，扩展现有 getEmbedded 返回契约。
- 支持边界：非分片、subt/stpp、单 sample、无 edit list；校验 box、偏移、长度和 sample 表。未定义歌手稳定居左，不为未知引用创建歌手。
- M0 时尚未取得真实 Studio 产物；用户随后提供样例，见下方 M4 记录。完整 Windows/macOS 人工播放验收保持开放。

## M1–M3 实现

- `2188b58`：基线与接入设计。
- `70f2cc0`：多标签、文件顺序 STPP 枚举与单 sample 提取；两种扩展 LRC 转内部 TTML。
- `c0c13b2`：多候选列表、具体身份绑定、候选级失败、STPP 优先、内嵌评分实际比较。
- `30777a0`：声明顺序歌手映射、集合/合唱/背景规则、命名空间适配、空白 span、注音术语。
- `bec8506` 集成修复与测试：内容摘要失效保护、过期预览拒绝、完整音译投影、注音强调横排、浏览器验收夹具及证据。

### 实现边界

- STPP 从 `stco/co64` 和 `stsz/stsc/stts` 读取，不扫描 XML 字符串。支持 `moov` 在尾部、多个 `mdat`、固定或显式 sample 大小。没有整文件 500 MiB 限制；为防止异常分配，单 XML 限 16 MiB、moov 索引限 64 MiB。网络路径沿用现有网络适配器的整文件读取能力。
- 当前拒绝任何 STPP edit list（包括可等价为零偏移的 edit list）、分片、多 sample、多 sample description、非 subt handler、非 TTML namespace。没有扩大为通用字幕播放器。
- 标签按格式、标签 ID、语言、描述、同类序号定位；不可区分的完全同类重复标签只能使用序号，不承诺在这些项重排后识别其历史语义。STPP 按 track ID 定位，默认选择始终按文件轨道顺序。
- 每次自动加载重新枚举 STPP。内嵌绑定记录内容 SHA-256；原候选内容变化会刷新同一手动候选，消失/损坏后走自动回退并记为 auto。预览后内容变化会拒绝旧预览应用。历史无摘要绑定保留兼容行为。
- 两种扩展 LRC 缺少末尾边界时使用零长度末词，不伪造源结束时间。普通行与扩展行混合时保留行首重复时间戳；未定时空格附着相邻动态词，不另造时间。
- 解析只改内存 DOM，保留原始 TTML 用于 canonical 保存；补齐上游解析器要求的临时 key，按 URI 适配正文与附属音译的任意前缀。单个未知歌手居左，不改变其他歌手映射。
- AMLL 公共 `currentLyricGroups` 接口用于给真实行 DOM 附加对齐属性；CSS 不替换滚动、遮罩和动画。注音正文横排覆盖针对锁定的 AMLL core 0.5.2 类 `FmKaba_wordBody`，升级依赖时应复核。
- 一词对应多个音译音节时按时间重叠聚合显示，源音节时间仍留在 TTML 模型；无法可靠对齐时完整显示行级音译，避免静默丢字。
- 本轮扩展了现有 `lyrics:getEmbedded` IPC 返回值及绑定 source 字段；仍通过原 preload 边界，不新增渲染进程 Node 权限。未修改 native、Python 或安装包流程。

## M4 验证记录（2026-10-01，Windows）

环境：Node 24.15.0、npm 11.12.1、Python 3.11.9、Rust/Cargo 1.94.1。Python 未安装或改动任何依赖。

用户提供 `The Brave Under The Summer Sky.m4a`，确认是 Studio 输出；未提供生产版本与独立导出 TTML。SHA-256：

`92b021a2ed328cfb9221c9b90160c82328a833bb8651e195169bab09a8f7b8bf`

测试前后摘要相同。读取结果：`stpp:3`、1 份兼容标签、42 行 TTML，首行源开始时间 18084 ms。成功验证翻译、逐词音译和 Ruby 投影。浏览器加载的是从该 STPP 原样提取的 XML，不把它冒充另行取得的 Studio 外置导出文件。

已执行：

- `npm --prefix src/renderer test`（设置下述样例变量）：70 个测试文件、287 个测试全部通过。
- `npm --prefix src/renderer run typecheck`、`npm --prefix src/renderer run lint`：通过。
- `npm run build:renderer`、`npm run build:ts`：通过。Vite 保留现有大 chunk 警告。
- `npm run dev`：renderer、Rust、主进程均构建通过（Rust 有既有未使用代码警告）；沙箱运行阶段 GPU 子进程失败。随后正常桌面权限、独立测试 profile 下 Electron 成功显示窗口、注册 IPC 和启动插件服务。
- 界面工具访问该 Electron 窗口时返回 `Computer Use was not approved to use electron`，所以未完成 Electron 内导入、扫描、真实音频播放、设置/插件操作的整机冒烟验收。不能用启动日志认定这些功能通过。
- 独立浏览器夹具使用实际 `AmllLyricsView`、`LyricsSourcePicker`，仅候选窗口的 IPC 使用内存替身。验证播放时钟、暂停、点击定位、滚动、主背景不同侧、合唱居中、长行、明暗主题；实际 DOM 对齐依次为 right/left/center/left/right，缩放样式变化后仍保持。观察到动态词遮罩，保存播放和暂停截图。
- 选择器验证：损坏轨道禁用、可用 STPP 和 LRC 并存，能力来自解析结果，LRC 质量 40，预览 `A B`，应用后播放内容变为 `A B`，重新打开保留手动候选。自动化另覆盖取消请求、预览过期、同轨内容更新和刷新缺失候选。

### 复现

普通回归不需要私有样例，Studio 测试会明确跳过。传入样例执行真实产物测试：

Windows PowerShell（仓库根目录）：

```powershell
$env:MUSICBOX_STUDIO_SAMPLE = (Resolve-Path 'tmp/ttml-lyric-support/The Brave Under The Summer Sky.m4a').Path
npm --prefix src/renderer test
```

macOS/Linux（仓库根目录，替换样例位置）：

```bash
MUSICBOX_STUDIO_SAMPLE="$(pwd)/test-files/studio-sample.m4a" npm --prefix src/renderer test
```

组件夹具：`npm --prefix src/renderer run dev -- --host 127.0.0.1 --port 5174`，打开输出地址的 `/tests/fixtures/ttml-playback.html`。使用内置合成内容，或在“加载 TTML”选择只读样例；“多候选选择夹具”仅操作内存绑定，不会写用户媒体或连接在线歌词服务。该页面不在生产构建入口中。

### 验收矩阵

| 项目 | 已取得证据 | 开放项 |
| --- | --- | --- |
| A01–A03 | TtmlConsumer 测试：稳定声明顺序、去重、多引用/group、背景继承与独立时间 | Electron 真机确认 |
| A04–A05 | 浏览器真实 AMLL DOM、注音横排、长行、明暗主题、播放/暂停/跳转/滚动、空白动态词回归 | Electron 与实际音频同步；macOS |
| A06 | LyricsNormalizer、扩展 LRC 及重复时间戳测试 | 混合格式更多实际文件 |
| A07 | 多标签合成测试、真实 STPP/标签并存、选择器预览/应用 | Electron 文件导入操作 |
| A08–A11 | EmbeddedSelection：旧缓存、顺序回退、手动非首轨、评分实际比较；持久化现有回归 | 真机重新启动回归 |
| A12 | Abort、内容摘要、过期预览、窗口请求身份检查与既有资源竞态测试 | 快速切歌/关闭的完整真机交互 |
| A13 | 单 sample、co64、多轨、截断/分片/多 sample 测试 | 更多外部异常容器 |
| A14 | 设置、徽章与提示名称修改；浏览器徽章观察 | 设置页真机操作 |
| A15 | Studio M4A 提取 → 共用解析 → 浏览器实际组件呈现与动态播放 | MusicBox Electron 实际音频播放；独立 Studio 外置 TTML；Windows/macOS 完整人工验收 |

结论：实现及自动化/构建验证完成，组件级动态验证完成；**完整消费链路验收尚未完成**。

### 截图证据

- [候选列表与 LRC 预览](evidence/ttml-consumer/candidates.jpg)
- [浅色主题注音与长行](evidence/ttml-consumer/light-ruby.jpg)
- [Studio 提取歌词播放](evidence/ttml-consumer/studio-playing.jpg)
- [Studio 提取歌词滚动后暂停](evidence/ttml-consumer/studio-paused.jpg)
