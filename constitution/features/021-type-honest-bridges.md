# Feature 021: Type-Honest Situation Bridges

## Goal
Non-history books recover via concepts/arguments/intent, not forced people/places lists.

## In scope
1. `prepareSituationBridgeShortlist` accepts `bookType` / profile category and weights `extractPageGaps` + channel fusion.
2. Argument/science: boost concept/intent gaps; demote incidental person gaps unless primary.
3. Fiction: boost person/intent/relation; demote abstract mega-topics.
4. One new argument fixture + one fiction fixture already exist — tighten expects for gapKinds.
5. Sample shelf: ensure at least one non-history sample is labeled (Feature 013 lite — may reuse existing taxonomy samples if present).

## Out of scope
- Full sample corpus for every taxonomy type (full Feature 013 later)
- New graph UI

## Acceptance
- `situation-bridge:evaluate` byFactor shows concept+intent and intent+reader passing
- Hand protocol includes ≥3 non-history rows
