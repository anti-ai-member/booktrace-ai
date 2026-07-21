# Feature 005: Reader UX Simplification

## Status

Verified.

## Problem

Phase 5 goals are mostly present, but floating primary surfaces still compete with reading: `context-drawer`, `open-context` FAB, paragraph `selection-tools`, and analysis summary modal. Selection bloom intents「回忆」「解惑」「出处」are stubs or reopen the drawer. Relationship workspace only pushes the canvas when the sidebar is expanded, so a collapsed rail can leave a right overlay.

## Goal

Finish Reader UX Simplification so AI stays reading-native: one selection menu, unified left-panel tools, evidence-gated relationship as a left push workspace, no floating primary panels.

## Scope

In scope:

1. Remove floating primary surfaces:
   - Retire `context-drawer`, `open-context` FAB, and in-page paragraph `selection-tools`.
   - Replace post-analyze `AnalysisSummaryModal` with a quiet notice (or AI panel status only).
2. Wire SelectionBloom intents:
   - **回忆** → `openCurrentRecoveryCard` (or equivalent current-page recovery open).
   - **解惑** → quiet left-panel assist showing the selected excerpt + available ContextCite links (no new dashboard).
   - **出处** → jump to the best available evidence / open reading-index panel; never reopen a bottom drawer.
   - **关系** → evidence-gated relationship workspace (already gated); always use left push layout.
3. Relationship layout:
   - `.relationship-open` always uses left rail + workspace + reading canvas push, including when the side content is collapsed.
4. Entity index click:
   - Jump to evidence only; do not open the retired drawer.
   - Person/organization with local relationships may open the relationship workspace after jump when edges exist.

Out of scope:

- Redesigning RecoveryCard / recall-sheet layout (already shipped).
- Memory Engine / AI contract changes (Phase 4).
- Evaluation harness expansion (Phase 6 / Feature 006).
- Note composer modal (allowed as a transient composer).

## Verification

- `npm run build`
- No `context-drawer` / `open-context` / paragraph `selection-tools` rendered in reader JSX.
- Bloom「回忆」opens recovery when prior context exists;「出处」does not open a bottom drawer.
- Opening relationship with collapsed rail still pushes the canvas (no right overlay covering the page).
- Analyze completion does not open a modal dialog.
- Sub-agent review against this spec.

## Roadmap

Marks Phase 5 complete when Verified.
