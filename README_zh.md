# Study Time Statistics（学习时间统计）

[English](README.md)

Study Time Statistics 是一款注重隐私的 Obsidian 学习时间统计插件。它会统计你阅读每篇笔记和 PDF 的投入，并把单篇笔记数据与参考 Anki 统计结构设计的完整仪表盘结合起来，同时绝不向 Markdown 原文写入任何内容。

![使用虚构示例数据的仪表盘](assets/dashboard-overview.svg)

## 主要功能

- 自动统计 Markdown 笔记和 PDF 的有效阅读时间。
- 记录每篇笔记的打开次数和已完成阅读会话。
- 在每篇笔记顶部显示统计条。统计条属于阅读界面，会随着笔记一起向上滚动并消失，不固定悬浮，也不会修改 Markdown 原文。
- 单篇笔记显示：打开次数、累计阅读、平均每次、最长单次、活跃天数、当前连续天数和最近阅读时间。
- 查看日、周、月、年和全部时间范围的数据。
- 提供过去 365 天学习热力图、近 30 天时长与会话趋势、24 小时分布、星期分布、单次时长分布、文件夹汇总和最近会话。
- 提供五类排行榜：打开次数最多、累计阅读最长、平均每次最长、最长单次阅读、活跃天数最多。
- 严格模式下，Obsidian 窗口失去焦点时暂停计时。
- 所有统计均保存在本地库中：无需账号、无遥测、无广告、无云端上传。

![会随正文滚动的笔记顶部统计条](assets/inline-note-statistics.svg)

## 示例

下面的数据完全为虚构示例，不来自任何真实笔记库：

| 笔记 | 打开次数 | 累计阅读 | 平均每次 | 最长单次 |
| --- | ---: | ---: | ---: | ---: |
| 统计学基础 | 12 | 2小时18分 | 11分30秒 | 27分 |
| 研究方法 | 8 | 1小时44分 | 13分 | 31分 |
| 学术写作 | 6 | 1小时12分 | 12分 | 24分 |

## 打开仪表盘

点击左侧边栏的柱状图图标，或者打开命令面板并运行 **打开学习时间统计**。仪表盘包含“排行榜”“学习数据”和“学习分析”三个部分。

## 安装

### 社区插件市场

社区目录正在申请收录。收录后，可打开 **设置 → 第三方插件 → 浏览**，搜索 **Study Time Statistics** 并安装。

### 手动安装

1. 从最新 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 新建 `<你的库>/.obsidian/plugins/study-time-statistics/`。
3. 将三个文件复制到该目录。
4. 重启 Obsidian，然后在 **设置 → 第三方插件** 中启用 **Study Time Statistics**。

## 隐私与数据位置

全部数据只保存在你自己的库内，位置为 `.obsidian/plugins/study-time-statistics/`。插件会存储绘图所需的笔记路径与本地学习指标，但不会通过网络发送数据。本仓库的图片与表格全部使用虚构示例，不包含用户的真实笔记名或统计数据。

## 开发与测试

```bash
npm install
npm test
npm run build
```

生产构建会生成 `main.js`。GitHub Release 必须附带 `main.js`、`manifest.json` 和 `styles.css`，并且标签必须与 `manifest.json` 中的版本号完全一致。

## 兼容性

- Obsidian 1.4.0 或更高版本
- 清单支持桌面端与移动端；后台焦点行为会因操作系统而异

## 致谢与许可证

Study Time Statistics 是一款独立插件，其统计展示受到 Anki 启发，但与 Anki 官方没有隶属或合作关系。

本项目基于 [AstraDev 的开源 Obsidian 计时项目](https://github.com/astradev123/obsidian-focus-time)继续开发，并遵守 Apache License 2.0。原始版权声明与许可证条款均予保留，详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。

