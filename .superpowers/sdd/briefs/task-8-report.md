# Task 8 Report: Type-honest weighting for situation bridges (Feature 021)

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `5267012` (Task 7)  
**Commit:** `38f2885` — `feat: type-honest gap/fuel bias for situation bridges`

## Deliverables

| File | Action |
| --- | --- |
| `src/situationBridge.js` | Added `typeBias(category)`; bias gap importance + `scoreGapFuel` kind bonus; threaded through shortlist/fuse/match/offer |
| `src/App.jsx` | `prepareSituationRecovery` / call sites pass `bookType: book.bookType \|\| bookProfile?.category` |
| `scripts/situation-bridge-eval.mjs` | Pass `fixture.bookType` into shortlist options |
| `scripts/fixtures/situation-bridge-cases.json` | Tightened argument/fiction `gapKinds`; fixed Task 3 Minor `rememberedKeys` → `["mem:e-weak"]` |

## Task checklist

- [x] Step 1: `typeBias` + apply to gap importance / fuel kind bonus
- [x] Step 2: Pass `bookType` from App prepare paths
- [x] Step 3: Eval + smoke + build (all exit 0)
- [x] Step 4: Commit

## Implementation notes

- Argument/science-like types (`科普|技术|哲学|商业|教材|论证|…` + English `argument`/`science`/…): boost concept/intent/causal; demote person/spatial; primary person demotion softened (+0.12).
- Fiction (`小说|文学` / `fiction`): boost person/intent/relation; demote concept.
- Default (history-like): mild person/causal/temporal/spatial boost.
- Feature 013 lite: shelf still only has labeled history sample（《长征》); no easy non-history sample corpus in-tree — **deferred** full Feature 013.

## Tests

- `npm run situation-bridge:evaluate` — pass (10/10); `concept+intent` 1/1; `intent+reader` 1/1
- `npm run verify:situation-bridge` — pass
- `npm run build` — pass

## Self-review

### Spec fidelity (Feature 021)
- Shortlist accepts `bookType` / profile category and weights gaps + fusion: **done**
- Argument boosts concept/intent; demotes incidental person: **done**
- Fiction boosts person/intent/relation: **done**
- Fixtures tightened: **done**
- Non-history shelf sample: **skipped** (deferred; noted above)

### Concerns
- Argument fixture page often folds intent into a longer causal clause via dup suppression; type bias still elevates concept fuel matching.
- Eval `gapKinds` check remains OR (`some`); tightened lists are narrower but not AND-all.
- Full multi-type sample corpus (Feature 013) still out of scope.

## Next task

Task 9: Season gate + roadmap closeout.
