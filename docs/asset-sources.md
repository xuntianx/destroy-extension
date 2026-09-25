# 资源来源与交付状态

2026-09-25 补充：0.1.1 新增的本地字体、许可与生成式火焰图标见 [字体与图标来源](font-sources.md)。原始生图保留在 `docs/brand/`，图标尺寸衍生物保留在 `public/assets/icons/`。

记录时间：2026-09-22。角色来源详见 [前置动作小样的来源记录](prototype-asset-sources.md)，该记录属于当时证据，其中的小样相对路径按原小样理解。

- `docs/character-concept.png`：本会话 imagegen 生成的原创角色概念图。
- `src/content/rig.js`：根据概念图用代码重绘的可编辑 SVG，包含部件、轴心、爪尖／尾尖坐标、爪击和尾扫关键姿势。入场、吐息、恢复姿势与睡眠初版编排在 `session.ts`。
- `tests/fixtures/landscape.svg`：本工程用代码绘制的测试图，无外部素材依赖。

## 当前音频（2026-09-22）

首版使用现成 CC0 素材。没有调用 AI 音频生成，也没有购买素材。所有运行时音频已经转为 Opus；共 26 个文件、1,087,066 字节，构建限制为 3,000,000 字节。选曲和音量属于可试听的初版，主观听感与真实扩展音画延迟尚未验收。

| 来源 | 作者 | 采用内容 | 授权依据 |
| --- | --- | --- | --- |
| [Short Loops Background Music Pack](https://opengameart.org/content/short-loops-background-music-pack) | hernandack | Swinging Sweet、Winter Dust、A Brand New Wisdom | 来源页 CC0；发布于 2018-12-11 |
| [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) | rubberduck | roar_02、breath、snore | 来源页 CC0；发布于 2018-07-01 |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | 拳击、木块撞击、碎片，各两种变体 | 原包 License-impact.txt |
| [RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney | 挥动、翻纸，各两种变体 | 原包 License-rpg.txt |
| [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) | Kenney | 蓄力、喷射吐息、爆破 | 原包 License-scifi.txt |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | 提问、确认、归位两种变体、收尾重音 | 原包 License-interface.txt |

配乐五个阶段均由同一作者、同一素材包衍生：登场截取 Swinging Sweet 前 1.8 秒；破坏使用完整 Swinging Sweet；废墟使用 Winter Dust；重建使用 A Brand New Wisdom；睡眠截取 A Brand New Wisdom 前 3.3 秒并淡出。短句不循环；三段背景音乐由两个音源交叉淡化循环（当前 120 ms），切阶段时旧音源在 250 ms 内结束。交叉淡化只能处理接缝，和声、节拍与情绪是否合适仍需试听判断。

逐文件原始下载地址、包内名称、作者、处理参数、校验值、体积和许可在 [audio-sources.json](audio-sources.json)。原包自带授权文件随 `public/assets/audio/` 一起提供；两个 OpenGameArt 包的来源页许可字段摘录见 [audio-license-evidence.md](audio-license-evidence.md)。关于页同时列出三位作者。

正常构建直接使用已提交的压缩音频，无需 FFmpeg。需要重新选材或转码时，在项目目录执行 `python scripts/prepare-audio.py`（部分 macOS / Linux 环境用 `python3`）；要求 Python 3.10+、可通过 PATH 调用的 FFmpeg / ffprobe、FFmpeg 包含 libopus。脚本把来源包缓存在被 Git 忽略的 `artifacts/audio-sources/`，不打包无损母版。本轮在 Windows 实际运行；其它系统只做路径与命令兼容设计，未实机执行。

试听入口为 `preview.html`，包含五阶段配乐、16 类动作音效、暂停／继续、三个独立音量滑块，以及实际浏览器解码检查。插件与试听页复用 `src/audio/mixer.ts`。音频缺口仍按“先找素材，找不到再询问用户”的规则处理。

恢复页面使用的 `assemble` 事件现包含 `maximize_001.ogg` 和 `maximize_002.ogg` 两种独立素材，连续触发避开上一种；试听页重复点击「归位」可对照。只重新处理某个素材时可运行 `python scripts/prepare-audio.py --only assemble1`，保留其他音频文件和来源记录；完整重建入口保持不变。

## 技术参考

本轮核对 [Chrome offscreen 文档](https://developer.chrome.com/docs/extensions/reference/api/offscreen) 与 [scripting 文档](https://developer.chrome.com/docs/extensions/reference/api/scripting)，读取日期 2026-09-22。离屏音频静默后可能销毁，因此后台使用 getContexts 检查并串行创建宿主；这只是实现依据，运行情况仍须实测。

## 文字保真测试字体

`tests/fixtures/fonts/Gelasio.ttf` 为未修改的 Gelasio 可变字体，仅供测试页使用，不进入正式插件包。2026-09-22 从 [Google Fonts 仓库](https://github.com/google/fonts/tree/main/ofl/gelasio) 获取；作者与版权为 The Gelasio Project Authors，采用 SIL Open Font License 1.1，原始许可与逐文件下载地址、SHA-256 放在同目录 `OFL.txt` 与 `sources.json`。固定测试页构建同时复制许可文件。该字体用于验证宿主文档 Web 字体在 Shadow DOM 局部副本中的显示，不代表微信公众号、知乎或英文博客已经实测。
