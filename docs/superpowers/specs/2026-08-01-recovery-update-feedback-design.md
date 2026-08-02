# Design: 更新恢复卡 — faster path + readable outcome

## Problem

「更新恢复卡」 currently feels broken in two ways:

1. **Slow** — always runs full `/api/analyze`, then often a second DeepSeek Pro + thinking adjudicator before anything appears.
2. **Opaque** — status copy talks about “AI Trace / 接驳材料 / 没有新增内容”, so readers cannot tell whether a recovery card was prepared, opened, or skipped.

## Goals

- The button always means: **refresh the continued-reading recovery card for the current read cursor**.
- Prefer the **local Memory → show card → optional background adjudicate** path already used when opening「回忆」.
- Skip `/api/analyze` when there is **no newly read content** since the last checkpoint; rebuild from stored Book Memory instead.
- Panel status uses plain Chinese outcomes a reader can act on.

## Non-goals

- Changing Memory schema, adjudicator prompts, or default models.
- Auto-popping recovery on every page turn.

## Behavior

### Click「更新恢复卡」

1. Resolve latest read cursor. If none → `请先读完至少一页，再更新恢复卡`.
2. If there **is** new read content since `analysisRecord.cursor` → run incremental analyze (existing `/api/analyze`), keep progress messages in the panel.
3. If there is **no** new content but Book Memory exists → skip analyze; rebuild recovery from stored memory.
4. If neither new content nor usable memory → `还没有足够的已读记忆，请先读几页再更新`.

### Card presentation (speed)

- As soon as a local card exists, **open it** (manual click only) and mark the panel done.
- If adjudicator is enabled, run it afterward and replace the open card when judgement returns.
- Do not block the visible result on Pro thinking.

### Status copy (clarity)

| Outcome | Panel message |
| --- | --- |
| Working (analyze) | `正在整理已读内容…` → `正在生成恢复卡…` |
| Working (adjudicate) | `恢复卡已打开，正在精选接驳点…` |
| Card ready (N bridges) | `恢复卡已更新：N 个接驳点` |
| No recall needed | `当前位置接得上，不必先回想` |
| No memory | `还没有足够的已读记忆，请先读几页再更新` |
| Error | existing error text |

Toast may mirror the done line briefly; avoid model ids and “AI Trace” jargon in the primary panel line.

## Verification

- No new pages + existing analysis → finishes quickly, opens/refreshes card or clear “不必先回想”.
- New pages → analyze still runs; local card appears before adjudicator completes.
- Panel message always states the reader-facing outcome.
