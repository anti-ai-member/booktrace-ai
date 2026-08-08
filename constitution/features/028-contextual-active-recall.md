# Feature 028: Contextual Active Recall

## Goal

Make active recall feel like one natural reading action whose scope follows the
reader's intent. The topbar action recalls what the current page depends on;
the selected-text action recalls only prior context needed for the selected
passage. Both reuse the same situation-bridge card, evidence jumps, Memory
Engine, and precision-first suppression rules.

## User flow

1. The reader uses the topbar history icon to recall prerequisites for the
   current page, as today.
2. Alternatively, the reader selects a word or passage and activates 回忆 in
   the transient selection toolbar.
3. Selection recall uses the exact selection as the focus and its containing
   paragraph only as disambiguating context. It never silently falls back to a
   generic current-page card.
4. When at least one reliable prior bridge is linked to that focus, the normal
   recovery card opens with a quiet `针对选中内容` context label.
5. When no reliable focus-linked bridge exists, the selection toolbar closes
   and a short notice explains that no prior context is needed or reliable.
6. Evidence actions return to the original source; closing or continuing
   returns to the same reading position.

## In scope

- A pure focus filter for situation gaps.
- Selection-aware cursor and containing-paragraph context.
- Exact focus propagation through local shortlist and the existing compact
  model adjudicator contract.
- A small context marker on the existing recovery card.
- Chinese and English chrome strings.
- Regression coverage for focused entity recall, focused causal recall,
  unrelated-gap rejection, and first-page suppression.

## Out of scope

- New model endpoints, chat, freeform questions, or full-page prompt stuffing.
- A second recovery-card design or a new permanent reader control.
- Changing 选文解惑, notes, bookmarks, or relationship workspace behavior.
- Guessing a relationship when Memory or evidence does not support it.

## Decision rules

1. `focusText` is optional. Without it, current-page recall behaves exactly as
   before.
2. With `focusText`, retain only gaps whose label or evidenced page context
   overlaps the normalized selection. A short selected entity may match by
   exact name; a selected sentence may match by meaningful terms.
3. A selected paragraph supplies context but must not make unrelated entities
   eligible.
4. All candidates remain strictly before the selected paragraph cursor.
5. If focused gaps or linked prior fuel are insufficient, suppress. Never show
   generic filler merely because the user explicitly clicked 回忆.
6. The selection itself is never persisted as Book Memory by this action.

## Acceptance

- A selected known person or concept recalls its relevant prior state rather
  than another important item on the page.
- A selected causal clause can recover a linked prior event.
- An unrelated high-priority Memory item is excluded.
- Current/future evidence is excluded.
- Topbar current-page recall remains unchanged.
- Selection recall visibly says it is scoped to selected content.
- No new floating primary panel or permanent icon is introduced.
- Existing evidence jumps and reading-position preservation still work.
- `npm run verify:active-recall` passes.
- Situation-bridge evaluation and production build remain green.
- A sub-agent verifies the implementation against this spec.

## Verification

Status: implemented and independently verified (PASS).
