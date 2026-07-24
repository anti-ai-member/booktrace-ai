# Feature 016: Native Column Pagination

**Status:** Implemented and locally verified on 2026-07-24.

## Problem

The reader currently estimates page boundaries with a character budget and calibrates that budget from the first rendered page. Real line wrapping varies by paragraph shape, punctuation, script, font metrics, annotations, and images. Later pages can therefore underfill or overflow even when page one looks correct. `overflow: hidden` then turns overflow into clipped half-lines.

## Goal

Replace character-budget page packing with a stable, Kindle-like pagination surface driven by the browser's real text layout. The same layout engine that wraps glyphs must decide page breaks.

## User-visible contract

- The reader remains a page-turning experience with no internal vertical scroll.
- Text fills the available reading viewport naturally; ordinary pages should not leave a large artificial blank area.
- The bottom of every page contains only complete lines. No glyph may be clipped to its top or bottom half.
- Chapter navigation and page navigation remain visually and behaviorally distinct.
- The exact per-book chapter/page position remains restorable.
- Bookmarks, read-page tracking, notes, explain markers, evidence jumps, and selection assistance continue to work.
- Resizing the window or opening a side workspace repaginates once and preserves the nearest paragraph anchor.

## Implementation design

1. Render the complete current chapter into one fixed-height multi-column track.
2. Set the column width to the measured `.page-copy` content width and the column height to its measured height.
3. Let CSS multi-column layout split paragraphs only at real line boundaries.
4. Derive `pageCount` from the track's measured horizontal extent.
5. Turn pages by translating the track by exactly one measured column width.
6. Build a paragraph-to-page map from DOM client rects after layout. Use that map for current-page context and jumps.
7. Re-measure after fonts and in-book images are ready, and through `ResizeObserver` for meaningful viewport changes.
8. Remove the first-page pack-scale probe and all runtime grow/shrink correction. Character estimates may remain only as a temporary fallback before the first real layout, never as the committed pagination source.

## Layout invariants

- `.page-copy` owns a definite width and height and clips horizontally only.
- `.page-track` has the same height as `.page-copy`, `column-fill: auto`, and no vertical clipping logic of its own.
- Page translation uses transform only and must not change layout geometry.
- Annotations must not introduce a block that is taller than the line box.
- Figures are atomic (`break-inside: avoid`) and constrained below the page height.

## Verification

Automated checks at 1365x768, 1440x900, and 1920x1080:

- Open the built-in EPUB and wait for pagination readiness.
- Sample at least the first, a middle, and a later page.
- Assert no visible line or block crosses the `.page-copy` bottom boundary.
- Assert the page has no vertical scrollbar.
- Assert normal non-terminal pages use at least 78% of available height, allowing intentional paragraph/figure boundaries.
- Turn forward and backward and confirm page count remains stable.
- Toggle the reader side panel and confirm the current paragraph remains visible after repagination.
- Run `npm run build`.

### Verification record

- `npm run verify:pagination`: PASS at 1365x768, 1440x900, and 1920x1080.
- Twelve pages sampled per viewport; `clippedCount` remained zero.
- Minimum measured non-terminal page fill ratio: 91.38%.
- Side-panel open/close preserved the visible paragraph anchor after repagination.
- Reload and reopen restored the saved chapter, page, and paragraph anchor.
- Browser console errors: zero.
- `npm run build`: PASS.

## Out of scope

- Exact parity with Kindle's proprietary hyphenation and font renderer.
- Two-page spreads.
- User font-size controls.
- Rewriting EPUB content or changing Memory Engine behavior.
