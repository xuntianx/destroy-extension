# 安装与使用（开发版）

更新时间：2026-09-25。0.1.2 是本地开发版，不是 Chrome 商店发布版。中英文名称统一为 Destroy，图标为斜向喷射的橙金色火焰。待测项见验收报告。

1. 使用源码时，在项目目录执行 `npm ci`、`npm run build`；使用安装包时，先解压 `destroy-0.1.2.zip`。分享包请选择解压后的 `destroy` 子目录。
2. 在 Chrome 打开 `chrome://extensions`，开启开发者模式。
3. 点击「加载已解压的扩展程序」，选择含有 `manifest.json` 的 `dist` 目录，或安装包解压后的根目录。
4. 打开普通文章网页，用 Alt + Shift + D 召唤（macOS：Option + Shift + D），也可以打开扩展面板点击召唤按钮。
5. 长页自动向下推进，破坏后必须输入非空白回答并点击 Done 才能恢复。输入「不知道」也可以；不做正确性或情绪评分。

默认组合被其他扩展占用时，面板会显示实际绑定情况。点击快捷键一栏可进入 `chrome://extensions/shortcuts` 修改。macOS 与 Linux 的操作步骤按 Chrome 跨平台界面编写，本轮尚未实机验证。

更新本地构建后，需要在扩展管理页点击刷新扩展，再刷新待测试网页，避免旧内容脚本留在页面中。刷新会终止旧会话，这是浏览器行为，不是插件提供的跳过按钮。

Chrome 内置页、扩展页、Chrome 商店、已有模态 dialog、全屏页面和无法确定主滚动区的页面会拒绝启动。文件地址需要用户在扩展详情中允许访问文件网址；普通 HTTP / HTTPS 页面不需要此设置。

真实扩展优先使用随源码提供的普通长页 `/tests/fixtures/extension-host.html`，具体步骤见 [Chrome 实装验收单](chrome-acceptance.md)。`/tests/fixtures/article.html` 的按钮会启动本地演示，不能用它证明扩展已加载。只打包本地资源，安装包不包含开发服务器或题目回答。
