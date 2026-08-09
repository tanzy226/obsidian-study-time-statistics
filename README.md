# Study Time Statistics

**English (this page)** · [中文完整版](README_zh.md) · [中文摘要](#中文摘要)

> This repository is documented in both English and Chinese. The English documentation appears first, followed by a Chinese summary on the same page.

Study Time Statistics is a privacy-first Obsidian plugin that measures how you study across notes and PDFs. It combines unobtrusive per-note metrics with an Anki-inspired analytics dashboard—without adding anything to your Markdown files.

![Dashboard overview built from anonymized real local data](assets/dashboard-overview.svg)

## Highlights

- Automatically track active reading time for Markdown notes and PDFs.
- Count opens and completed reading sessions per note.
- Show an inline statistics strip at the top of every note. It belongs to the view, scrolls away with the note, and never changes the source file.
- Display opens, total time, average time per visit, longest session, active days, current streak, and last read time.
- Explore day, week, month, year, and all-time statistics.
- Review a 365-day heatmap, 30-day time and session trends, hourly and weekday patterns, session-length distribution, folder summaries, and recent sessions.
- Rank notes by most opens, longest total reading time, longest average visit, longest single session, and most active days.
- Pause tracking when Obsidian is not focused by enabling Strict mode.
- Keep all statistics inside the local vault—no account, telemetry, advertising, or cloud upload.

![Inline note metrics using real values with the note title anonymized](assets/inline-note-statistics.svg)

## Real, anonymized example

The following snapshot was generated from real statistics stored by the plugin on 2026-08-10, with the owner's permission. Note titles, paths, folders, and contents were removed; only aggregate values remain.

| Note | Opens | Total | Average | Longest session |
| --- | ---: | ---: | ---: | ---: |
| Note A | 2 | 2m 15s | 1m 08s | 1m 37s |
| Note B | 2 | 29s | 15s | 27s |

Snapshot total: **2 notes**, **4 opens**, and **2m 44s** of recorded reading time. These values are a point-in-time example and will not update with the owner's vault.

## Open the dashboard

Select the bar-chart icon in the left ribbon, or open the Command Palette and run **Open Study Time Statistics**. The dashboard contains three sections: Leaderboard, Statistics, and Study Analytics.

## Installation

### Community Plugins

Community-directory publication is pending. Once listed, open **Settings → Community plugins → Browse**, search for **Study Time Statistics**, and select **Install**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.
2. Create `<vault>/.obsidian/plugins/study-time-statistics/`.
3. Copy the three files into that directory.
4. Restart Obsidian, then enable **Study Time Statistics** under **Settings → Community plugins**.

## Privacy and storage

All data stays under `.obsidian/plugins/study-time-statistics/` in your own vault. The plugin stores note paths and local study metrics needed for its charts. It does not send data over the network. The public screenshots and tables contain a permissioned, point-in-time snapshot of real aggregate values, but every note title, path, folder, and content field has been removed or replaced with an anonymous label.

## Development

```bash
npm install
npm test
npm run build
```

The production build generates `main.js`. A GitHub release must include `main.js`, `manifest.json`, and `styles.css`, with a tag matching the version in `manifest.json` exactly.

## Compatibility

- Obsidian 1.4.0 or later
- Desktop and mobile manifests are supported; background-focus behavior depends on the operating system

## Credits and license

Study Time Statistics is an independent plugin inspired by Anki's statistical presentation. It is not affiliated with or endorsed by Anki.

The codebase is derived from [AstraDev's open-source Obsidian time tracker](https://github.com/astradev123/obsidian-focus-time), used under the Apache License 2.0. Original copyright notices and license terms are preserved. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

---

## 中文摘要

Study Time Statistics（学习时间统计）是一款本地隐私优先的 Obsidian 插件，用来统计 Markdown 笔记和 PDF 的有效阅读时间、打开次数、平均每次阅读、最长单次阅读、活跃天数和连续学习天数。每篇笔记顶部的统计条属于界面层，会随正文滚动消失，不会写入或修改 Markdown 原文。

仪表盘提供日、周、月、年和全部时间范围，并包含 365 天热力图、近 30 天趋势、时段与星期分布、会话时长分布、文件夹汇总、最近会话，以及按打开次数、累计阅读、平均阅读、最长单次和活跃天数排列的榜单。

上方图片和表格使用插件在 2026-08-10 保存的真实统计快照：共 **2 篇笔记、4 次打开、累计 2 分 44 秒**。公开材料仅保留统计数值，真实笔记标题、路径、文件夹和正文均已删除，并统一替换为“Note A / Note B”。

所有学习数据仅保存在本地库的 `.obsidian/plugins/study-time-statistics/` 中，插件不上传数据、不收集遥测、无广告，也不需要云端账户。完整中文说明见 [README_zh.md](README_zh.md)。
