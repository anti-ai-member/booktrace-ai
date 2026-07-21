# Feature 002: Memory Model Schema (Thorough Migration)

## Status

Verified.

## Problem

Reading intelligence still relies on a flat `index` (people / places / timeline / relationships) plus a loose `traceMemory.anchors` bag. That shape cannot express type-adaptive Topic / Argument / Episodic / Reader memory, cannot merge incrementally with clear evidence rules, and keeps recovery logic glued to legacy index fields.

## Goal

Make Memory the canonical runtime contract:

- Six memory families become first-class data.
- Analyze API returns and persists `bookMemory`.
- App reads `bookMemory` as source of truth.
- Legacy `index` / `traceMemory` remain only as derived projections or one-time migration inputs.
- No new UI layout in this feature.

## Scope

In scope:

- Add `src/memoryModels.js` with schema helpers:
  - empty / normalize / merge / no-spoiler filter
  - reader forgetting score
  - legacy → `bookMemory` migration
  - `bookMemory` → reading-index projection for existing panels
- Update `server.mjs` analyze path to build and return `bookMemory`.
- Update analyze prompt to request structured memory buckets (with legacy-field fallback parsing).
- Update `App.jsx` analysis record, recovery, organizers, and persistence to use `bookMemory`.
- Update `scripts/trace-eval.mjs` to accept/inspect `bookMemory` when present.

Out of scope:

- Context Builder recall policy redesign (Feature / Phase 3).
- New recovery-card visual layout.
- PDF / OCR work.
- Deleting all panel UI that still consumes projected index fields.

## Canonical Contract

`BookMemory`:

- `version` (number, current `2`)
- `bookId`
- `cursor` (last analyzed upper bound)
- `profile` / `traceProfile`
- `updatedAt`
- `entities[]` — person | organization | place | term
- `timeline[]` — timepoint | event (optional causal `causes` / `causedBy` ids)
- `topics[]` — concept | definition | mechanism | framework | example
- `arguments[]` — claim | reason | evidence | example | conclusion | objection
- `episodic[]` — chapter/scene main events
- `relationships[]` — evidenced edges between entities/events
- `reader` — Reader Memory
- `discarded[]` — noise the model rejected (debug / eval)
- `supportingEvidence[]` — optional last-run ContextCite refs

Shared item fields:

- `id`, `kind`, `name`, `summary`, `priority` (`primary` | `recent` | `secondary`)
- `evidence` `{ chapterIndex, paragraphIndex, quote, cite? }`
- `occurrences[]` (optional)
- `attributes[]` / `roles[]` (optional, especially people)
- `status`, `latestChange` (optional)
- `updatedAt`

`ReaderMemory`:

- `position`
- `lastActivityAt`
- `absenceMs`
- `rememberedKeys[]` / `missedKeys[]`
- `noteRefs[]` / `bookmarkRefs[]`
- `activeReadingMs`
- `forgettingScores` map (`memoryKey` → 0..1 secondary score)

## Rules

1. Type-adaptive: empty buckets are valid; do not force people/places for concept-led books.
2. Evidence-backed: showable items must resolve to chapter/paragraph coordinates; drop weak/empty names.
3. No-spoiler: `filterBookMemoryByCursor(memory, cursor)` removes items beyond the read/analysis bound.
4. Incremental merge: `mergeBookMemory(previous, incoming, cursor)` merges by stable id; upgrade priority carefully; keep better evidence; cap list sizes.
5. Reader forgetting score is secondary; never the sole ranking signal.
6. No book-specific hardcoded entity lists.
7. No RAG / HNSW / vector / embedding code.

## API / Persistence Migration

Analyze response (canonical):

```json
{
  "bookMemory": { "...": "BookMemory" },
  "index": { "...": "projected reading index for transitional UI" },
  "profile": {},
  "traceProfile": {},
  "summary": {}
}
```

- `traceMemory` may be omitted or emitted as a thin compatibility alias derived from `bookMemory`.
- Client persists `bookMemory` inside the per-book analysis record.
- On load, if only legacy `index`/`traceMemory` exist, migrate once via `bookMemoryFromLegacy(...)`.

Request body:

- Prefer `previousBookMemory`.
- Accept legacy `previousIndex` / `previousTraceMemory` and migrate server-side when needed.

## Verification

Local:

- `npm run build`
- Node smoke checks for normalize / merge / filter / forgetting score / legacy migration / index projection
- Runtime residual search: no revived RAG path
- Manual: open 《长征》, run or load analysis path without UI freeze; recovery/search still evidence-capable

Sub-agent:

- Confirm implementation matches this spec
- Confirm App/server treat `bookMemory` as source of truth
- Confirm no-spoiler filter and merge policy exist and are used
