# GitPad+

本地优先的 Markdown 日记与笔记项目。产品愿景包括原生日历、Fluent/Material 界面、所见即所得编辑、稳定的文档/块/选区链接、Git 版本管理与插件生态。

**当前为面向 `v0.1.0-alpha.1` 的开发版本，尚未发布。** 没有经过验收的 Windows 安装包或 Android Release APK。不要将本开发版本作为重要笔记的唯一副本。

目前可独立验证的是 .NET 文件/SQLite 数据层和浏览器编辑器集成：创建多篇日记、保存重载、全文搜索、Milkdown 编辑、三秒原始源码窥视、未知 Directive 保留、插件工具栏和数据清理确认。MAUI/WinUI/Android 原生壳已编写，原生运行验收与 Android 发布签名仍未完成。

开发命令、架构与愿景见 [英文主页](README.md)。真实验证记录及未完成事项见 [验收报告](docs/acceptance/v0.1.0-alpha.1.md)。Linux 云环境不安装 Windows/Android SDK，不保留开发服务器；浏览器测试自行启动和关闭临时服务。项目尚未提供经过验证的用户安装步骤或原生截图。

Markdown 和 Sidecar 是持久数据，SQLite 可重建。外部文件变更会触发保守的恢复提示；交互式修复尚未完成。Git 当前始终显示 `NotConfigured`，没有远端同步。

许可为 **AGPL-3.0-only**。第三方组件保持各自许可，使用者的日记内容不会仅因使用 GitPad+ 自动采用 AGPL。欢迎根据 [贡献指南](CONTRIBUTING.md)提交代码、测试与真实平台验收记录。
