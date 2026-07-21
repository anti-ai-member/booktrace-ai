# Feature 006: Evaluation System Hardening

## Status

Verified.

## Problem

`scripts/trace-eval.mjs` already runs offline/live/judge eval for Trace analysis, but Phase 6 metrics are incomplete: schema validity, no-undefined, noise rate, and recovery-card quality are not first-class scores. Fixtures stay history-heavy.

## Goal

Extend the local evaluation harness so scores cover Phase 6 quality gates and remain comparable across model/prompt revisions.

## Scope

In scope:

1. Add explicit objective scores to the report:
   - `schemaValidity` (bookMemory / index shape)
   - `noUndefined` (display strings / names)
   - `noiseRate` (weak or incidental items vs total)
2. Add a **recovery-card** offline check path using Context Builder / local recovery assembly:
   - first-page suppression
   - anchors ≤ 3
   - prerequisites ≤ 2
   - no undefined labels
3. Keep existing `npm run trace:evaluate` / `:live` / `:judge` entry points; extend report JSON rather than replace the script.
4. Document the metric names in `docs/trace-evaluation.md`.

Out of scope:

- Building a full second book fixture corpus (may stub one non-history typeSmoke expansion).
- UI changes.
- Replacing Memory Engine contracts.

## Verification

- `node scripts/trace-eval.mjs` (offline) exits 0 and prints/new fields for schemaValidity, noUndefined, noiseRate, recovery.
- `npm run build` still passes.
- Sub-agent review against this spec.

## Roadmap

Marks Phase 6 complete when Verified.
