# Task 1 Report: Feature 019 spec — Reader Memory into bridges

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `a8467f3366af245b0e911bca136b233a7d325fcd`  
**Commit:** `1a6fe80` — spec: Feature 019 Reader Memory into situation-bridge fuel

## Deliverables

| File | Action |
| --- | --- |
| `constitution/features/019-reader-memory-bridge-fuel.md` | Created — Feature 019 spec (verbatim from plan/brief) |
| `constitution/roadmap.md` | Modified — Phase 8 → in progress; Feature 010 links Feature 019 |
| `docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md` | Modified — `Status: implementing` |

## Task checklist

- [x] Step 1: Write Feature 019 spec with Goal, In scope, Out of scope, Acceptance
- [x] Step 2: Link roadmap Feature 010 to Feature 019 implementation vehicle
- [x] Step 3: Commit with brief message (PowerShell-friendly `-m`)

## Self-review

### Spec fidelity
- Feature 019 body matches the plan/brief verbatim (Goal, five in-scope items, three out-of-scope items, three acceptance criteria).
- Global constraints respected in spec wording: secondary reader signal (≤ ~0.15 boost), no adjudicator budget changes, no mobile, no memory dashboard UI.

### Roadmap linkage
- Phase 8 status changed from `planned` to `in progress`.
- Feature 010 includes: `Implementation vehicle this season: Feature 019 (\`constitution/features/019-reader-memory-bridge-fuel.md\`).`

### Design doc
- Season design doc now carries `**Status:** implementing` alongside date and product metadata.

### Interface alignment (pre-implementation sanity)
Existing code already exposes the interfaces named in the brief:
- `normalizeReaderMemory`, `updateReaderMemory`, `readerForgettingScore` in `src/memoryModels.js`
- `collectRecallFuel`, `scoreGapFuel` in `src/situationBridge.js` (reader forgetting already contributes at `* 0.12`)
- `App.jsx` `recordRecoveryInteraction` already patches `rememberedKeys` / `missedKeys` via `updateReaderMemory`

Task 2–3 will wire bridge `candidateId` keys and scoring boosts per Feature 019; this task correctly stops at spec only.

### Concerns
- None blocking. Plan doc (`docs/superpowers/plans/2026-07-27-season-bridge-retention-design.md`) remains untracked; optional to version in a follow-up commit.
- Sub-agent spec review called for in Acceptance — deferred to verify phase after Task 2–3 implementation.

## Tests

N/A — documentation-only task; no code or eval changes.

## Next task

Task 2: Persist card feedback into Reader Memory (`recordRecoveryInteraction`, `markReaderBridgeFeedback`).
