# 界面字体与图标来源

更新时间：2026-09-25，适用于 Destroy 0.1.2。

- 中文固定界面与题目：Adobe Source Han Sans CN（思源黑体），官方来源 `https://github.com/adobe-fonts/source-han-sans`。使用 400–600 字重的变量字体子集，衍生字体重命名为 Destroy Han。
- 英文：Google Fonts 仓库收录的 Manrope，来源 `https://github.com/google/fonts/tree/main/ofl/manrope`。使用拉丁字符与通用标点子集、400–600 字重，衍生字体重命名为 Destroy Manrope。没有使用作者网站另行许可的新版本。
- 两份原始 OFL 许可保存在 `public/assets/fonts/*-LICENSE.txt`，下载地址、源文件与生成文件 SHA256 和体积记录在同目录 `sources.json`。字体仅从扩展本地资源加载，无远程字体请求。
- 中文子集覆盖当前 50 题及固定 UI 文案。自由输入使用系统中文字库兜底，避免任意输入缺字；修改固定文案或题库后应重新制作子集。

正常构建不需要 Python，直接使用已提交的 WOFF2。重新制作时需 Python 3.10+，在独立虚拟环境安装 `fonttools[woff]` 和 `brotli`，执行 `python scripts/prepare-fonts.py`（macOS/Linux 也可用 `python3`）。脚本以项目相对目录读取文案，修改后应核查来源与输出哈希。本次仅 Windows 实际执行。

火焰图标于 2026-09-25 使用内置 imagegen 重新生成，0.1.2 改为从左下向右上喷射的火焰，替换之前竖直燃烧的版本。生成原图保留在 `docs/brand/flame-generated.png`，完整提示见 [生成记录](brand/flame-prompt.md)。仅使用 Sharp 缩放输出 16/32/48/128px PNG，保留 alpha；成品位于 `public/assets/icons/`，同时配置在 manifest 的扩展图标和工具栏图标中。它不是外部下载的品牌标识。
