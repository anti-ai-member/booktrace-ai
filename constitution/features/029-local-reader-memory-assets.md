# Feature 029: Local Reader Memory Assets

## Goal

Consolidate the reader's durable local actions into one read-bounded Reader
Memory snapshot that can be rebuilt whenever recall is prepared. Notes,
bookmarks, explains, and recovery outcomes remain in their existing stores;
Reader Memory references and weights them without duplicating their content.

## User value

- A passage the reader annotated or asked about can help reconnect later pages.
- A bridge marked `还没想起` becomes slightly easier to surface again when the
  current page genuinely depends on it.
- A bridge marked `想起来了` is mildly dampened, not permanently hidden.
- Unrelated personal traces never displace a better current-page dependency.

## In scope

1. Build a pure, deterministic Reader Memory snapshot from existing Reader
   Memory plus positioned notes, bookmarks, and explains.
2. Add `explainRefs` to the canonical Reader Memory schema while preserving
   legacy `noteRefs`, `bookmarkRefs`, remembered/missed keys, and forgetting
   scores.
3. Include only assets strictly before the current cursor. Ignore unpositioned,
   current-paragraph, future, deleted, and malformed records.
4. Deduplicate references and expose compact per-kind counts and the latest
   valid interaction timestamp.
5. Use the consolidated snapshot as a secondary scoring input in situation
   bridge selection. Current-page dependency, pair linkage, importance, and
   evidence reliability remain stronger gates.
6. Keep the source arrays as the evidence-bearing candidate channel; Reader
   Memory stores references and signals only.

## Out of scope

- A Reader Memory dashboard or new permanent reader control.
- Copying note/explain text into `bookMemory.reader`.
- Cloud sync, cross-book memory, semantic embeddings, or RAG.
- Letting interaction frequency create a bridge without a proven page gap.
- Changing notes, bookmarks, or explain UI.

## Decision rules

1. Reader traces can change ranking only after `scorePairLink` proves a current
   page dependency.
2. Asset-derived adjustment is capped at `0.06`; recovery remembered/missed
   adjustment keeps its existing cap.
3. Explain records count as deliberate reader traces but do not automatically
   mean the concept was forgotten.
4. Derived snapshots are rebuilt from source-of-truth local assets, so deleted
   records disappear without migration cleanup.
5. Snapshot construction must be book-agnostic and deterministic.

## Acceptance

- Positioned note/bookmark/explain references are consolidated and deduplicated.
- Current/future/unpositioned records are excluded.
- Existing remembered/missed feedback survives consolidation.
- A linked Reader trace receives only a small bounded boost.
- An unrelated high-priority Reader trace remains rejected.
- Existing situation-bridge evaluation remains green.
- `npm run verify:reader-memory-assets` and `npm run build` pass.
- A sub-agent independently verifies implementation against this spec.

## Verification

Status: implemented and independently verified (PASS).
