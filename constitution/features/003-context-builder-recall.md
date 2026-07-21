# Feature 003: Context Builder And Recall Policy

## Status

Verified.

## Problem

Recovery still assembles anchors ad hoc in `App.jsx`. There is no dedicated decision layer that answers: “at this page, what should the reader recall right now?” First-page suppression, current-page prerequisites, noise filtering, and forgetting-as-secondary-score are incomplete or duplicated.

## Goal

Add a local Context Builder that turns `bookMemory` + reading cursor + optional current-page text + reader state into a one-screen `RecoveryPlan`.

App local recovery cards consume this plan. `/api/recovery-card` is out of scope for this feature (may still run as optional polish later).

## Scope

In scope:

- Add `src/contextBuilder.js` with:
  - recovery suppression (first page / low prior context / insufficient anchors)
  - candidate scoring from Memory (mainline + current-page overlap primary; forgetting secondary)
  - noise filtering (publication metadata, biographical dates, weak incidental names/places)
  - prerequisite selection for the current page
  - one-screen RecoveryPlan assembly (2–3 key points, 1–2 prerequisites, 1 question, evidence)
- Wire `App.jsx` local recovery (`buildTraceRecoveryCard` / open-book recovery) to use the builder
- Keep existing recovery card UI shape so no layout rewrite is required

Out of scope:

- Changing `/api/recovery-card` contract or prompts (Phase 4)
- New recovery-card visual redesign (Phase 5)
- Sending hundreds of pages to the model
- Full evaluation harness expansion (Phase 6)

## RecoveryPlan Contract

```js
{
  suppressed: false,
  reason: null, // when suppressed
  intensity: "light|medium|deep|fresh",
  absenceLabel: string,
  positionLabel: string,
  keyPoints: [{ id, memoryKey, title, detail, evidence }], // 2-3
  prerequisites: [{ id, text, evidence }], // 1-2
  question: { memoryKey, prompt, answer, evidence },
  evidence: [/* ContextCite-compatible */], // <= 6
}
```

## Rules

1. Prefer Memory items over raw paragraph scraping when Memory has content.
2. Primary score: priority + current-page lexical/entity overlap + reading proximity + episodic/timeline boost.
3. Secondary score only: `readerForgettingScore` (weight clearly lower than mainline signals).
4. Suppress when cursor has no recoverable prior context, or fewer than 2 usable anchors remain after filtering.
5. Do not surface trivial publication / birth-death / incidental place noise.
6. Type-adaptive: empty people/places is fine; topics/arguments/episodic may lead.
7. No RAG / HNSW / vector / embedding.

## Verification

- `npm run build`
- Node smoke: suppress first page; select 2–3 anchors from sample memory; filter noise; forgetting changes rank only secondarily
- App recovery open path uses `buildRecoveryPlan` / Context Builder output
- Sub-agent review against this spec
