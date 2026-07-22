# Feature 015: Note Selection Underlines

## Status

Verified.

## Problem

Saved selection notes jump from the sidebar but leave no durable in-text mark. The notes list also leads with note body and buries the selected excerpt, so scanning for “what I annotated” is harder than it should be.

## Goal

When a reader saves a note on selected text, underline that span quietly on the reading page (distinct from 「解」badges). In the 笔记 sidebar, show the selected excerpt first, then chapter/page source, then the note content. Deleting a note clears its underline immediately.

## Storage

Reuse existing book-scoped notes list (`yuezhi-notes:…` via `notesStorageKey(book)`).

Record fields (extend current shape):

```js
{
  id: string,
  chapterIndex: number,
  pageIndex: number,
  chapterTitle: string,
  paragraphIndex: number | null,
  startOffset: number | null,  // within paragraph text when measurable
  endOffset: number | null,
  selection: string,
  content: string,
  createdAt: number
}
```

- Persist `paragraphIndex`, `startOffset`, and `endOffset` from the selection bloom when available.
- Legacy notes without offsets still render underlines via selection-text match in the paragraph (same fallback as explain markers).
- Deleting a note removes it from localStorage; underlines re-render from the remaining list.

## In-text underlines

- On the current page, for notes whose `chapterIndex` matches and whose selection appears in a visible paragraph/segment, wrap the matched span with a quiet bottom underline.
- Style: restrained solid underline (note/rose-ink accent), no badge, no fill wash that competes with explain markers.
- Do not confuse with 「解」markers: explains keep dotted wash + badge; notes are underline-only.
- When the same span has both a note and an explain, keep the explain badge; the note underline may coexist or yield to explain chrome without stacking visual noise.
- Must not empty pages: underline is inline border only; do not change page-pack metrics.

## NoteList UI

Order inside each note row:

1. Primary: selection excerpt
2. Secondary: chapter title · page
3. Tertiary: note content (quieter)

Click still jumps to `chapterIndex` / `pageIndex` (and prefers the annotated paragraph when known). Delete removes storage + underline.

## Scope

In scope:

- Persist selection offsets with notes
- In-text note underlines on matching spans
- NoteList reorder
- Spec updates: roadmap, product-ui-ux-spec, AGENTS.md

Out of scope:

- Note hover preview / edit-in-place
- Bloom delete-for-notes petal
- Syncing notes into Context Builder / Reader Memory schema

## Verification

- `npm run build`
- Save note on selection → underline visible on that page
- Notes sidebar: selection → source → content
- Jump from sidebar lands on the page with underline visible
- Delete note → underline clears immediately
- Explain markers remain unchanged for 解惑 spans
