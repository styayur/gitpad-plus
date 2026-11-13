# Codex High 执行提示词：GitPad+ v0.1 完整开发与公开发布

## 0. 角色、任务与最终目标

你是 Codex，当前使用可用的最高适合本任务的 High 推理配置。请作为高级跨平台软件架构师、.NET 工程师、TypeScript 编辑器工程师、插件系统设计者、测试工程师及 Release Engineer，独立完成 GitPad+ 项目的首次公开交付。

**本任务要求执行实际工程工作，而不是仅仅编写实施计划、技术报告、空项目、伪代码或界面原型。**

项目名称：GitPad+  
GitHub 仓库名：`gitpad-plus`  
首个版本：`v0.1.0-alpha.1`  
开发语言：C#、TypeScript、XAML  
技术栈：.NET 10 / MAUI 10、WinUI 3、HybridWebView、React、TypeScript、Milkdown Crepe、ProseMirror、Yjs、SQLite  
许可证：**GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)**  
目标系统：Windows 11 x64 和 Android  
主要开发环境：Windows 11、PowerShell 7、Git、GitHub CLI

最终交付必须包括：

1. 创建并初始化公开 GitHub 仓库 `gitpad-plus`。
2. 完成下文定义的全部 v0.1 功能。
3. 实现可以运行、编辑、保存、恢复数据的真实应用。
4. 完成 Windows 与 Android 两个平台的实际构建及运行验收。
5. 建立可持续扩展的 TypeScript Plugin SDK。
6. 提供真实的示范插件及插件开发模板。
7. 编写完整 README、开发文档、架构文档、贡献指南和许可声明。
8. 建立 GitHub Actions CI 和 Release 构建流程。
9. 完成安全、依赖许可、数据可靠性与发布资产核验。
10. 在所有发布门禁通过后，创建 Tag `v0.1.0-alpha.1` 并发布 GitHub Pre-release。
11. 提供 Release URL、Commit SHA、构建及测试记录、实际下载验证结果和明确的剩余限制。

**严禁以“项目结构已创建”“测试代码已编写”“编译通过”代替实际应用验收。**

不要声称未执行的测试已经通过，不得制造截图、虚构测试数量、虚构设备、伪造 GitHub Actions 或省略已知阻断性问题。

执行过程中自行完成技术调查、实施、测试、修复和复测。不要在每一个普通技术决策上请求确认。只有权限、签名密钥、远端资源冲突等确实无法自行解决的阻塞才需要报告。

---

## 1. 环境检查与 GitHub 仓库创建

### 1.1 首先进行只读环境审计

检查：

- Windows 及 PowerShell 版本。
- .NET SDK、MAUI workloads。
- Visual Studio Build Tools 与 Windows App SDK。
- Node.js、pnpm、TypeScript。
- Android SDK、NDK、Java JDK。
- Android 模拟器或实际 Android 设备。
- Git、GitHub CLI。
- GitHub 登录用户及创建仓库权限。
- 当前磁盘可用容量。
- 可用的 CI、构建和签名凭据。

实际记录版本和可用状态。

采用仍受支持的 .NET 10 / MAUI 10 稳定补丁版本，不使用未经验证的 Preview 或 Nightly 依赖。

如果缺少可安全安装的工具，可以通过官方渠道安装。不得盲目清理系统目录、覆盖全局配置或删除其他项目。

不要未经验证就假定 MAUI 的 Android 构建、HybridWebView 或 WinUI 打包已经可用。

### 1.2 创建仓库

通过 GitHub CLI 查询当前已登录用户：

`gh auth status`  
`gh api user --jq .login`

使用实际登录账号作为 Owner。

检查目标仓库是否已存在：

`gh repo view <owner>/gitpad-plus`

如果不存在：

- 创建 Public Repository。
- 仓库名 `gitpad-plus`。
- Description 使用简洁专业英文。
- 默认分支 `main`。
- 启用 Issues。
- 建立合理的 `.gitignore`。
- 添加 AGPLv3 许可证。
- 启用适当的 GitHub Actions。

如果仓库已经存在，先检查所有权、历史和文件。不得覆盖其他项目，不得强推，不得重写已有发布记录。

本地仓库放在用户当前实际使用、具有足够空间的 GitHub 开发目录。不得假设旧项目路径仍然存在。

建议 Description：

`GitPad+ — A local-first, extensible Markdown journal with native calendars, persistent anchors, and Git-oriented versioning.`

### 1.3 版本控制原则

- 使用 `main` 作为稳定主分支。
- 开发工作可以使用功能分支。
- 关键阶段形成明确的 Commit。
- 禁止无意义的大量空提交。
- 不得提交编译缓存、签名私钥、Token、用户数据及测试环境中的私人文档。
- Release Tag 必须指向已验收的具体提交。
- 不得在发布后暗中替换同名资产。

---

# 2. 产品定位与设计边界

GitPad+ 是一款本地优先、跨平台、以 Markdown 为内容格式的个人日记和笔记系统。

核心理念：

- 日期负责发现记录。
- Markdown 负责永久保存正文。
- UUIDv7 负责持久身份。
- 文档、块、选区三级链接负责知识关联。
- Git 负责未来的版本管理和远端同步。
- TypeScript Plugin SDK 负责扩展功能。
- Windows 和 Android 使用各自适合的原生视觉体系。

借鉴思想：

- **Obsidian**：多面板工作空间、插件生态、双向链接。
- **Logseq**：块身份、块折叠、块引用。
- **Diarium**：日历网格、时间线和日记信息组织。
- **Notepads**：Windows 现代标签栏、简洁编辑、自动保存。
- **Notepad++**：格式工具栏、搜索及文本操作。
- **GitWriter**：Git-oriented 笔记管理。
- **Typora**：即写即渲染的 Markdown 编辑。
- **Milkdown Crepe**：可扩展 WYSIWYG 编辑器。

这些项目是设计参考，不是可以任意复制的代码来源。引用或复用源代码时必须核对许可证和保留上游声明。

## 2.1 v0.1 的范围

必须实现：

- Windows 和 Android 原生应用外壳。
- HybridWebView 内嵌 Milkdown 编辑器。
- 原生日期导航。
- 多笔记、多标签页。
- Markdown WYSIWYG。
- GFM、Directives、Callout、折叠块。
- 三秒 Markdown 源码窥视。
- UUIDv7 文档、块、持久选区及插件对象身份。
- 三级内部链接。
- W3C 持久锚点、Yjs RelativePosition、Text Fragments 的职责分离。
- 本地 Markdown 与 Sidecar 保存。
- 本地 SQLite 搜索索引。
- 自动保存及异常恢复。
- 本地状态与 Git 状态双指示器。
- 插件系统基础。
- 官方工具栏插件。
- 官方日历统计插件。
- 图片基础导入、存储和展示。
- 设置、主题基础适配。
- 安全的清空本机数据流程。
- 完整测试、文档与 Alpha Release。

## 2.2 明确后续版本功能

不要把下列功能伪装为 v0.1 已实现：

- GitHub/GitLab 真实远端同步与授权。
- 完整 Git Commit/Diff/冲突合并。
- Git Commit 时间线。
- Graph。
- Canvas。
- Bases。
- 完整第三方插件市场。
- 外部订阅与事件聚合。
- 完整日记统计分析。
- DOCX/PDF/HTML/JSON 全格式导出。
- 加密笔记本和 E2EE。

v0.1 需要为这些能力设计稳定的扩展接口，但不能仅因接口存在就宣称功能可用。

Git 状态在尚未配置真实 Git Provider 时必须明确显示 `NotConfigured`。

---

# 3. 工程架构

采用 Monorepo。

建议目录：

```text
gitpad-plus/
├── apps/
│   └── GitPadPlus.App/
│       ├── Platforms/
│       │   ├── Windows/
│       │   └── Android/
│       ├── Resources/
│       ├── Views/
│       ├── ViewModels/
│       └── Services/
├── src/
│   ├── GitPadPlus.Domain/
│   ├── GitPadPlus.Application/
│   ├── GitPadPlus.Storage/
│   ├── GitPadPlus.Protocol/
│   └── GitPadPlus.PluginContracts/
├── web/
│   ├── app/
│   ├── editor/
│   ├── markdown/
│   ├── anchors/
│   ├── bridge/
│   └── plugin-host/
├── packages/
│   ├── sdk/
│   └── create-gitpad-plugin/
├── plugins/
│   ├── official-toolbar/
│   └── official-calendar-stats/
├── tests/
│   ├── dotnet/
│   ├── web/
│   ├── integration/
│   ├── markdown-fixtures/
│   └── cross-platform/
├── scripts/
├── docs/
├── .github/
├── README.md
├── LICENSE
├── CHANGELOG.md
└── pnpm-lock.yaml
```

允许根据实际开发需要调整，但必须保持：

1. .NET 核心与 UI 解耦。
2. Markdown 编辑器与原生桥接解耦。
3. 插件 SDK 与宿主内部实现解耦。
4. 数据协议可以独立测试。
5. Windows/Android 尽量共享业务逻辑。
6. CI 能分别构建、测试和发布。

优先保持简单、可维护，不要为了所谓架构先进性引入过量项目和依赖。

---

# 4. 原生 UI：.NET MAUI + WinUI 3

## 4.1 Windows

使用 .NET MAUI 的 Windows 平台适配和 WinUI 3 原生控件。

要求：

- Mica 或 Mica Alt 窗口背景。
- 现代 Fluent 标签栏。
- 支持关闭与切换标签。
- 日历网格。
- 可调整宽度的导航区域。
- 支持笔记与笔记的并置显示。
- 可以容纳未来图谱插件的 Workspace。
- 原生菜单、对话框、设置。
- Acrylic 风格临时弹出菜单。
- 原生字体与主题颜色设置。
- 适当的键盘快捷键和无障碍支持。

优先使用 Microsoft 官方 Windows App SDK 和 WinUI 3 功能。

不要使用假玻璃截图来冒充实际系统材质。材质不可用时提供清晰的普通 Fluent 主题回退。

### 日期网格状态

- 无笔记：中性半透明卡片，无内容指示。
- 有笔记：轻微着色，底部显示笔记数量。
- 当前日期：细强调色边框。
- 当前选中：较强边框和背景。
- 自定义颜色：替代默认主题着色。
- 同步异常：独立小标记，不覆盖日期。

日历默认显示当前月份。

用户可以切换月份、选择日期、打开该日笔记或创建新笔记。

一个日期支持多篇笔记。

### 标签栏

显示格式：

`ddmmyyTagA`

例如：

`311026Thought`

`301026Study`

实际显示标签从日期和标签信息计算，绝不作为文档永久 ID。

处理标签名称溢出、重复名称、多个文档属于同一天等情况。

## 4.2 Android

使用 .NET MAUI Android 平台 UI，参考 Material 3。

要求：

- 日历默认入口。
- 顶部状态信息。
- 适合触屏的导航。
- 编辑器与软键盘正确协作。
- 键盘上方格式工具栏。
- 日期卡片在小屏幕上保持可点击性。
- 适配系统深色模式、字号和屏幕密度。
- 支持 Android 生命周期恢复。

必须实际验证中文输入法、Emoji、文字选择和长按行为。

## 4.3 参考项目

- https://github.com/dotnet/maui
- https://github.com/microsoft/microsoft-ui-xaml
- https://github.com/microsoft/WindowsAppSDK-Samples
- Microsoft WinUI Gallery
- Windows Terminal：标签及工作区思想
- Diarium：日历与日记交互思想
- Notepads：Fluent 简洁性

---

# 5. HybridWebView 与通信协议

使用 .NET MAUI HybridWebView 承载本地构建的 React + TypeScript 应用。

使用 Vite 打包 Web 资源并将其集成到 MAUI 原生应用包中。

不得要求运行时连接某个远程网站才能使用编辑器。

## 5.1 Bridge 规范

实现版本化 TypeScript ↔ C# Bridge。

每条消息应包含：

- `protocolVersion`
- `requestId`
- `method`
- `params`
- 响应数据或标准化错误对象

同时设计：

- 取消请求。
- 超时处理。
- 统一异常转换。
- 参数 Schema 校验。
- 生命周期管理。
- 断连恢复。
- 并发请求处理。
- 数据序列化边界。

使用 `System.Text.Json`，优先采用源生成序列化元数据。

不要让第三方插件直接调用任意 C# 方法。

v0.1 核心 API：

- `documents.list`
- `documents.create`
- `documents.load`
- `documents.save`
- `documents.delete`
- `calendar.query`
- `anchors.create`
- `anchors.resolve`
- `links.navigate`
- `settings.get`
- `settings.update`
- `git.status`
- `plugins.list`
- `plugins.activate`
- `plugins.deactivate`
- `app.clearLocalData`

## 5.2 实际验收

通过 Windows 和 Android 测试证明：

- WebView 可正常加载。
- Milkdown 编辑正常。
- TypeScript 可以调用受控 C# 服务。
- C# 可以主动推送状态事件。
- 消息乱序不会覆盖较新数据。
- 应用切换后台和恢复后状态正确。
- 长篇内容不会因为 Bridge 反复全量复制导致明显卡顿。

参考：

https://learn.microsoft.com/dotnet/maui/user-interface/controls/hybridwebview

---

# 6. Milkdown Crepe WYSIWYG 编辑器

使用 Milkdown Crepe 作为编辑器基础。

参考：

- https://github.com/Milkdown/milkdown
- https://milkdown.dev/docs/guide/using-crepe
- https://github.com/Milkdown/examples
- https://github.com/oratis/Markup
- https://github.com/hhyufan/mde-tauri
- https://github.com/ethemdemirkaya/markdown-editor

实现要求：

- 即写即渲染。
- 光标可直接定位于渲染后的文本。
- 常用格式立即呈现。
- 完整 Undo/Redo。
- 可编辑标题、段落、列表。
- 表格、任务列表、链接、图片。
- 数学公式渲染。
- 基础代码块。
- 多语言输入。
- Markdown 文件导入。
- 当前正文保存为 Markdown。

不启用不需要的 AI 功能。

不要将 CodeMirror 6 作为主编辑器。

Crepe 中若有可选 CodeMirror 代码块功能，可按产品需求禁用。

## 6.1 Markdown Peek

实现：

正常模式始终 WYSIWYG。

双击一个已渲染的文本区域：

1. 获取点击位置对应的 Markdown 源文本范围。
2. 临时展示真实原始 Markdown。
3. 默认 3000ms 后恢复。
4. 用户开始编辑则取消倒计时。
5. 不得因为恢复导致光标跳动、修改丢失或 Undo 栈异常。

特别注意：

**不能仅通过重新序列化 ProseMirror 节点来冒充“原始 Markdown”。**

如果原文件中的空格、标记、Directive 属性顺序不同，应当优先展示真实源文本切片。需要维护源码范围映射或相应的可信映射策略。

设置中提供：

- `markdownPeek`
- `nativeWordSelection`

Android 提供长按或工具栏的等价操作。

## 6.2 插件化编辑器

将编辑器功能组织为：

- Persistent Block
- Persistent Selection
- Markdown Peek
- Directive Renderer
- Callout Renderer
- Fold Engine
- Media Manager

这些是内部编辑器模块，可以逐步开放公共适配接口，但不能混淆 Milkdown 插件与 GitPad+ 应用级插件。

---

# 7. Markdown 格式

标准：

**CommonMark + GitHub Flavored Markdown + Directives + Callout。**

建议调查并使用兼容的：

- `remark-gfm`
- `remark-directive`
- `remark-frontmatter`
- `remark-math`
- `rehype-katex`
- `rehype-sanitize`

前端负责 Markdown AST（抽象语法树，即解析后的结构化文档表示）与 Milkdown 节点之间的转换。

C# Storage 层负责 Frontmatter 及持久文件操作。

必须支持：

- 粗体、斜体、下划线。
- 删除线和高亮。
- 字体颜色。
- 无序列表和任务列表。
- 表格。
- 链接。
- 折叠块。
- GitHub/Obsidian 风格 Callout。
- 数学公式。
- 图片。

GitPad+ 的扩展语法建议：

`:underline[文字]`

`:mark[文字]{color="yellow"}`

`:color[文字]{value="#C24B52"}`

`:::fold[标题]{default="closed"}`

也支持：

`> [!NOTE]`

`> [!WARNING]`

折叠支持：

- 单块展开/折叠。
- 标题折叠。
- 默认折叠状态。
- 全部展开。
- 全部折叠。

优先使用标准 Markdown 表示通用格式，不要为已有标准能力重新发明不兼容语法。

HTML 仅作为导入或兼容手段，不作为默认富文本持久格式。

## 7.1 数据保真

建立 Markdown Fixtures（固定测试样本）。

必须覆盖：

- 中文。
- 英语、法语混合文本。
- Emoji 与组合字符。
- CRLF/LF。
- 数学公式。
- 表格。
- 多层列表。
- Callout。
- 自定义 Directive。
- 未知 Directive。
- 前后空白。
- HTML 兼容输入。
- 插件缺失时的未知节点。

无修改情况下应尽可能保持文件字节不变；有修改时必须保证语义、未知扩展及持久 ID 不丢失。

对于 Milkdown 不支持的结构，必须提供保真回退或安全的只读节点，不得静默删除。

---

# 8. UUIDv7 与持久身份

所有持久对象统一使用 RFC 9562 UUIDv7：

- Document ID。
- Block ID。
- Selection ID。
- Plugin Persistent Object ID。

C# 优先采用标准 `Guid.CreateVersion7()`。

TypeScript 可使用支持 RFC 9562 的 `uuid` 库。

所有 UUID 必须能经过跨语言序列化和解析。

## 8.1 文档

使用 YAML Frontmatter。

字段：

- `schemaVersion`
- `id`
- `date`
- `title`
- `tags`
- `createdAt`
- `updatedAt`
- `rating`，可选

日期采用 `YYYY-MM-DD` 作为持久格式。

显示层允许 `ddmmyyTagA`。

## 8.2 块

块在首次创建时获得 UUIDv7。

严格要求：

- 编辑不变。
- 移动不变。
- 折叠不变。
- 重新加载不变。
- 复制创建新的身份。
- 拆分有确定的身份保留规则。
- 合并保留主 ID，必要时记录别名。
- 删除不得让旧 ID 被其他块复用。

所有稳定块身份必须有真实测试。

不要在每次编辑器重建节点树时重新生成块 ID。

## 8.3 选区

仅在用户创建永久选区链接、批注或其他持久对象时生成 Selection UUIDv7。

不要为每次鼠标移动、普通选中或临时光标位置创建永久对象。

---

# 9. 三级链接与锚点引擎

URI Scheme：

`gitpadplus://`

三级链接：

- `gitpadplus://note/{document-uuid}`
- `gitpadplus://note/{document-uuid}?block={block-uuid}`
- `gitpadplus://note/{document-uuid}?selection={selection-uuid}`

必须实现：

- 解析。
- 校验。
- 内部导航。
- 复制链接。
- 失效处理。
- 重新定位。
- 歧义提示。

在平台条件允许时注册应用级 URI Handler；如果某平台需要额外权限或安装配置，必须实际验证并如实说明。

## 9.1 持久锚点

采用 W3C Web Annotation 选择器思想。

持久存储：

- Block UUID。
- Selection UUID。
- TextQuoteSelector。
- TextPositionSelector。
- `exact`。
- `prefix`。
- `suffix`。
- `start`。
- `end`。
- 规范化版本。
- 内容修订信息。

## 9.2 Yjs

使用 Yjs 与 ProseMirror 相关绑定，为编辑会话中的选区维护 RelativePosition。

明确约束：

**Yjs RelativePosition 只对具有连续 Yjs 身份与历史的文档状态可靠。**

不允许每次重建 Y.Doc 后假定旧 RelativePosition 自动保持有效。

Markdown 为正文权威源。

W3C 式锚点元数据为持久选区权威依据。

Yjs 负责编辑会话内部跟踪。

## 9.3 Text Fragments

实现基于文本及上下文的定位表达和导出机制。

Text Fragments 不是 GitPad+ 的第二套永久身份系统，也不能冒充原生应用中的通用浏览器导航能力。

## 9.4 链接失效与修复

解析顺序：

1. 文档 UUID。
2. 块 UUID。
3. 验证持久锚点。
4. 当前 Y.Doc 中可用的相对位置。
5. Text Quote + 上下文重新定位。
6. 候选位置检测。
7. 无法确定则标记待修复。

绝不静默选择错误文本。

需要验证：

- 段落前插入文字。
- 段落移动。
- 文本修改。
- 块拆分和合并。
- 相同字符串多次出现。
- 外部 Markdown 修改。
- 重新打开应用。
- Android 与 Windows 字符索引差异。

---

# 10. 本地文件、Sidecar 与 SQLite

## 10.1 文件布局

建议：

```text
Vault/
├── Journal/
├── Assets/
└── .gitpad/
    ├── anchors/
    ├── index.sqlite
    ├── session.json
    └── settings.json
```

Markdown 和 Sidecar 是长期持久数据。

SQLite 是可重建索引。

不得仅将正文存进 SQLite 或 WebView 本地缓存。

## 10.2 Sidecar

每个文档拥有锚点元数据。

包含：

- 文档 UUID。
- Schema Version。
- Revision。
- 内容 Hash。
- Block ID 与块结构关系。
- Selection ID 与锚点信息。
- 已删除块的引用状态。
- 必要的迁移元数据。

### 文件一致性

Markdown 与 Sidecar 不能假设拥有跨两个文件的天然原子事务。

设计保存事务日志、Revision 和恢复流程。

要求：

- 先安全写临时文件。
- 完成必要的 Flush。
- 采用同卷可用的原子替换方式。
- 使用保存事务记录协调 Markdown 与 Sidecar。
- 启动时检测中断写入。
- 可以回滚或完成未完成的保存事务。
- 不能恢复时保留旧副本并提示。
- 不得盲目覆盖最后可用的数据。

## 10.3 SQLite

采用 `Microsoft.Data.Sqlite` 和 FTS5。

建立：

- Document Metadata 索引。
- 日期索引。
- 标签索引。
- 标题与正文搜索。
- 文档 ID 到路径的映射。
- 必要的链接查询索引。

索引删除或损坏后必须可以由 Markdown 与 Sidecar 重建。

## 10.4 图片与附件

v0.1 实现基本图片：

- 本地选择图片。
- 粘贴图片。
- 拖放。
- 安全复制到 Vault 的 Assets。
- Markdown 中使用相对链接。
- 显示图片。
- 防止相同导入操作产生意外重复文件。

不要将图片作为默认日历背景或把照片缩略图当成日期格子的主要 UI。

未来复杂的缩略图、压缩、媒体 Git 管理留待后续版本。

---

# 11. 自动保存与本地状态

必须支持：

- 输入停止后自动保存。
- `Ctrl+S` 立即保存本地。
- Android 后台时尽可能完成安全保存。
- 切换文档前保存。
- 关闭窗口时处理未保存内容。
- 保存失败提示。
- 异常退出后恢复。

建议防抖间隔约 600ms，可根据测试调整。

本地状态：

- `Unsaved`
- `Saving`
- `Saved`
- `SaveError`

Git 状态：

- `NotConfigured`
- `Synced`
- `Ahead`
- `Behind`
- `Diverged`
- `Offline`
- `AuthRequired`
- `Syncing`
- `Conflict`
- `Error`

v0.1 只需要完整实现 Local 状态及 Git Provider 的接口和 `NotConfigured` 状态。

不得在没有 Git 远端同步实现的情况下显示 `Synced`。

Windows 状态位于底部。

Android 状态位于顶部。

两个状态必须独立。

---

# 12. TypeScript Plugin SDK

这是 GitPad+ 的长期核心能力，不得只实现几个硬编码扩展点。

创建独立的：

`@gitpad-plus/sdk`

SDK 需要具备：

- 类型定义。
- 插件 Manifest。
- 生命周期接口。
- 权限声明。
- 命令注册。
- 工作区视图注册。
- 日历装饰。
- 编辑器命令与扩展。
- 文档读取与修改。
- 链接查询。
- 设置与插件存储。
- 主题接口。
- 事件订阅。
- 卸载资源释放。
- 错误隔离。
- 版本兼容检查。

## 12.1 分级插件

Level 1：

- 命令。
- 日历装饰。
- 受控数据查询。
- 工具栏按钮。

Level 2：

- 自定义面板。
- 复杂 Web UI。
- 独立视图。

Level 3：

- Milkdown / ProseMirror 深度扩展。
- 仅允许受信任或随应用打包的扩展。

v0.1 不开放未经审查的远端任意 JS 插件执行。

不能把 `permissions` 清单本身视为安全沙箱。权限必须由宿主和 C# Core 执行检查。

不得让普通插件直接访问 HybridWebView 原生桥接、所有文件或未来的 Git 凭据。

## 12.2 两个官方示范插件

### official-toolbar

独立实现：

- 无序列表。
- 粗体。
- 斜体。
- 下划线。
- 删除线。
- 高亮。
- 字体颜色。
- 插入链接。
- 折叠块。
- 全部展开/折叠。
- 必要的快捷键。

Windows 使用紧凑 Fluent 工具栏。

Android 使用适合键盘上方的工具栏。

必须通过公开 SDK 注册功能，而不是直接修改主程序内部对象。

### official-calendar-stats

通过公开 SDK：

- 查询某日期的笔记数量。
- 添加日期装饰。
- 显示可选提示。
- 支持插件启用和禁用。
- 卸载时撤销所有注册。

## 12.3 插件开发体验

提供：

`packages/create-gitpad-plugin`

可以生成示范插件项目。

应包含：

- TypeScript 配置。
- Manifest。
- SDK 依赖。
- 示例功能。
- 测试。
- 构建命令。
- 开发模式说明。

至少一个示范插件必须能够在不修改 GitPad+ Core 源代码的情况下完成构建与安装。

参考：

- https://docs.obsidian.md/Plugins
- https://github.com/Milkdown/milkdown
- VS Code Extension API
- VS Code Extension Host 设计思想

---

# 13. 清空本机数据

设置页：

`Settings → Data & Storage → Clear Local GitPad+ Data`

必须设计独立确认页面。

展示：

- 待删除笔记数。
- 附件数量和大小。
- 本地缓存与索引大小。
- 当前是否有未保存修改。
- 是否存在应用管理目录以外的外部 Vault。

必须确保：

- 不触碰 GitHub/GitLab 远端仓库。
- 不默认删除用户自行指定的外部目录。
- 不删除其他应用共用文件。
- 不清理与 GitPad+ 无关的系统数据。
- 有未保存内容时阻止危险清理。
- 确认后才能删除。
- 清理完成后回到初始欢迎界面。

加入自动化测试，验证路径边界、符号链接/重解析点和误删保护。

不实现 E2EE。

---

# 14. 测试与质量门禁

建立真实测试矩阵。

## 14.1 .NET

使用 xUnit 测试：

- 文档创建与读取。
- UUIDv7。
- Frontmatter。
- 文件路径安全。
- Sidecar。
- Revision 与 Hash。
- 保存事务。
- 崩溃恢复。
- SQLite 索引。
- 搜索。
- 清理操作。
- Bridge 参数验证。

## 14.2 TypeScript

使用 Vitest 测试：

- Markdown AST。
- Markdown 往返。
- Milkdown 编辑器扩展。
- Block ID 稳定。
- Selection Anchor。
- Yjs 位置映射。
- Anchor Resolver。
- URI 解析。
- Markdown Peek 状态机。
- Plugin SDK 生命周期。
- 插件权限。

## 14.3 UI

使用 Playwright 验证可在浏览器测试的编辑器组件：

- 输入与编辑。
- 选择文字。
- 格式工具栏。
- 3 秒源码窥视。
- 标题、列表、表格、Callout。
- 主题变化。
- 插件加载与卸载。

浏览器测试不能冒充原生 MAUI/Android 集成测试。

## 14.4 真实 Windows 测试

必须：

- 构建。
- 启动。
- 创建笔记。
- 编辑并保存。
- 关闭并重启。
- 重新加载文件。
- 使用日历导航。
- 使用插件。
- 验证状态栏。
- 验证基本 Fluent 效果。
- 验证清理确认。

## 14.5 Android 测试

必须在实际 Android 设备或可用的 Android 模拟器执行：

- 安装。
- 启动。
- 创建笔记。
- 中文输入法。
- Emoji。
- 长按选区。
- 软键盘工具栏。
- 保存。
- 后台恢复。
- 数据重载。
- 插件基本行为。

如果环境只能编译 APK 而无法安装和运行，就必须将 Android 运行验收标记为未完成，不能声明全部通过。

## 14.6 发布阻断测试

以下任意一项失败即阻止正式 v0.1 Pre-release：

- Windows 无法启动。
- Android 无法启动。
- 已保存的数据无法重新读取。
- Markdown 内容静默丢失。
- Block ID 在普通编辑后变化。
- Selection Anchor 错误跳转且没有警告。
- 未知 Directive 被静默删除。
- 保存中断导致最后可用内容永久丢失。
- 插件错误导致核心无法使用。
- 清理功能删除非应用管理文件。
- 发布包无法安装。
- 缺少必要的签名或许可证。
- Release 资产校验失败。

不得通过跳过测试、关闭断言、删除测试案例或降低已确定的核心需求来制造通过结果。

## 14.7 验收报告

生成：

`docs/acceptance/v0.1.0-alpha.1.md`

以及机器可读的测试结果。

报告包括：

- 测试环境。
- 命令。
- 实际测试数。
- Pass/Fail/Skipped。
- 设备类型。
- Windows/Android 结果。
- 失败修复记录。
- 真实截图或日志引用。
- 已知限制。
- 是否满足 Release Gate。

---

# 15. 性能与稳定性

优先保证数据安全，再优化性能。

建立以下测试：

- 1000 篇日记索引。
- 多篇笔记同一日期。
- 大型 Markdown 文档。
- 长表格。
- 多层折叠。
- 大量块链接。
- 多次快速切换文档。
- 连续保存。
- 异常退出和重新打开。
- 长时间编辑。
- Android 前后台切换。

记录：

- 首次启动耗时。
- 日历打开耗时。
- 编辑器初始化耗时。
- 搜索耗时。
- 内存占用。
- 大文档输入延迟。
- 保存耗时。

不要捏造绝对性能指标。根据真实测试确定合理的基准值，并将它们写入报告与后续性能回归测试。

---

# 16. README：面向使用者与开发者

README 必须是一份成熟的 GitHub 项目主页，而不仅是安装说明。

**必须区分完整产品愿景、v0.1 已实现功能与未来路线图。**

建议使用英文作为 README 主语言，同时提供 `README.zh-CN.md`。

要求 README 至少包含：

## A. 全功能版产品简介

解释完整 GitPad+ 的定位和设计思想：

- Local-first Markdown journal。
- Calendar-first navigation。
- Native Fluent / Material UI。
- WYSIWYG editing。
- Stable document/block/selection links。
- Git-oriented version history and sync。
- Extensible plugin architecture。
- Future graph、canvas、bases、timeline 等能力。

这部分是产品愿景，不能暗示所有内容均已实现。

## B. Release 状态

明确：

`v0.1.0-alpha.1 — Early Alpha`

提供：

- 当前已实现功能。
- 当前未实现功能。
- 平台支持状态。
- Alpha 风险。
- Release 下载入口。

## C. 快速启动

包括：

- Windows 安装和启动。
- Android APK 安装。
- 创建第一篇日记。
- 使用日历。
- 使用所见即所得编辑器。
- 双击查看 Markdown。
- 保存与本地状态。
- 复制内部链接。
- 启用官方插件。

所有命令必须在实际环境验证。

不要编造并不存在的包名、下载路径或启动命令。

## D. 开发者快速启动

包括：

- .NET 版本。
- MAUI workload。
- Node/pnpm。
- Android SDK。
- `pnpm install`。
- 前端构建。
- .NET restore/build。
- Windows 运行。
- Android 运行。
- 测试命令。

必要时提供 `scripts/bootstrap.ps1` 和 `scripts/verify.ps1`。

## E. Architecture

解释：

- 原生 Shell。
- HybridWebView。
- Milkdown。
- C# Core。
- Markdown Storage。
- Anchor Sidecar。
- SQLite。
- Plugin SDK。
- 后续 Git Provider。

## F. Plugin Development

提供插件模板与示范插件入口。

说明插件版本、权限、生命周期和跨平台限制。

## G. Roadmap / 待开发功能

写出：

- v0.2：GitHub/GitLab Sync、Diff、History、Conflict。
- v0.3：Timeline、Backlinks、Export。
- v0.4：Graph、Canvas、Bases、Advanced Statistics。
- v0.5：Plugin SDK Stable、Plugin Distribution、Integrations。
- v1.0：成熟跨平台版本与完整稳定性验收。

这些只是目标，不承诺未经验证的发布日期。

## H. License

说明：

- GitPad+ 源码采用 AGPL-3.0-only。
- 第三方组件许可证依照各自声明。
- 用户创建的笔记内容不会仅因为使用 GitPad+ 而自动变成 AGPL 代码。
- 贡献规则。

## I. Screenshots

只能添加真实运行截图。

提供 Windows 和 Android 截图。如果缺少某平台实际截图，不得以设计稿或生成图片冒充应用运行截图。

---

# 17. 附加工程文档

至少创建：

- `docs/PRODUCT-SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA-FORMAT.md`
- `docs/LINK-PROTOCOL.md`
- `docs/MARKDOWN-SPEC.md`
- `docs/PLUGIN-SDK.md`
- `docs/SECURITY.md`
- `docs/BUILDING.md`
- `docs/TESTING.md`
- `docs/REFERENCES.md`
- `docs/ROADMAP.md`
- `docs/acceptance/v0.1.0-alpha.1.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`

重要架构选择记录为 ADR（Architecture Decision Record，架构决策记录）。

至少记录：

1. 选择 .NET MAUI/WinUI 3。
2. 选择 HybridWebView。
3. 选择 Milkdown Crepe。
4. 选择 UUIDv7。
5. 选择 W3C + Yjs + Text Fragments 的职责分离。
6. Markdown 和 Sidecar 持久化策略。
7. TypeScript 插件系统的权限模型。
8. 为什么 v0.1 不包含真实 Git 远端同步。

---

# 18. AGPLv3 许可与依赖合规

许可证必须是：

`AGPL-3.0-only`

不是 MIT，不是 GPL-3.0-only，也不是含糊的 `AGPL-3.0` 旧式标识。

要求：

1. 创建包含 GNU AGPLv3 完整、未篡改文本的 `LICENSE` 文件。
2. 必要源码文件加入合适的 SPDX 标识。
3. `package.json` 的许可证元数据正确。
4. README 与 Release Notes 声明正确。
5. 检查 .NET、npm、图标、字体、图片素材及其他第三方依赖的许可证。
6. 保留 MIT、Apache、BSD 等第三方所需版权声明。
7. 识别潜在与 AGPLv3 不兼容的依赖。
8. 生成第三方依赖清单和必要的 SBOM（软件物料清单）。
9. 不复制闭源 Diarium、Typora 或其他专有软件代码。
10. 不将 AGPLv3 版权声明错误施加于用户自己的日记内容。

Milkdown 当前采用 MIT，但必须对其余实际引入的依赖逐项核查。

许可证官方参考：

https://www.gnu.org/licenses/agpl-3.0.txt

SPDX：

https://spdx.org/licenses/AGPL-3.0-only.html

如发现许可证无法兼容，替换依赖或停止发布，不得通过忽略许可证检测解决问题。

---

# 19. GitHub Actions CI

建立真实可运行的 GitHub Actions 工作流。

至少包括：

## CI

触发：

- Pull Request。
- Push to main。

执行：

- TypeScript 类型检查。
- ESLint/格式检查。
- Vitest。
- .NET Restore。
- .NET Build。
- xUnit。
- Markdown 保真测试。
- 链接与锚点测试。
- SDK 示例插件测试。
- 依赖安全扫描。
- 许可证扫描。
- Windows 构建。
- Android 构建。

平台相关测试应使用真实支持的 Runner。

不要把无法运行的 Android UI 测试标记为 Pass。应当提供独立的 Android 设备/模拟器验收记录。

## Release

采用明确的版本化发布流程。

必须：

- 验证 Tag。
- 验证 Commit。
- 运行构建门禁。
- 产生 Release 资产。
- 生成 SHA-256。
- 验证产物版本。
- 生成发布记录。
- 下载并重新校验资产。

CI 权限最小化，不在普通 PR 中暴露 Release Secrets。

---

# 20. Windows / Android 发布资产

## 20.1 Windows

优先生成可安装或可直接运行的 Windows x64 Release 资产。

建议使用官方支持的 MAUI Windows 发布模式。

可选：

- Unpackaged Windows x64 ZIP。
- 已正确签名的 MSIX。

必须区分：

- 包是否自包含。
- 是否需要 .NET Runtime。
- 是否需要 Windows App Runtime。
- 是否已签名。
- 是否可直接运行。
- 安装或解压方法。

如果没有合法可用的 MSIX 签名证书，不得发布无法正常安装却标称已签名的 MSIX。

可以优先交付实际验证可运行的 Windows ZIP，并在 Release Notes 说明签名状态与系统要求。

## 20.2 Android

生成真实 Release APK。

必须完成：

- Release 配置编译。
- 正确应用 ID。
- 正确版本号。
- 非 Debug 形式发布。
- Release 签名。
- APK 签名验证。
- Android 安装与启动验证。

禁止将调试签名误写为正式 Release 签名。

如果缺少可持续保存的 Release Keystore 和相应安全凭据，不得临时编造凭据、把 Keystore 提交到 GitHub 或在日志中泄露密码。

如因缺少必要签名材料而无法安全发布 Android APK，应将其标记为 Release 阻塞，并完整报告。不要为完成任务而牺牲未来版本升级能力。

## 20.3 Release 资产

建议：

- `GitPadPlus-v0.1.0-alpha.1-windows-x64.zip`
- `GitPadPlus-v0.1.0-alpha.1-android-arm64.apk`
- `SHA256SUMS.txt`
- `SBOM.spdx.json`
- `RELEASE_NOTES.md`

实际文件名以经过验证的构建结果为准。

Android 的 CPU 架构支持必须与真实构建配置一致，不得将单架构包误标为通用 APK。

---

# 21. GitHub Release 发布流程

仅在所有发布阻断测试通过后执行。

步骤：

1. 确认工作区干净。
2. 确认全部必要修改已提交。
3. 确认最终 CI 通过。
4. 确认 Windows 和 Android 验收证据完整。
5. 确认许可证检查通过。
6. 确认发布资产可安装及运行。
7. 创建带说明的 Tag `v0.1.0-alpha.1`。
8. 推送 Tag。
9. 通过 GitHub CLI 创建 Pre-release。
10. 上传 Release 资产。
11. 下载所有 Release 资产进行 SHA-256 核验。
12. 检查 Release 状态、附件及下载入口。
13. 检查 README Release 链接。
14. 检查默认分支与 Release Tag 对应关系。
15. 输出最终交付报告。

参考命令：

`gh release create v0.1.0-alpha.1 --prerelease --verify-tag`

实际发布时使用完整的资产列表、标题与 Release Notes 文件，并检查每一步返回状态。

不得未经验证便使用 `--latest` 将 Alpha 宣称为稳定最新版。

不得发布成功后再悄悄改变已有 Tag 或资产。

---

# 22. 开发阶段与执行顺序

请按照以下阶段连续推进：

### Phase 0：环境与技术验证

- 审计环境。
- 检查权限。
- 检查依赖和许可证。
- 创建基础项目。
- 验证 MAUI + HybridWebView + Milkdown 在 Windows/Android 上可运行。
- 验证真实输入、选区和跨语言 Bridge。

### Phase 1：原生 Shell

- Windows Fluent。
- Android Material。
- Calendar。
- Tabs。
- Workspace。
- Settings。
- Local/Git Status UI。

### Phase 2：编辑器

- Milkdown Crepe。
- WYSIWYG。
- Markdown Extensions。
- Fold。
- Callout。
- Markdown Peek。
- 图片基础支持。

### Phase 3：数据层

- UUIDv7。
- Frontmatter。
- Sidecar。
- SQLite。
- 保存事务。
- 崩溃恢复。
- 本地搜索。

### Phase 4：链接和锚点

- 文档级链接。
- 块级链接。
- 选区级链接。
- W3C Selector。
- Yjs RelativePosition。
- Text Fragments。
- 失效修复。

### Phase 5：插件系统

- TypeScript SDK。
- Plugin Host。
- 权限机制。
- 示例插件。
- 插件模板。
- 插件生命周期测试。

### Phase 6：可靠性

- 单元测试。
- 集成测试。
- Windows 运行测试。
- Android 运行测试。
- 数据丢失与恢复测试。
- 安全测试。
- 性能记录。

### Phase 7：公开发布

- README。
- 文档。
- AGPLv3 许可。
- CI。
- Release 构建。
- 资产核验。
- GitHub Pre-release。
- 最终交付报告。

每个阶段发现问题必须修复并复测。

不要在阶段末只输出计划而停止后续实施。

---

# 23. 最终验收清单

全部项目必须有真实证据。

- [ ] GitHub 公开仓库创建成功。
- [ ] `main` 分支存在且工作区干净。
- [ ] Windows 应用真实可启动。
- [ ] Android 应用真实可启动。
- [ ] 日历是默认主页。
- [ ] 无笔记日期样式正确。
- [ ] 有笔记日期数量正确。
- [ ] Fluent / Material UI 正常。
- [ ] 标签栏与日期格式正确。
- [ ] Milkdown WYSIWYG 正常。
- [ ] Markdown Peek 三秒行为正确。
- [ ] 可恢复系统默认双击选词。
- [ ] GFM 正常。
- [ ] Directives 正常。
- [ ] Callout 正常。
- [ ] 折叠块正常。
- [ ] 所有持久对象 ID 为 UUIDv7。
- [ ] 块编辑后 ID 不变。
- [ ] 块移动后 ID 不变。
- [ ] 块折叠后 ID 不变。
- [ ] 文档链接可解析。
- [ ] 块链接可解析。
- [ ] 选区链接可解析。
- [ ] W3C 锚点保存与恢复正常。
- [ ] Yjs RelativePosition 在有效会话中正常。
- [ ] Text Fragments 表达与后备解析正常。
- [ ] 链接失效时不会静默误跳。
- [ ] Markdown 与 Sidecar 一致性检查正常。
- [ ] 自动保存和 Ctrl+S 正常。
- [ ] 异常退出恢复正常。
- [ ] SQLite 索引可以重建。
- [ ] 本地状态与 Git 状态独立。
- [ ] 官方工具栏通过 SDK 加载。
- [ ] 官方日历统计插件通过 SDK 加载。
- [ ] 插件禁用与卸载释放资源。
- [ ] 插件权限没有明显越权。
- [ ] 清空本机数据不会误删外部文件。
- [ ] README 包含完整产品简介。
- [ ] README 包含实际快速启动步骤。
- [ ] README 明确区分已实现和未来功能。
- [ ] 所有必要技术文档存在且与代码一致。
- [ ] AGPL-3.0-only 正确配置。
- [ ] 第三方许可证审计通过。
- [ ] Windows CI 通过。
- [ ] Android 构建 CI 通过。
- [ ] Windows/Android 实际运行验收通过。
- [ ] Release 资产重新下载并校验一致。
- [ ] Pre-release 可公开访问。
- [ ] Tag、Commit SHA、资产版本完全对应。

如果其中任何阻断项尚未完成，请继续修复。

如最终受环境、签名材料或外部权限阻塞，必须明确报告阻塞原因及已完成进度，保留工作成果，但**不能伪造完全验收成功，也不能绕过门禁发布**。

---

# 24. 最终输出格式

全部执行完成后，以中文提供一份简洁但证据充分的交付报告。

必须包括：

**A. 仓库与发布**

- GitHub Repository URL。
- Release URL。
- Release Tag。
- Final Commit SHA。
- License。
- 工作区状态。

**B. 功能交付**

逐项说明 v0.1 已实现的功能和实际限制。

**C. 测试与验收**

- 测试命令。
- 测试数量。
- 通过数量。
- 失败数量。
- Windows 设备与运行结果。
- Android 设备与运行结果。
- CI 运行 URL。
- 安全及许可扫描结果。

**D. 发布资产**

- 文件名。
- 文件大小。
- SHA-256。
- 下载 URL。
- 签名状态。
- 实际安装和运行结果。

**E. 文档**

- README。
- 架构文档。
- 数据格式。
- 链接协议。
- 插件 SDK。
- 安全说明。
- 路线图。

**F. 未完成项目**

明确区分：

- v0.1 未通过的事项。
- 环境限制。
- 已知非阻断缺陷。
- 已规划的 v0.2+ 功能。

不要用预计完成时间代替实际结果。

## 最终工程原则

GitPad+ 的首版成功标准不是拥有最多功能，而是证明：

**Markdown 可以可靠保存；UUIDv7 身份长期稳定；三级链接不会静默漂移；所见即所得编辑可靠；Windows/Android 都能实际运行；第三方插件能通过公开 SDK 扩展软件；AGPLv3 许可及 Release 具有可验证的工程证据。**

现在开始执行。优先完成环境审计和最小跨平台可运行原型，然后按照 Phase 0–7 连续推进至通过验收和公开 Pre-release。不要停留在规划或骨架阶段。
