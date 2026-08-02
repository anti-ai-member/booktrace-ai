# Design: Reuse 选文解惑 by exact selection text

## Goal

When a reader has already explained a span (e.g.「肖亚文」) and later selects the same text elsewhere in the same book, opening 解惑 should restore the cached answer without a new model call. No in-text「解」markers on later occurrences.

## Behavior

1. Bloom → 解惑:
   - Prefer **position** match (same chapter/paragraph + exact/overlap) → open that record (existing marker semantics).
   - Else **exact text** match (trim, full string equality) in the book’s persisted explains → open the newest matching record’s cache.
   - Else start a fresh explain session.
2. Text reuse keeps the reader at the **current** page; does not jump to the original annotation.
3. Markers remain only on the original annotated span.
4. Bloom「删除」stays position-only (unchanged).
5. Persisting from a text-reuse session writes back to the **original** chapter/paragraph/offsets so a second marker is not created. New mode/speed answers update that same anchor.

## Out of scope

- Fuzzy / contains matching
- Cross-book reuse
- Auto-marking later occurrences
