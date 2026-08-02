# Task 4 Report: Hand-eval protocol (differentiator proof)

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `5996c9540dd6b7acc486a3b81f67ec5604989c87`  
**Commit:** `732c674` — docs: hand-eval protocol for situation-bridge hit rate

## Deliverables

| File | Action |
| --- | --- |
| `docs/hand-eval-bridge-protocol.md` | Created 20-case checklist (S01–S10 show, X01–X05 suppress, E01–E03 evidence, R01–R02 ranking) |
| `docs/situation-bridge-evaluation.md` | Added Hand protocol section + season gate link |

## Task checklist

- [x] Step 1: Write protocol — 20 rows with book, chapter/page intent, expected, blank pass/fail/note
- [x] Step 2: Link from evaluation doc — ≥70% show-helpful, ≥80% suppress correct
- [x] Step 3: Commit

## Protocol summary

- **Books:** builtin 《长征》 (14 rows) + imported argument/fiction EPUB (6 rows)
- **Setup:** read + Trace, simulate ≥12h via `yuezhi-reading-activity` or `shumai-recovery-memory`, auto reopen or manual 主动回忆
- **Season gate:** show-helpful ≥70% (S01–S10); suppress ≥80% (X01–X05)
- **Pass/fail left blank** for human fill; local results under `reports/` (not committed)

## Tests

N/A — docs-only task.

## Self-review

### Spec fidelity (Feature 019 item 5)
- 20-case hand protocol documented and linked from evaluation doc: **done**
- No fake pre-filled results: **done**
- Builtin + non-history import called out: **done**

### Concerns
- None blocking. Actual pass rates depend on human season run (Task 9 gate).

## Next task

Task 5: Feature 020 spec — Open-book reliability.
