# Feature 019: Reader Memory → Situation-Bridge Fuel

## Goal
Use「想起了 / 没想起」and prior reader traces as *secondary* ranking signals so the next reopen prefers bridges the reader actually needed.

## In scope
1. Persist recovery card track actions onto `bookMemory.reader` (or the existing recovery-memory storage merged into reader) with `rememberedKeys` / `missedKeys` keyed by bridge `candidateId` / `memoryKey`.
2. In `situationBridge.js` `scoreGapFuel` / fuel strength: missed keys boost, remembered keys mild dampen (never zero out mainline fit).
3. Keep mainline / current-page gap fit primary; reader signal ≤ ~0.15 absolute boost.
4. Extend offline fixtures with one missed-key and one remembered-key case.
5. Document hand-eval protocol (20 cases) in `docs/situation-bridge-evaluation.md`.

## Out of scope
- New UI chrome for a "memory dashboard"
- Changing adjudicator prompt budgets
- Mobile

## Acceptance
- `npm run situation-bridge:evaluate` still passes; new fixtures green
- Manual: mark 没想起 on a bridge → next manual History prefers related fuel when gaps match
- Spec review by sub-agent against this file
