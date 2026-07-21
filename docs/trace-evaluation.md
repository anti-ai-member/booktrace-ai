# AI Trace Evaluation

This evaluation suite checks whether BookTrace AI produces useful, grounded reading memory for the current read range. The first target fixture is the first 30 pseudo-pages of `books/长征 (王树增著).epub`.

## Why This Exists

Trace is the product's core value. A result is not good just because it returns many people, places, and dates. It is good when it helps the reader remember the book's main thread, stays inside the read boundary, and can point back to original evidence.

The rubric borrows the spirit of Agentic evaluation: define task success clearly, test intermediate artifacts, inspect groundedness, measure failure modes, and keep a human or model judge rubric for subjective quality.

## Run

Offline preflight, without calling a model:

```bash
npm run trace:evaluate
```

Live model evaluation, using the local API and `.env` model keys:

```bash
npm run dev
npm run trace:evaluate:live
```

Live model evaluation plus LLM-as-judge scoring:

```bash
npm run dev
npm run trace:evaluate:judge
```

Custom inputs:

```bash
node scripts/trace-eval.mjs --book "books/长征 (王树增著).epub" --pages 30 --out reports/trace-eval-long-march-30p.json --live --judge
```

## Objective Scores

- `evidenceGrounding`: every output item must cite a valid chapter/paragraph and quote that appears in the source.
- `scopeSafety`: no item may cite beyond the selected read boundary.
- `noSpoiler`: hard fail when evidence points beyond the read range.
- `jsonFormat`: required arrays exist so the UI can render safely.
- `nonRedundancy`: repeated names and duplicate entries reduce the score.
- `priorityCalibration`: primary items should stay within the Trace Profile caps.
- `schemaValidity`: index arrays and optional bookMemory buckets keep expected shapes.
- `noUndefined`: names and display strings must not contain literal `undefined` / `null` / `nan`.
- `noiseRate`: share of birth/publish/weak-quote noise among output entries (lower is better; overall uses `100 - noiseRate`).
- `recoveryFit`: Context Builder recovery plan checks (first-page suppress, ≤3 anchors, ≤2 prerequisites, no undefined labels).

## Heuristic Quality Scores

- `relevance`: evidence should contain action, causality, conflict, decisions, movement, or explanation signals; weak background signals reduce the score.
- `coverage`: high-impact candidates from the retrieval stage should be represented in the final trace when they are truly relevant.

## Human / LLM Judge Rubric

Use a 1-5 scale for:

- `task_success`: does Trace help a reader remember the first 30 pages?
- `groundedness`: are all claims evidence-backed?
- `relevance`: did it filter incidental dates, birth years, background names, and throwaway places?
- `coverage`: did it capture the main memory anchors for this book type?
- `priority`: are primary items worthy of default display?
- `conciseness`: is it selective rather than encyclopedic?
- `safety`: does it avoid unread content?
- `usefulness`: does it reduce rereading and lookup cost?

When `--judge` is enabled, the script sends a compact payload to the configured model. The judge sees objective scores, retrieved ContextCite evidence, failures, and the Trace output. It does not see the full book, so the judgment stays focused on product usefulness and evidence quality rather than memorized knowledge.

## Pass Criteria

For the first quality gate, a Trace run is acceptable when:

- overall score >= 80
- evidenceGrounding >= 90
- scopeSafety = 100
- noSpoiler = 100
- relevance >= 75
- no critical judge dimension is below 3

If a run fails, fix in this order:

1. Evidence parsing and citation validity.
2. Read-boundary filtering.
3. Prompt rules for relevance and exclusion.
4. Candidate extraction recall.
5. Priority calibration and UI defaults.
