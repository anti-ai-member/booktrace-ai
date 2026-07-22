# Feature 008: Selection 解惑 Modes

## Status

Verified (with polish: speed modes + panel typography).

## Problem

「选文解惑」目前只有选文摘录 + 相关出处列表，视觉像硬塞的 AI 面板，且没有区分读者真正需要的几种帮助：找书内出处、词条简介、段落深意等。

## Goal

Make selection 解惑 a quiet, mode-based reading assist:

1. Reader picks an intent (or a sensible default).
2. Panel shows a calm answer for that intent.
3. Evidence stays secondary and jumpable.
4. Model fails closed to local cites / short fallback — never invent unread spoilers.

## Modes

| id | Label | When | Behavior |
|---|---|---|---|
| `source` | 书内出处 | Need to locate / re-read related passages | Local Memory Engine cites only (no model required) |
| `entity` | 词条简介 | Person, place, org, term keyword | Short identity/role summary grounded in read Memory + cites |
| `meaning` | 深意阐释 | Dense / philosophical / literary passage | Explain what the passage is arguing or implying in context |
| `concept` | 概念释义 | Science / tech / learning jargon | Plain-language definition + how it is used here |
| `context` | 前后因果 | Narrative / history beat | Why this moment matters given prior read events |

Additional common intents considered later (out of scope now): 文言今读, 论证拆解, 对比异同, 翻译对照.

## Speed / quality

Secondary to intent modes; persisted in AI settings as `explainSpeed`:

| id | Label | Model | Thinking |
|---|---|---|---|
| `fast` | 快速 | DeepSeek `deepseek-v4-flash` (OpenAI: current analysis model) | off |
| `deep` | 深思 | DeepSeek `deepseek-v4-pro` (OpenAI: recovery model) | on for DeepSeek only |

Client caches explanations by `mode:speed`. Switching speed refetches when that key is empty.

## Default mode heuristic

- Selection ≤ 12 chars and looks like a name/term → `entity`
- Book type in philosophy / business / literary essay → prefer `meaning` for longer selections
- Book type in science / technology / learning → prefer `concept` for term-like selections
- Otherwise → `source` (safest, local)

Reader can always switch modes manually.

## UI

Left panel (same shell as other reader tools):

- Compact header: kicker「阅读辅助」+ title「选文解惑」+ active-mode detail + close (no large hero card)
- Quiet underline intent chips (one active)
- Secondary pill speed chips (快速 / 深思) with tooltips
- Selected excerpt as a short quote strip
- Primary body: answer for active mode (loading / empty / text)
- Evidence: collapsed section「原文依据」with jump buttons matching bookmark list hover language

Visual: paper/ink, list typography like bookmarks/notes — not a marketing hero.

## API

`POST /api/explain-selection`

Request:

```js
{
  provider, model, thinking, // thinking mirrors recovery-card; DeepSeek only
  mode: "entity"|"meaning"|"concept"|"context", // source is client-local
  selection: string,
  book: { id, title, creator, bookType },
  cursor,
  bookMemory,
  evidence: ContextCite[]
}
```

Response:

```js
{
  provider,
  model,
  thinking,
  explanation: {
    mode,
    title: string,
    answer: string, // short, 2-5 sentences preferred
    highlights?: string[],
    evidence?: ContextCite[]
  }
}
```

Rules:

- Use only supplied selection + evidence + read-bounded Memory.
- No unread spoilers.
- Ban stringified `undefined` / empty claims.
- If model fails → 422/502; client keeps cites and shows a quiet fallback line.
- `createModelClient({ thinking })` when DeepSeek + `thinking: true`.

## Scope

In scope:

- Mode taxonomy + default heuristic
- Redesign `SelectionAssistPanel`
- `/api/explain-selection` + App wiring for non-`source` modes
- Fast / deep speed modes + persistence
- Spec updates in roadmap / product UI UX

Out of scope:

- New bloom petals per mode
- Full concept-map / argument workspace (Phase 8)
- Offline multi-type eval expansion (Phase 9)

## Verification

- `npm run build`
- Opening 解惑 shows mode chips; `source` lists cites without waiting on model
- Switching to `entity`/`meaning`/`concept`/`context` requests the API when evidence exists
- Switching 快速 ↔ 深思 refetches non-source modes with the mapped model / thinking flag
- Model failure still leaves cites usable
- Sub-agent verifies against this spec

## Polish note (post-verify)

Panel typography aligned with reader side panels. Speed preference lives in `yuezhi-ai-settings.explainSpeed`. Answer sits in a paper well with「豁然开朗」kicker and soft reveal; chrome stays light; evidence is quieter and spaced below.
