# Feature 014: Persist Selection 解惑 Markers

## Status

Verified.

## Problem

选文解惑 results disappear when the panel closes. Readers cannot revisit a prior explanation from the original span, so the Memory-first promise of “remember where understanding came from” is incomplete for selection assist.

## Goal

Persist every successful 选文解惑 result per book, mark the original selection quietly in the page, preview on long hover, and reopen the full panel on click — without refetching unless the reader changes mode or speed.

## Storage

Book-scoped local list (same style as notes/bookmarks):

- Key: `yuezhi-explains:{book identity}` via `explainsStorageKey(book)`
- Survives reopen; not discarded when the panel closes
- Optional future: reader-memory `explainRefs` — out of scope for this feature; keep a dedicated list for reliability and pagination safety

Record fields:

```js
{
  id: string,
  bookId: string,
  chapterIndex: number,
  pageIndex: number,
  paragraphIndex: number,
  startOffset: number | null,  // within paragraph text when measurable
  endOffset: number | null,
  selection: string,
  mode: "source"|"entity"|"meaning"|"concept"|"context",
  explainSpeed: "fast"|"deep",
  title: string,
  answer: string,
  highlights: string[],
  evidence: ContextCite[],     // snapshot
  explanations: object,        // mode:speed cache snapshot for reopen
  cites: ContextCite[],        // original assist cites
  createdAt: number
}
```

Persist when:

- Non-`source` mode reaches `ready` with a non-empty `answer`
- `source` mode opens with usable cites (store a short local answer line + cite snapshot)

Upsert by identity: same book + chapter + paragraph + selection + mode + explainSpeed → replace, do not duplicate.

Cap: keep the latest 80 records per book (drop oldest).

## In-text markers

- On the reading page, for explains whose `chapterIndex` matches the current chapter and whose selection appears in a visible paragraph, render a quiet badge near the match.
- Default label: 「解」; if a single mode is known, may use a short mode hint (e.g. 「词」 for entity). Prefer 「解」 when multiple modes share one span.
- Multiple records on the same span (same paragraph + same selection text / overlapping offsets) collapse to **one** badge + count.
- Markers must not empty pages: prefer a compact inline/absolute badge that does not add multi-line height. Page packing continues to measure overflow; do not change `getLogicalPageMetrics` haircuts for markers alone.

## Long hover preview

- Delay ~500ms before showing; dismiss on pointer leave.
- Compact card only:
  - Mode (+ speed when useful): e.g. 「词条简介 · 深思」
  - One-line main conclusion (title or first sentence, max ~2 lines)
  - 「依据 ×N · 点击展开」
  - Quiet delete control for the **currently shown** record (same X affordance spirit as bookmark/note delete)
- When a badge collapses multiple explains (`解·N`), the preview may list/switch among them; delete removes only the focused item, then updates the count / clears the badge when none remain.
- Never show the full answer in the hover card.
- Respect `prefers-reduced-motion` for any fade.

## Click → reopen panel

- Click marker (or preview CTA) opens `SelectionAssistPanel` with stored selection, mode, cites, and `explanations` cache.
- Sync `explainSpeed` from the record into AI settings when reopening that record so the cache key matches.
- No forced refetch when the cached answer for active mode+speed exists (existing panel cache guard).
- Reopened panels expose 「删除标注」; deleting removes the localStorage record and clears the in-text marker immediately.
- Selection bloom shows a quiet 「删除」 petal when the live selection matches persisted explains (same chapter/paragraph + exact or overlapping selection text). Hide the petal when nothing matches. Click removes all matching records for that selection group, clears markers, and closes the bloom.

## UI / UX

- Follow `docs/product-ui-ux-spec.md`: quiet paper/ink, reading-first, no floating primary panels for the full answer.
- Marker and hover preview are transient reading chrome; the full answer stays in the left panel.

## Scope

In scope:

- Persist / load / upsert / delete explain records
- In-text markers + collapse-by-span
- Long-hover preview + click reopen
- Delete from preview (focused item), reopened 解惑 panel, and selection bloom (matching selection group)
- Spec updates: roadmap, product-ui-ux-spec, AGENTS.md

Out of scope:

- Sidebar list of all explains (notes-style archive)
- Feeding explains into Context Builder recovery ranking
- Changing `/api/explain-selection` contract

## Verification

- `npm run build`
- Closing 解惑 and reopening the book still shows markers for stored spans
- Long hover shows preview only; click restores full panel without refetch for cached mode/speed
- Multiple modes on one selection collapse to one badge + count
- Deleting from preview or panel removes storage + marker immediately; grouped badges update count
- Sub-agent mentally / explicitly verifies against this spec
