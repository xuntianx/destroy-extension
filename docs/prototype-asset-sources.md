# 素材来源

记录日期：2026-09-22。以下素材仅用于「摧毁」动作小样。所有运行时资源随文件夹提供。

## 角色

- `assets/concept.png`：通过本会话的原生 imagegen 工具生成，模式为新图生成；一张完整角色概念图，没有参考上传图。本文件保存实际使用提示词。
- `rig.js`、`assets/monster.svg`：根据概念图由前端代码重新绘制的原创矢量角色，并拆分头、身体、手臂和尾巴关节。运行中的形象保留概念图的配色和造型方向，但不承诺逐像素相同。
- 没有使用哥斯拉影视画面、商标或第三方角色图；角色定位为原创卡通小巨兽。

实际生图提示词：

```text
Use case: stylized-concept. Asset type: character design reference for a layered SVG puppet in a browser game. Create ONE original adorable-but-fierce little kaiju, full body, on a plain very pale mint background. 2D flat vector cartoon style, thick dark pine-green outlines, minimal clean shapes easy to redraw as separate body parts, no texture, no 3D rendering. Three-quarter side view facing RIGHT. Broad blunt dinosaur snout, thick expressive angry eyebrows, small cream eyes with black pupils, two tiny visible teeth, squat pear-shaped dark sage green torso, pale warm cream segmented belly, chunky feet with 3 ivory claws each, short muscular arms with 3 ivory claws, thick curved tail extending to LEFT with 3 visible sections, 5 rounded triangular orange dorsal plates, tiny orange cheek mark. A serious determined little monster that is cute because of its exaggerated proportions, not babyish. Neutral standing pose, both arms distinguishable from torso, claws held slightly forward ready to strike. Head is about 40% of body height. All anatomy and tail completely inside the frame with generous empty margin. Crisp polished simple character silhouette, distinct joint boundaries. No text, no logo, no extra characters, no panels. This is a design reference, not a sprite sheet.
```

## 音效

来源：[Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)。作者 Kenney，素材包原授权为 Creative Commons Zero（CC0）；原始授权文件保存在 `assets/audio/License.txt`。读取与下载日期：2026-09-22。

原始包：[kenney_impact-sounds.zip](https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip)。授权说明：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。

| 打包文件 | 原文件 | 用途与处理 |
| --- | --- | --- |
| `assets/audio/claw.ogg` | `Audio/impactPunch_heavy_000.ogg` | 爪击主音；保留原 Ogg，播放音量 0.45 |
| `assets/audio/tail.ogg` | `Audio/impactWood_heavy_000.ogg` | 尾扫撞击；保留原 Ogg，播放音量 0.45 |
| `assets/audio/debris.ogg` | `Audio/impactPlank_medium_000.ogg` | 轻量碎片叠音；保留原 Ogg，播放音量 0.16 |

三段音频合计 29,866 字节，约 29.2 KiB。仅有撞击和碎片音效；没有怪兽吼声、吐息和配乐，也没有 AI 生成音频。正式插件的整套音频选择和 Opus / AAC 发布转码尚未在此小样执行。

音效随命中事件启动。当前通过页面按钮获取播放手势，未验证 Chrome 扩展全局快捷键触发的自动播放策略；不能用本页有声来推断 offscreen document 方案已经验证。
