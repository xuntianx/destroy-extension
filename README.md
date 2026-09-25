# Destroy

更新时间：2026-09-25。当前版本：**0.1.2 开发版**，正在按 [产品方案 v1.2](docs/product-plan-v1.2.md) 实现。中英文名称均为 Destroy，回答提交按钮均为 Done；包含生成式火焰图标、本地字体和精简浮层。此仓库是可独立安装、构建和测试的 Chrome 插件工程。

按 Alt + Shift + D（macOS 为 Option + Shift + D）召唤卡通小巨兽。它从当前视口开始破坏页面，自动向下推进；回答一个问题后，恢复本轮修改过的原节点，回到原位置，随后睡眠退场。


## 直接安装

无需 Node.js：[前往 Releases 下载 0.1.2 体验包](https://github.com/xuntianx/destroy-extension/releases/tag/v0.1.2)。解压安装包，在 Chrome 的 `chrome://extensions` 打开开发者模式，选择「加载已解压的扩展程序」，选中包内的 `destroy` 文件夹。保留这个文件夹，以便 Chrome 继续读取资源。

更新后重新加载扩展并刷新网页。项目源码包用于开发，体验安装包用于直接安装；当前尚未上架 Chrome 商店。完整步骤见 [安装说明](docs/installation.md)。
## 开发与构建

前置条件：Node.js 22.12 或更新的受支持版本、npm。Windows PowerShell、macOS / Linux 的终端均在本项目目录执行：

```text
npm ci
npm run check
npm run package
```

- `npm test`：运行状态机、答案校验、题库、页面效果所有权和音频会话／循环测试。
- `npm run build`：TypeScript 检查及 Vite 构建；可加载扩展位于 `dist/`。
- `npm run package`：构建并生成 `artifacts/destroy-0.1.2.zip`。
- `npm run dev`：本地开发服务器，访问 `/tests/fixtures/article.html` 检查长网页流程。
- `npm run fixture:build`：生成固定测试页构建，避免开发热更新中断会话；产物在 `artifacts/fixture/`。

开发服务器或固定测试页服务的 `/tests/fixtures/typography.html` 提供原文／静止切片／碎裂／排版测量对照，包含混排、Web 字体、内嵌图片、伪元素、双向文字和 Canvas。`/preview.html` 可试听全部配乐和音效；扩展设置面板也提供试听入口。音频来源及可选转码步骤见 [asset-sources.md](docs/asset-sources.md)。

试听页的「素材与许可 → 检查本地音频」会显示压缩文件体积、实际解码采样率、PCM 字节数和当前混音器缓存。正式混音器的 PCM 缓存上限为 64 MiB，最多并行解码两个文件；检查结果不包含 Chrome 进程和解码器临时内存。

`/tests/fixtures/motion.html` 提供同一只角色的登场、爪击、尾扫、吐息和睡眠检查，可逐帧拖动、查看关键帧、左右翻转，并测量原地动作的脚部偏移。该页复用实际插件的 SVG 与动作轨道。可编辑 SVG、关节与事件标记见 [角色说明](docs/character-design.md)；`npm run character:export` 导出独立 SVG，正式构建也会执行。

文章验收页支持 `?layout=short` 单屏样例和 `?layout=container` 独立滚动容器样例。页面在会话启动前注册原站点事件计数器，可检查答题时是否误触网页操作，以及恢复后原事件是否仍可用。

0.1.2 新增 `?layout=short&coverage=1` 检查空卡片、背景、边框、阴影、伪元素及答题期间新加载的内容；`?layout=short&navigation=1` 在启动后模拟 hash 路由跳转，检查安全恢复。正常导航和滚动容器替换使用 info 记录原因，不再显示笼统的 Page changed 警告；浮层或答题 iframe 被移除仍作为异常报告。

`/tests/fixtures/isolation.html` 对照 Shadow DOM 与跨来源 iframe 的事件捕获、回答读取和全屏焦点。正式代码已将交互控件迁入扩展页 iframe；文章验收页通过两个本地 HTTP 来源运行同一套实现，并提供 `?layout=short&ui=missing` 检查加载失败后的清理。真实 Chrome 扩展来源仍待实装验证。结果见 [input-isolation-experiment.md](docs/input-isolation-experiment.md)。

安装步骤见 [installation.md](docs/installation.md)。完整功能是否通过测试，以 [acceptance-report.md](docs/acceptance-report.md) 的证据为准，不能仅凭构建成功推断可发布。

Chrome 实装请使用 `/tests/fixtures/extension-host.html` 这个普通网页，并按 [实装验收单](docs/chrome-acceptance.md) 检查。它不运行本地演示或模拟扩展 API，避免把测试按钮成功误当作实际扩展集成通过。

## 当前实现

用户已反馈召唤、声音和默认快捷键可用。当前重点是视觉迭代：用户认为初版吐息不好看，已增加独立 Claude Code 审查者 [.claude/agents/effects-reviewer.md](.claude/agents/effects-reviewer.md)，将审美单独验收；有声音不等于听感通过，功能正常也不等于视觉通过。

2026-09-23：已完成四轮独立评审与迭代，Claude Code给出**视觉与审美OK，整体8/10**。吐息已重做火舌、白芯、张口、退场和朝向，废墟、归位、睡眠连贯性已修复；总效果结论仍待一次完整流程人工试听。详见[评审原文与修改记录](docs/reviews/2026-09-22-claude/README.md)。

- Manifest V3、默认快捷键、工具栏面板、`activeTab` 临时授权与按需注入。
- 中文／英文设置、音量设置、本地 50 题不重复抽取；回答不发送、不持久保存。
- 斜向喷射火焰图标，响应式 540–720px 问答浮层（窄屏自适应），输入区最小高度 160–240px；背景保持透明，原网页底色不变。
- 卡片装饰与内容分开处理，收尾吐息移除背景、边框、阴影和伪元素，恢复时仅取消插件自己的动画。全屏背景容器保留底色；收尾和等待回答期间重新收集后加载内容，不隐藏整个 body。
- 原节点保留，Web Animations API 独立透明效果，按真实文本行分组的局部 DOM 克隆碎片，所有权明确的清理与恢复。内联 SVG 支持静态图形、渐变、裁切和自身内部引用，碎片各自持有独立定义，行内图标不会直接丢失。
- 模态 dialog 操作锁、扩展来源 iframe 交互界面、私有 MessagePort 控制通道、有效回答门槛、自动滚动、6 屏／60 秒预算、收尾吐息、快速恢复；角色和碎片仍在 Shadow DOM 中。
- 基于既有 AI 概念图重绘的 SVG 角色，爪击、尾扫以及初版入场、吐息、睡眠程序动画。
- 固定地面线与左／中／右攻击带编排，只横向换位；页面向上送入下一批目标，实际爪尖／尾尖接触后碎裂。吐息从嘴部锚点发出，有限数量的原网页碎片保留在地面。
- offscreen 音频宿主、五阶段配乐、16 类动作音效（26 个 CC0 Opus 文件）、交叉淡化、过期音效丢弃、会话隔离和独立音量控制。音频约 1.09 MB；**主观听感、全新配置首次快捷键音频及离屏生命周期仍待真实扩展验证**。
- 爪击、尾扫和吐息使用同一前台动画时钟的短期音效计划，提前最多 120 ms 发给音频宿主，按 AudioContext 时钟播放；静音／暂停会取消待播音效，恢复只安排未来的动作。
- 后台按标签页串行更新会话凭据，校验通过后才接受音频状态；旧会话迟到消息、关闭时仍在等待的消息不能覆盖新会话。宿主查询与创建共享同一个进行中的请求，转发前重新检查暂停状态。

本地测试页运行相同 Session 与 AudioMixer 代码，但消息通过开发适配器直接传给页面中的混音器。它只证明网页逻辑，不替代扩展权限、Service Worker、离屏音频和快捷键的集成验证。

## 目录

`src/background` 接收快捷键并注入内容脚本；`src/content` 管理真实网页与角色；`src/overlay` 提供隔离的声音与回答界面；`src/offscreen` 承载音频宿主，`src/audio` 提供共享混音器与试听页；`src/popup` 提供双语设置；`src/shared` 放状态机与题库。`docs/` 保存来源方案、素材记录、兼容性与验收进度。

## 数据与权限

权限仅 `activeTab`、`scripting`、`storage`、`offscreen`。不申请全站常驻访问、浏览历史、网络拦截或 debugger。所有运行资源本地打包。设置与题目 ID 历史写入 `chrome.storage.local`，会话音频 token 写入 `chrome.storage.session`；用户回答只用于本页非空白校验，提交后立即清空。

仅 `overlay.html` 声明为可嵌入网页的扩展资源。回答在子页验证并清空，私有通道只发送控制类型与会话标识，不发送回答文本；原网页的 window 消息不作为完成信号。初始化超过 8 秒或界面意外导航／移除时清理会话，不退回存在事件捕获泄漏的输入方式。

界面就绪后，私有通道持续确认它仍能响应；持续失联会进入异常清理。正常等待回答没有截止时间，不把“没回答”当成故障；切到后台会暂停响应检查，回到前台发起新检查。`?layout=short&ui=unresponsive` 是测试页专用的失联故障入口，不进入安装包。

不通过删除 DOM、覆盖原 HTML、整页截图或刷新完成恢复。网站自己删除的节点不会被重新插回。浏览器自身的刷新、地址栏、关闭和切换标签不被阻止。
