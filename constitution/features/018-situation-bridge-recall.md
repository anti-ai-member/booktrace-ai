# Feature 018: Situation-Bridge Recall

## Goal

Replace question-first recovery cards with **on-demand situation bridging**: only when the current page has real prior-context gaps worth resolving, show 2–3 bridges that reconnect the reader’s situation model — never dump prior chapters into the model.

## Phase A (done)

- Local multi-channel gap → fuel → candidate fuse → high-threshold bridges
- On-demand suppress: `page-not-dependent` | `low-importance-gaps` | `no-bridges` | …
- Recovery card UE: bridges as visual focus; optional question collapsed; no separate prerequisites block
- Manual History + reopen (≥12h) use the same plan builder

## Phase B (done)

- Judge-only API `/api/situation-bridge` over ≤6 gaps + ≤12 short candidates (≤80-char snippets)
- Hard `gapId` + `candidateId` validation; reject invented ids
- Client: local shortlist → optional adjudicator → fall back to local bridges if judge &lt;2
- No `bookMemory` dump / no chapter texts in the adjudicator prompt
- Legacy `/api/recovery-card` summary polish stays off

## Phase C (this milestone)

Offline (+ optional live) eval harness for situation bridges:

- Fixtures labeled by critical factor (`person` / `causal` / `intent` / `concept` / …) and book type (history + non-history)
- Metrics (precision first): suppress accuracy, bridge precision, factor coverage, budget compliance, invent-id rejection
- Entry: `npm run situation-bridge:evaluate` → `reports/situation-bridge-eval.json`

## Critical factors (gap kinds)

`person` | `relation` | `causal` | `intent` | `temporal` | `spatial` | `concept` | `state`

## SituationBridgePlan

```js
{
  suppressed: boolean,
  reason: null | "recent-activity" | "low-context" | "page-not-dependent"
    | "low-importance-gaps" | "no-bridges" | "low-confidence",
  intensity, absenceLabel, positionLabel,
  gaps: [{ id, label, kind }],
  bridges: [{
    id, gapId, candidateId, title, whyNeeded, gapKind, evidence
  }], // 2-3 when shown
  question: null | { prompt, hint?, answer?, evidence },
  evidence: [],
  candidates: [], // shortlist / adjudicator input
  source: "local" | "adjudicator",
}
```

## Trigger rules

Auto: absence ≥ 12h **and** page-dependent **and** ≥2 bridges.  
Manual: skip absence gate; still suppress if page not dependent or &lt;2 bridges (toast, no fake card).  
Never auto-trigger on ordinary page turns.

## Acceptance (Phase C)

- Offline eval exits 0 when gate passes (precision / suppressAccuracy thresholds)
- Report includes per-factor rows and overall scores
- Invented adjudicator ids never count as hits
- `npm run verify:situation-bridge`, `npm run situation-bridge:evaluate`, and `npm run build` pass

## Status

Phase A + B + C implemented. Eval is the regression gate for bridge precision and on-demand suppress.
