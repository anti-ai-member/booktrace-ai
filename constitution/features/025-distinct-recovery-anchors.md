# Feature 025: Distinct Recovery Anchors

## Problem

Continued-reading recovery may show the same memory anchor more than once when
local candidates or a model judgement use different candidate IDs for the same
displayed entity. This wastes the two-to-three item recall budget and makes the
card feel unreliable.

## Scope

1. Treat a normalized displayed anchor title as a recovery-card uniqueness key,
   in addition to candidate IDs.
2. Deduplicate both local and adjudicated bridge selections before they are
   accepted into a plan. Keep the highest-confidence / highest-score bridge.
3. If an adjudicated selection loses uniqueness, fill remaining slots with
   distinct local bridges when available.
4. Apply the same guard while turning a plan into a card, so newly generated
   cards cannot duplicate an anchor.
5. Apply the guard at rendering time for persisted cards created before this
   feature.

## Non-goals

- Do not add title-specific entity rules.
- Do not increase the three-anchor budget.
- Do not alter gap extraction, model prompts, or recovery-card layout.

## Acceptance

- A recovery card never shows the same normalized anchor title twice.
- Different anchors with distinct titles remain eligible.
- Existing evaluation and production build pass.
