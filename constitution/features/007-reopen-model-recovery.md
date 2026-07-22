# Feature 007: Reopen Model Recovery

## Status

Verified.

## Problem

After time away, reopen rebuilds the recovery card with local Context Builder / paragraph heuristics and clears any stored model card. Automatic Trace updates `bookMemory` but does not refresh recovery materials. The page-title recall control uses `visiblePageIndex > 0`, so chapter N page 0 hides recall even when prior chapters exist.

This breaks the mission bar: returning readers should get model-backed situation restore when Memory exists.

## Goal

Make continued-reading recovery model-first on reopen (and keep materials fresh after auto Trace), with local Context Builder as immediate fallback — never block reading.

## Scope

In scope:

- `scheduleRecoveryCardBuild`: after absence threshold,
  1. build and show local `buildTraceRecoveryCard` / `buildRecoveryCard` immediately when available;
  2. async call `/api/recovery-card` using persisted `bookMemory` + supporting evidence from Memory Engine;
  3. on success, replace UI card and persist into analysis record `recoveryCard`;
  4. on failure, keep local card.
- `analyzeBook` automatic path: also generate recovery materials (prefer model, fallback local) and store on the record without forcing the overlay open.
- Generalize `requestModelRecoveryCard` so reopen can pass an explicit `targetBook` / stored memory (not only the currently bound React `book` state when racing).
- Fix prior-context gate: recall available when `chapterIndex > 0 || pageIndex > 0` (or equivalent Context Builder prior-context check).
- Quiet loading affordance optional: Trace status or notice while model recovery runs on reopen; do not invent a new modal.

Out of scope:

- Selection 解惑 model explain (Feature 008).
- Multi-type live eval corpus (Phase 9).
- Changing absence threshold (keep 12h).
- Recovery card visual redesign.

## Rules

1. Prefer model recovery when persisted Memory has usable content and evidence can be located.
2. Local Context Builder remains the always-available fallback.
3. Job id must cancel stale reopen builds when the reader switches books quickly.
4. Do not spoil unread content; pass only read-bounded cursor and Memory filtered by that cursor on the server/client as existing contracts require.
5. Auto Trace must not interrupt reading with the recovery overlay; only persist materials for next reopen / manual recall.
6. Recovery question / hint / keyPoints must be **episode-specific** and **book-agnostic**:
   - Ground recall targets in concrete evidenced episodes near the checkpoint (person action, turning decision, place beat, causal link, concept/mechanism), preferring Memory primary + recent anchors.
   - Reject mega-topic-only centers (党/国家/人民/历史/中国共产党-style labels without a concrete episode) and generic templates such as「X 为什么会影响后面的内容」「关键决策如何形成」.
   - Never hardcode book-title-specific passage themes, entity lists, or year ranges; mechanisms must work for any book via evidence + Trace profile.

## Verification

- `npm run build`
- Code path review: reopen after absence calls `/api/recovery-card` when Memory exists.
- Auto analyze stores `recoveryCard` on the analysis record.
- Chapter > 0, page 0 still shows the recall control.
- Sub-agent verifies against this spec.
