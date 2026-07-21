# Cursor Handoff: 书脉 Memory Engine Refactor

更新时间：2026-07-20

## 当前目标

项目正在从“带 RAG 的阅读器”转向“Memory Engine first 的 AI 续读恢复阅读器”。

核心产品判断：

- 书脉的核心不是通用 RAG 问答。
- 核心是让 AI 知道“此刻读者最应该回忆什么”。
- RAG/HNSW/vector/embedding 这条重检索链路需要从核心业务中删除。
- ContextCite 仍然保留为“原文定位/证据引用”的轻量能力。

后续所有核心逻辑变更必须遵守：

1. 先写 feature spec。
2. 再实现。
3. 再验证。
4. 验证通过后才领取下一项任务。

相关项目约束见：

- `AGENTS.md`
- `constitution/mission.md`
- `constitution/teck-stack.md`
- `constitution/roadmap.md`
- `docs/product-ui-ux-spec.md`

## 本轮已经完成

已创建 constitution 文档结构：

- `constitution/mission.md`
- `constitution/teck-stack.md`
- `constitution/roadmap.md`

已创建第一份功能规格：

- `constitution/features/001-remove-rag-memory-engine.md`

已开始实现 Feature 001：

- 删除旧文件：`src/rag.js`
- 新增轻量 Memory Engine 文件：`src/memoryEngine.js`
- `src/App.jsx` 已改为从 `./memoryEngine.js` 导入：
  - `buildMemoryCandidates`
  - `buildMemoryEvidenceStore`
  - `locateEvidence`
- 前端运行时状态已从 `evidenceStore` 改为 `memoryEvidenceStore`
- 前端分析 payload 主字段已从 `retrievedEvidence` 改为 `supportingEvidence`
- `server.mjs` 的 `/api/analyze` 主路径已支持 `supportingEvidence`
- `AGENTS.md` 和 `docs/product-ui-ux-spec.md` 已开始移除旧 RAG-first 表述

## 本轮尚未完成

Feature 001 还没有闭环。

必须继续完成：

- 跑 `npm run build`
- 修复构建错误
- 做 runtime 残留搜索
- 让验证者按 spec 复核
- 决定是否彻底删除 `server.mjs` 中的 `retrievedEvidence` 兼容字段
- 清理文档中不该保留的旧 RAG 表述

目前搜索到的残留：

```text
server.mjs still accepts retrievedEvidence as backward-compatible fallback.
constitution docs intentionally mention RAG as removed/forbidden architecture.
docs/legacy-framework-audit-for-recovery.md still mentions old RAG evidence store.
```

建议：

- runtime 代码里不要出现 `rag.js`、`HNSW`、`embedTokens`、`embedding`、`vector`。
- constitution 里作为历史背景或禁止项可以出现 RAG，但不要把它描述成当前实现路径。
- `docs/legacy-framework-audit-for-recovery.md` 是旧框架审计文档，可保留“legacy”语境，也可以归档到 `docs/archive/`。

## 当前工作树状态

最近一次 `git status --short` 显示：

```text
 M AGENTS.md
 M package.json
 M server.mjs
 M src/App.jsx
 M src/styles.css
?? constitution/
?? docs/
?? reports/
?? scripts/
?? src/epubWorker.js
?? src/memoryEngine.js
?? src/traceProfiles.js
```

注意：

- 这些改动不全是 Feature 001 产生的。
- `src/styles.css`、`reports/`、`scripts/`、`src/epubWorker.js`、`src/traceProfiles.js` 可能包含之前任务的累计工作。
- Cursor 接手时不要随意 revert 用户或前序工作。
- 先用 `git diff` 分清当前任务相关改动和历史未提交改动。

## 关键文件说明

### `src/memoryEngine.js`

当前替代旧 `src/rag.js`。

职责：

- 建立 read-bounded paragraph evidence store。
- 做关键词、实体、时间倒排。
- 做轻量证据定位。
- 创建 ContextCite-compatible cite object。
- 抽取候选 memory anchors。

明确不做：

- 不做 HNSW。
- 不做向量图。
- 不做 embedding simulation。
- 不做 RAG pipeline。

### `src/App.jsx`

关键改动点：

- import 已切到 `memoryEngine.js`
- `buildMemoryCandidatesAsync` 分批抽取候选，期间 `yieldToBrowser()`，避免卡 UI。
- `memoryEvidenceStore` 在有 book/index 后异步构建。
- 搜索、选中文本出处、分析证据都走 `locateEvidence(...)`。
- 分析请求使用 `supportingEvidence`。

需要重点复核：

- `memoryEvidenceStore` 为空时，`locateEvidence` 返回空数组，恢复卡是否仍有合理 fallback。
- 自动分析和手动分析是否仍然不会阻塞 UI。
- `supportingEvidence` 字段在前后端是否一致。

### `server.mjs`

关键改动点：

- `/api/analyze` 已接收 `supportingEvidence`
- 暂时保留 `retrievedEvidence` 作为 fallback：

```js
const evidence = Array.isArray(supportingEvidence) ? supportingEvidence : retrievedEvidence;
```

待决定：

- 如果要“彻底删除旧字段”，需要删除 `retrievedEvidence` fallback，并确认所有调用都已迁移。
- 如果担心旧本地缓存或旧客户端请求，先保留 fallback 也可以，但要在 spec 中明确这是兼容层，不是 RAG。

## Cursor 下一步建议

### Step 1: 阅读约束文档

先读：

```bash
cat AGENTS.md
cat constitution/mission.md
cat constitution/teck-stack.md
cat constitution/roadmap.md
cat constitution/features/001-remove-rag-memory-engine.md
```

Windows PowerShell 可用：

```powershell
Get-Content -Encoding utf8 AGENTS.md
Get-Content -Encoding utf8 constitution\mission.md
Get-Content -Encoding utf8 constitution\teck-stack.md
Get-Content -Encoding utf8 constitution\roadmap.md
Get-Content -Encoding utf8 constitution\features\001-remove-rag-memory-engine.md
```

### Step 2: 继续 Feature 001 验证

运行：

```powershell
npm run build
```

再运行：

```powershell
rg -n "from .*/rag|rag\.js|buildEvidenceStore|searchEvidence|buildTraceCandidates|evidenceStore|HNSW|embedding|embedTokens|vector" src server.mjs package.json
```

如果只剩 `retrievedEvidence`，按产品意图决定：

- 要最彻底：删除服务端 fallback。
- 要兼容：保留，但在 spec 或注释中明确它只是 legacy field alias。

### Step 3: 修复构建错误

常见可能问题：

- `src/App.jsx` 中还残留 `buildTraceCandidatesAsync`
- `src/App.jsx` 中还残留 `searchEvidence`
- `src/App.jsx` 中还残留 `evidenceStore`
- `server.mjs` payload 字段不一致
- `memoryEngine.js` 里的候选 id 与 store id 不匹配

### Step 4: 做人工功能烟测

启动：

```powershell
npm run dev
```

检查：

- 首页能打开。
- 打开《长征》不卡死。
- 翻页可用。
- 搜索能返回内容。
- 选中文本后“出处/上下文”仍能给出证据。
- 手动触发 AI Trace 时不会阻塞 UI。
- 如果 DeepSeek key 可用，确认 `/api/analyze` 仍能返回结果。

### Step 5: 完成 Feature 001 verify

验证维度：

- 符合 `constitution/features/001-remove-rag-memory-engine.md`
- runtime 没有旧 RAG/HNSW/vector/embedding 路径
- 搜索和恢复卡仍有 ContextCite-style evidence
- 构建通过
- 没有 UI 阻塞回归

## 下一项任务候选

Feature 002 建议：定义 Memory Model Schema。

先创建 spec：

```text
constitution/features/002-memory-model-schema.md
```

建议范围：

- Entity Memory
- Timeline Memory
- Topic/Semantic Memory
- Argument Memory
- Episodic Memory
- Reader Memory

不要一口气做 UI。

先做纯数据模型和规范化/merge 逻辑：

- schema
- normalizer
- merge policy
- evidence requirements
- no-spoiler boundary
- forgetting-aware reader memory score

## 重要产品判断

书脉现在要避免变成：

```text
Reader -> RAG -> LLM
```

目标是：

```text
Reader
  -> Reading Events
  -> Memory Extractors
  -> Entity / Timeline / Topic / Argument / Episodic / Reader Memory
  -> Memory Engine
  -> Context Builder
  -> LLM
  -> ContextCite Evidence Locator
```

一句话判断标准：

> AI 不应该默认总结前文，而应该判断当前页最需要读者想起哪几件事。

