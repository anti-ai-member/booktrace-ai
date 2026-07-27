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
- `precision` ≥ 70
- `suppressAccuracy` ≥ 80
- `budgetCompliance` = 100
- `inventIdReject` = 100

## What this does not do

- Does not dump prior chapters into a model for offline mode
- Live mode only sends the adjudicator shortlist budgets already enforced by `/api/situation-bridge`
