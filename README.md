# 书脉

> 读得清脉络，记得住来处。

[English README](./README.en.md)

书脉是一个面向深度阅读的本地优先阅读器原型。它不只负责把书打开，更关注读者在长篇阅读里最容易遇到的问题：人物太多、关系记不住、时间线混乱、地点和事件前后断裂，以及看到某段文字时无法快速回到出处和上下文。

项目当前优先打磨桌面端体验：安静、干净、阅读优先。AI 以 Memory Engine 为核心决策层，用 ContextCite 做原文定位与证据回链，把能力做成阅读过程里的自然辅助，而不是复杂的外部仪表盘。

## 核心能力

- **本地书架**：管理本地图书、类型筛选、阅读进度和最近阅读位置；封面优先的书架浏览。
- **EPUB / PDF / MOBI 阅读**：本地解析、目录跳转、高度感知分页（避免裁切与半页空白）、阅读进度按书恢复；EPUB / MOBI 正文插图保留在阅读流中。
- **续读恢复**：离开一段时间后回来，优先恢复「读到哪、该先想什么、当前页依赖什么」；主动回忆题基于已读证据中的具体情节，书无关、不剧透。
- **Memory Engine**：按书类型自适应提取实体、时间线、话题、论证、情节与读者记忆；增量分析只处理已读范围。
- **选文解惑**：选中文字后按意图解惑（书内出处 / 词条简介 / 深意阐释 / 概念释义 / 前后因果），支持快速与深思两档；结果可持久化，原文打「解」标，长悬停预览、可删除。
- **书签与笔记**：本地保存；笔记在选区底部画线，侧栏先展示选中原文再展示出处。
- **证据回链**：AI 结论尽量保留原文位置，搜索定位原文（非回忆）。
- **关系可视化**：有可靠关系证据时提供关系图等视图（左栏工作区）。
- **阅读主题**：素笺、荷花、香茗、兰花、花枝、竹林等雅淡主题。

## AI 设计原则

1. **Memory 优先，检索其次**：先决定此刻该回忆什么，再用 ContextCite 定位原文。
2. **只分析已读内容**，避免剧透未读章节。
3. **书无关**：不为某一书名写死实体列表、年份范围或提示模板。
4. **增量分析**：继承上次 Book Memory，只补充新增已读内容。
5. **结论可回查**：弱证据宁可不输出，也不编造。

## 当前支持格式

可直接阅读：

- EPUB（含正文插图）
- PDF（文本层）
- MOBI / AZW / AZW3（非 DRM；基于 foliate-js）

导入入口已预留、解析仍在完善的格式：TXT、HTML、RTF、DOC/DOCX、FB2、DjVu、CBZ/CBR 等。

## 技术栈

- React 19 + Vite 6
- Express（本地 AI API）
- LangChain + DeepSeek / OpenAI
- JSZip EPUB 解析；PDF.js；foliate-js MOBI / AZW / AZW3
- React Flow / Dagre；PixiJS（能力树实验）
- LocalStorage + IndexedDB（书架与阅读状态，仅本机）

## 本地运行

```bash
npm install
npm run dev
```

默认同时启动：

- 前端：`http://localhost:5173`
- 本地 AI API：`http://127.0.0.1:8787`

```bash
npm run build
npm run preview
```

## AI 配置

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
```

默认分析模型：DeepSeek `deepseek-v4-flash`。续读恢复卡默认 DeepSeek `deepseek-v4-pro`（thinking）。API Key 只从本机 `.env` 读取，不会进仓库或浏览器打包配置。

## 隐私与仓库边界

以下内容**只留在本机**，不应提交到 Git：

- `.env` 与 API Key
- `books/`、`public/books/` 本地书文件
- 浏览器 IndexedDB / LocalStorage 中的书架、笔记、解惑记忆、分析 Memory
- 本地调试截图、评测产物、npm 缓存等

示例书请自行放入本地 `books/`（已被 `.gitignore` 忽略）。

## 项目结构

```text
smart-reading/
├── constitution/          # 使命、技术栈、路线图、功能规格
├── docs/                  # 产品 UI/UE 约定
├── books/                 # 本地书（不入库）
├── public/
├── scripts/               # 本地校验脚本
├── src/
│   ├── App.jsx            # 书架、阅读器、解惑、回忆等主界面
│   ├── epub.js / epubWorker.js
│   ├── memoryEngine.js / memoryModels.js / contextBuilder.js
│   ├── explainMemory.js / recoveryQuality.js
│   └── styles.css
├── server.mjs             # /api/analyze、recovery-card、explain-selection 等
├── AGENTS.md
├── .env.example
└── package.json
```

## 发展路线

详见 [`constitution/roadmap.md`](./constitution/roadmap.md)。当前重点包括：续读恢复质量、类型自适应记忆、多书种样本与评测，以及更多格式的真实解析。

## 说明

这是一个快速迭代中的产品原型，目标是探索「AI 如何真正降低长篇阅读的认知负担」。当前更重视交互方向与阅读体验验证；部分格式、模型行为与可视化仍在持续打磨。
