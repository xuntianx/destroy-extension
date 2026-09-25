# 输入隔离对照与接入方向

记录时间：2026-09-22。环境：Windows、Codex 内置 Chromium，父页面 `127.0.0.1:8771`，子页面 `localhost:8771`。这是两个本地 HTTP 来源的浏览器试验，不是已加载 Chrome 扩展的结果。正式代码已接入 dialog + iframe 交互界面；角色和碎片保留在 Shadow DOM。本页分别记录对照试验、接入结果与未验证项。

## 为什么需要这次对照

当前 `containOverlayInput` 能阻断冒泡事件，但网页先注册的 window／document 捕获监听已经收到输入，无法事后撤回。仅靠增加 stopPropagation 不能满足所有网页都不能被答题操作误触的要求。Chrome 文档也区分了内容脚本的 JavaScript 隔离与共同操作页面 DOM 的能力；同一个 DOM 元素的页面监听仍会执行。[Chrome 内容脚本文档](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#isolated_world)

## 可重复入口

在项目目录执行 `npm run dev`，打开 `/tests/fixtures/isolation.html`。或者执行 `npm run fixture:build`，用静态 HTTP 服务提供 `artifacts/fixture/` 后访问相同路径。服务器需同时可通过 `127.0.0.1` 与 `localhost` 访问；不要以 file URL 打开这个跨来源对照。

页面在两个输入界面创建之前，分别为 window／document 注册捕获和冒泡的 keydown、keyup、input、click 计数器。左侧复用正式代码的事件阻断和答案校验；右侧把答题控件放在不同来源的 iframe，复用同一非空白校验。计数器不保存回答文本。

## 实际观察

| 项目 | Shadow DOM | 跨来源 iframe |
| --- | --- | --- |
| 按键和填入文本后，window／document 捕获计数 | keydown、keyup、input 各增加 1 | 均为 0 |
| 对应冒泡计数 | 均为 0 | 均为 0 |
| 父页面直接访问答题输入框 | 可读 | 被同源策略阻止 |
| 有效提交 | 本地清空 | 本地清空后只发送 channel、kind 两个字段 |

父页面自行 postMessage 伪造完成信号没有被接受；合法 iframe 提交后只接受 1 次完成信号。接收方同时核对浏览器生成的消息事件、来源窗口、来源 origin、会话 channel 和允许的字段。

全屏模式把 iframe 放进 top-layer 模态 dialog。首次进入时父文档 activeElement 为 IFRAME；实际连续按 x、Tab、Tab、Shift+Tab、Escape 后仍保持在 iframe，父页面 16 个事件计数器全部为 0。这个模式计数所有父页面输入，不仅计数 iframe 元素路径。试验中发现原生 Tab 会离开答题区域，因此子页增加了输入框／有效提交按钮之间的焦点循环。

空格、换行和 Tab 构成的回答不能提交；Escape 不关闭 dialog。有效中文回答后完成信号数为 1、dialog 关闭、消息中不含回答。真实中文输入法组合事件尚未实机验证，文本填入不作为 IME 验收。

## 接入方向

已将全部用户交互表面迁入扩展来源 iframe，包括声音按钮、问题、答案输入和空白区域的指针拦截。原 DOM 测量、隐藏／恢复、碎片和角色仍由内容脚本负责，保留现有视觉与页面状态机制。只移动问答卡片不足以隔离破坏阶段的点击与按键。

输入框中的回答在子页校验并立即清空，只回传经过来源校验的完成信号；状态机仍要求处于 AWAITING_ANSWER 才能开始恢复。父页面不接收答案文本。加载失败、iframe 被移除等情况必须走已有异常清理，不留操作锁；不能悄悄退回已知存在捕获泄漏的输入表面。

扩展页面需要声明为 web-accessible resource 才能被网页导航加载。这会暴露指定资源，不能把整个扩展包列为通配资源；具体 iframe 文档与依赖资源应按最小清单处理。[Chrome Web Accessible Resources 文档](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources)

## 正式代码的本地接入验证

`overlay.html` 是唯一声明为 web-accessible resource 的文档。内容脚本通过一次初始化消息转移 MessagePort；后续只接受该端口上具有正确会话标识、正确类型且无额外字段的信号。原网页 window.postMessage 不进入控制通道。答案只在子页验证和清空；状态机再次检查只有必答阶段能接受完成信号。

浏览器实际验证发现：先加载 iframe、后 showModal 会使输入框显示但无法聚焦。改成先打开 dialog，再加载 iframe 并等待 ready，修复了该顺序问题。加载等待期间同样拦截 Escape。超过 8 秒未初始化会移除界面并恢复页面，不静默降级。

短页使用正式 Session 和 overlay 代码：空白回答不能提交；Escape 不关闭；Tab／Shift+Tab 在声音按钮、输入框及有效提交按钮间循环。输入中文、切换声音、提交后，原网页 window／document 的 keydown、keyup、input、click 捕获计数及 document 冒泡计数均未增加。点击基线均为 1，键盘和输入计数始终为 0。恢复后覆盖层 0、overflow 为空、滚动回到 0，草稿保留。`?layout=short&ui=missing` 的 404 子页在初始化超时后移除，原页面可操作。

新增 7 项单元测试验证通道字段／类型、旧会话拒绝、初始化前控制拒绝、window 伪造信号无效、超时／导航／关闭／解码失败、取消后的清理，以及状态机只接受一次必答完成信号。合计 54 项测试通过。单元测试不证明浏览器事件隔离或 Chrome 扩展来源行为。

## 仍需证明

- 真实扩展 URL、资源声明、目标网站 CSP 和多来源嵌入能否完成初始化。
- 全屏透明 iframe 在真实网站上的层级、滚动、焦点保持与真实中文输入法组合过程。
- 子页导航／移除、扩展更新在真实浏览器生命周期下不能留下操作锁；单元测试与本地加载超时已测的范围见上文。
- iframe 不改变 Chrome 默认快捷键和 offscreen 音频宿主的实际行为。

浏览器工具拒绝访问 Chrome 扩展管理页，现阶段需要用户手动加载开发版后继续真实扩展验证；不得通过其他方式绕过该工具限制。这个限制与本地跨来源 iframe 已通过的结果分别记录。
