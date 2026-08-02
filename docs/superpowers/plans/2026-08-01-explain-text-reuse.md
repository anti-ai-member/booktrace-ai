# Explain Text Reuse Implementation Plan

> **For agentic workers:** Spec `docs/superpowers/specs/2026-08-01-explain-text-reuse-design.md`. Tasks below are done in this session.

## Tasks

1. `explainMemory.js`: exact-text find + pick helpers + unit test
2. `App.jsx` bloom → 解惑: position cache, else text cache, else fresh; text reuse stays on page; persist anchors to original
3. Persist only reuses `fromExplainId` when mode+speed unchanged
4. Update `docs/product-ui-ux-spec.md` + `AGENTS.md`
