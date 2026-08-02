# Task 5 Report: Feature 020 spec — Open-book reliability

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `732c6747c868a76f4b5102532e2766197f48f1d7`  
**Commit:** `73e88a7` — spec: Feature 020 open-book reliability

## Deliverables

| File | Action |
| --- | --- |
| `constitution/features/020-open-book-reliability.md` | Created per brief (Goal, In scope 1–4, Out of scope, Acceptance) |

## Task checklist

- [x] Step 1: Write Feature 020
- [x] Step 2: Commit

## Tests

N/A — spec-only task; no runtime or eval changes.

## Self-review

### Spec fidelity
- Goal: cold profile builtin, import failure guidance, non-blocking Trace — **matches brief**.
- In scope items 1–4 and Out of scope / Acceptance — **verbatim from brief body**.
- Format aligned with existing feature specs (e.g. Feature 019).

### Concerns
- None blocking. Implementation is Task 6 (`App.jsx`, shelf retry, duplicate import, offline AI notice).

## Next task

Task 6: Implement open-book reliability per Feature 020.
