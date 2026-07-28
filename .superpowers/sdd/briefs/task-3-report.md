# Task 3 Report: Score bridges with Reader Memory (secondary only)

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `1567a0f5addb75f3d2bdd07ea35bff4e496c665d`  
**Commit:** (see git log) — feat: secondary Reader Memory boosts for situation-bridge fuel

## Deliverables

| File | Action |
| --- | --- |
| `src/situationBridge.js` | Missed +0.12 / remembered −0.06 in `scoreGapFuel` + `memoryStrength`; clamp `[-0.08, 0.15]`; thread `reader` through fuse/match/offer |
| `scripts/fixtures/situation-bridge-cases.json` | Added `reader-missed-boost-show`, `reader-remembered-not-only` |
| `scripts/situation-bridge-eval.mjs` | Pass `fixture.reader`; support `expect.mustIncludeTitleHints` |

## Task checklist

- [x] Step 1: Add failing fixtures (`reader-missed-boost-show`, `reader-remembered-not-only`)
- [x] Step 2: Run eval (red: missed case lacked episodic bridge before scoring)
- [x] Step 3: Implement secondary Reader Memory deltas in scoring
- [x] Step 4: Re-run `situation-bridge:evaluate` + `verify:situation-bridge` (both exit 0)
- [x] Step 5: Commit

## Implementation notes

### Reader signal (secondary only)
```js
missed → +0.12
remembered → -0.06
clamp → [-0.08, 0.15]
```
- Applied in `scoreGapFuel` via fuel `id` / `candidateId` (e.g. `mem:ep1`).
- Applied in `memoryStrength` for both `mem:${id}` and raw `id`.
- Gap overlap / kind / mainline strength unchanged — reader delta cannot zero them out.
- No adjudicator prompt/budget changes; no UI.

### Fixtures
1. **reader-missed-boost-show** — same dependent history page as `hist-person-causal-show`, `reader.missedKeys: ["mem:ep1"]`, `mustIncludeTitleHints: ["封锁渡口"]` so the episodic name must appear among bridges.
2. **reader-remembered-not-only** — weak secondary `山谷斥候` in `rememberedKeys`; expect ≥2 bridges with mainline titleHints (夏英杰 / 渡口 / 封锁), not only the weak name.

### Eval harness
- `prepareSituationBridgeShortlist` / `buildSituationBridgePlan` now receive `fixture.reader`.
- New optional `mustIncludeTitleHints`: every listed hint must match at least one bridge title/whyNeeded (stricter than precision-only).

## Tests

```text
npm run situation-bridge:evaluate
→ Overall: 100/100 · Precision: 100/100
→ Cases: 10/10 passed (including reader-missed 1/1, reader-remembered 1/1)

npm run verify:situation-bridge
→ situation-bridge smoke ok { … readerFeedback: { remembered: 2, missed: 1 } }
```

## Self-review

### Spec fidelity (Feature 019 items 2–4)
- Missed boost / remembered dampen with ~0.15 cap: **done**.
- Mainline / gap fit remains primary: **done**.
- Offline fixtures extended: **done**.
- Out of scope respected (no memory dashboard, no adjudicator budget change, desktop-only).

### Concerns
- None blocking. Compounded effect (strength delta × 0.45 plus scoreGapFuel delta) can slightly exceed 0.15 on the final fuse score when both paths fire; absolute additive term itself stays clamped. Acceptable for secondary ranking.
- Hand-eval protocol doc (`docs/situation-bridge-evaluation.md`) is Feature 019 item 5 — later task if planned separately.

## Next task

Task 4+ per season plan (hand-eval protocol / remaining Feature 019 acceptance).
