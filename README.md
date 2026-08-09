# Study Time Statistics

[中文说明](README_zh.md)

Study Time Statistics is a privacy-first Obsidian plugin that measures how you study across notes and PDFs. It combines unobtrusive per-note metrics with an Anki-inspired analytics dashboard—without adding anything to your Markdown files.

![Dashboard overview with synthetic example data](assets/dashboard-overview.svg)

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

![Inline note metrics that scroll with the document](assets/inline-note-statistics.svg)

## Example

The following values are deliberately synthetic and do not come from a real vault:

| Note | Opens | Total | Average | Longest session |
| --- | ---: | ---: | ---: | ---: |
| Statistics Basics | 12 | 2h 18m | 11m 30s | 27m |
| Research Methods | 8 | 1h 44m | 13m | 31m |
| Academic Writing | 6 | 1h 12m | 12m | 24m |

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

All data stays under `.obsidian/plugins/study-time-statistics/` in your own vault. The plugin stores note paths and local study metrics needed for its charts. It does not send data over the network. The screenshots and tables in this repository use synthetic examples only.

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

