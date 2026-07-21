# 书脉 Roadmap

## Execution Rhythm

Every implementation task follows this loop:

1. Feature Spec: write or update a focused spec before coding.
2. Feature Implement: change only what the spec permits.
3. Verify: run local checks and ask a sub-agent to review the implementation against the spec.
4. Next Task: only then move to the next roadmap item.

## Phase 0: Constitution

Status: in progress.

Deliverables:

- `constitution/mission.md`
- `constitution/teck-stack.md`
- `constitution/roadmap.md`
- AGENTS guardrail requiring spec-first implementation.

## Phase 1: Remove RAG And Establish Memory Engine Core

Status: complete (Feature 001 verified).

Goal:

Remove the heavy RAG implementation completely and replace it with a lighter Memory Engine foundation.

Feature 001:

- Delete runtime RAG module and imports.
- Remove HNSW, vector, and embedding simulation logic.
- Introduce `memoryEngine` functions for:
  - read-bounded paragraph evidence location,
  - candidate memory anchor extraction,
  - ContextCite-style source object creation.
- Rename runtime state away from `evidenceStore`/`retrievedEvidence` when it represents Memory Engine support data.
- Keep model analysis and recovery behavior working.

Quality gate:

- `npm run build` passes.
- Runtime `src` has no RAG/HNSW/vector/embedding references.
- Search and recovery still have evidence citations.

## Phase 2: Memory Models

Status: complete (Feature 002 verified).

Goal:

Make memory explicit instead of relying on generic indexes.

Features:

- Entity Memory: people, organizations, places, terms, with role, status, latest change, relationships, evidence.
- Timeline Memory: time points, event order, causal links, evidence.
- Topic/Semantic Memory: concepts, definitions, mechanisms, frameworks, examples.
- Argument Memory: claim, reason, evidence, example, conclusion.
- Episodic Memory: chapter and scene-level main events.
- Reader Memory: reading position, absence duration, remembered/missed feedback, notes, bookmarks, active reading time.

Quality gate:

- Memory schema is type-adaptive.
- No book-specific extraction rules.
- Memory can be incrementally merged.

## Phase 3: Context Builder And Recall Policy

Status: complete (Feature 003 verified).

Goal:

Decide what the reader should recall at the current page.

Features:

- Current-page prerequisite detection.
- Prior key-point selection from Memory.
- Forgetting-aware scoring as a secondary factor, not the primary factor.
- First-page and low-context suppression.
- One-screen recovery card.

Quality gate:

- Recovery chooses 2-3 high-value anchors.
- Does not surface trivial names, dates, or publication metadata.
- Does not require sending hundreds of pages to the model.

## Phase 4: AI Contracts

Goal:

Make prompts and API payloads match Memory Engine architecture.

Features:

- Book-type classification contract.
- Incremental memory extraction contract.
- Recovery card contract.
- Evidence validation and normalization.
- Failure fallback that remains useful without hallucination.

Quality gate:

- Invalid or weak model output is filtered.
- No `undefined` UI output.
- Evidence references resolve to real source paragraphs.

## Phase 5: Reader UX Simplification

Goal:

Keep AI abilities visible but reading-native.

Features:

- Continue-reading recovery entry.
- Selection action menu focused on reader intent.
- Unified left-panel behavior.
- Relationship view only when useful and evidence-backed.

Quality gate:

- No floating primary panels.
- Reading canvas remains dominant.
- UI follows `docs/product-ui-ux-spec.md`.

## Phase 6: Evaluation System

Goal:

Evaluate AI Trace and Memory quality across book types.

Features:

- Objective metrics: evidence correctness, schema validity, no-spoiler, no-undefined, coverage, noise rate.
- Subjective rubric: usefulness, coherence, recall value, current-page fit.
- Benchmark fixtures starting with 《长征》前 30 页 and expanding to other book types.

Quality gate:

- Evaluation can run locally.
- Scores are comparable across model/prompt revisions.
- Failures point to concrete memory or prompt problems.
