# Situation-Bridge Evaluation

Offline (and optional live) gate for Feature 018 continued-reading **situation bridges**. Precision beats coverage: an irrelevant bridge is a failure; a quiet suppress on a low-dependency page is a success.

## Run

```bash
npm run situation-bridge:evaluate
```

Optional live adjudicator (requires `npm run dev` + DeepSeek key):

```bash
npm run situation-bridge:evaluate:live
```

Custom output:

```bash
node scripts/situation-bridge-eval.mjs --out reports/situation-bridge-eval.json
```

Fixtures live in `scripts/fixtures/situation-bridge-cases.json`, labeled by critical factor and book type (history + argument + fiction).

## Metrics

| Score | Meaning |
| --- | --- |
| `precision` | Among expected-show cases, share of bridges that hit annotated title hints (precision-first) |
| `suppressAccuracy` | Expected suppress stays silent; expected-show does not falsely suppress |
| `coverage` | Expected-show cases that still produce usable bridges |
| `budgetCompliance` | Gaps ≤6, candidates ≤12, snippets ≤80 |
| `inventIdReject` | Adjudicator path never admits invented `gapId` / `candidateId` |
| `overall` | Weighted blend (precision heaviest) |

## Pass criteria

- `overall` ≥ 80
- every fixture passes, including adversarial forbidden-anchor cases
- `precision` ≥ 85
- `suppressAccuracy` ≥ 85
- `budgetCompliance` = 100
- `inventIdReject` = 100

## Hand protocol

Automated fixtures catch regressions; they do not prove usefulness on real mid-book pages. Before season close, run the **20-case desktop checklist** in [`hand-eval-bridge-protocol.md`](./hand-eval-bridge-protocol.md):

- Built-in 《长征》 plus one imported argument or fiction EPUB
- 10 show · 5 suppress · 3 evidence-jump · 2「没想起」reopen-ranking cases
- Fill pass/fail locally — do not commit private results

**Season gate (hand):** show-helpful ≥ **70%** on show rows; suppress correct ≥ **80%** on suppress rows.

**Season engineering gate (2026-07-28):** `verify:situation-bridge`, `situation-bridge:evaluate` (98/100, 10/10), and `build` are green on `season/bridge-retention`. Hand protocol remains for human UX sign-off.

## What this does not do

- Does not dump prior chapters into a model for offline mode
- Live mode only sends the adjudicator shortlist budgets already enforced by `/api/situation-bridge`
- Does not replace human helpfulness judgment — use the hand protocol for that
