# Feature 026: Precision-First Situation Bridges

## Goal

Increase continued-reading bridge hit rate by answering one question more
reliably: **what prior memory is necessary to understand this page now?**

The feature optimizes precision before coverage. A quiet suppression is better
than showing an important but unrelated person, event, place, or concept.

## Problem

The existing local matcher can admit a candidate from kind compatibility and
global Memory strength alone. That makes a primary entity or event eligible
even when it has little semantic contact with the current-page dependency.
Global candidate top-ups and same-gap filling can then spend a scarce recovery
slot on a mainline-looking but irrelevant anchor.

## In scope

1. Make current-page gaps carry compact dependency terms derived from the
   evidenced sentence or referenced Memory anchor.
2. Require pair-specific linkage between a gap and candidate:
   - direct anchor/title mention,
   - meaningful lexical overlap,
   - or an evidenced relation through the same named entity/concept/action.
3. Keep importance, proximity, forgetting, and Reader Memory as ranking signals
   only after pair linkage is established.
4. Remove unlinked global candidate top-ups and prevent a single vague gap from
   being filled with unrelated high-strength anchors.
   A manual recall request may return one strong bridge when the page has only
   one real prerequisite; automatic interruption still requires two.
5. Prefer episode/argument/concept anchors over bare entity identity when both
   explain the same dependency.
6. Reject noisy or weak candidates without evidence, readable title, or an
   explanatory snippet.
   Candidate evidence must be strictly before the current reading cursor; the
   current paragraph must never be echoed back as prior-context fuel.
7. Preserve the existing budgets: at most 6 gaps, 12 candidates, and 3 shown
   bridges; never send prior chapters to the adjudicator.
8. Extend the benchmark with adversarial cases:
   - an important but unrelated person must not displace the relevant event;
   - an important but unrelated same-kind event must not be used as filler;
   - a low-dependency descriptive page remains suppressed.

## Out of scope

- New recovery-card UI.
- Whole-book summarization or RAG/vector retrieval.
- Rewriting Memory extraction prompts.
- Mind-map or type-specific aid workspaces.
- Mobile work.

## Acceptance

- Every selected local bridge has a positive pair-link reason.
- No candidate is selected solely because it is primary/recent or has a strong
  Reader Memory signal.
- Adversarial irrelevant-primary fixtures pass.
- Existing history, argument, fiction, and Reader Memory fixtures stay green.
- `npm run verify:situation-bridge` passes.
- `npm run situation-bridge:evaluate` passes with precision >= 85 and
  suppressAccuracy >= 85.
- `npm run build` passes.
- A sub-agent verifies implementation against this spec.

## Verification

Status: PASS.

- `npm run verify:situation-bridge`: pass, including current-paragraph echo,
  unpositioned reader asset, invented ID, and valid-ID cross-gap mismatch gates.
- `npm run situation-bridge:evaluate`: 12/12; precision 94;
  suppressAccuracy 100; overall 98.
- `npm run build`: pass.
- Independent sub-agent review: PASS; remaining live/multi-book coverage belongs
  to Phase 9 and does not block this feature.
