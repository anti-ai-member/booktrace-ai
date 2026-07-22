# 书脉 Roadmap

## Execution Rhythm

Every implementation task follows this loop:

1. Feature Spec: write or update a focused spec before coding.
2. Feature Implement: change only what the spec permits.
3. Verify: run local checks and ask a sub-agent to review the implementation against the spec.
4. Next Task: only then move to the next roadmap item.

## Phase 0: Constitution

Status: complete.

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

Status: complete (Feature 004 verified).

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

Status: complete (Feature 005 verified).

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

Status: complete (Feature 006 verified).

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

---

## Phase 7: Mission-Grade Continued-Reading Recovery

Status: in progress.

Goal:

Close the gap between “architecture complete” and the mission bar: when a reader returns after time away, the first AI-native experience restores the reading situation model with model-backed recall by default.

### Feature 007 — Reopen model recovery

Status: complete (Verified).

Problem: after absence, reopen currently rebuilds recovery via local Context Builder / paragraph heuristics and often clears a previously stored model card. Auto Trace updates memory without refreshing recovery materials.

Scope:

- On reopen after the absence threshold, prefer `/api/recovery-card` (DeepSeek pro + thinking) using persisted `bookMemory`.
- Show a local Context Builder card immediately when available, then replace with the model card when it succeeds.
- On model failure or empty Memory, keep the local fallback (never block reading).
- Persist a successful model recovery card into the analysis record for the book.
- After automatic Trace, refresh and store recovery materials (do not force-open the overlay mid-reading).
- Fix prior-context gate so chapter N page 0 can still open recall when earlier chapters exist.

Quality gate:

- Reopen after ≥12h absence with stored Memory requests model recovery (or documents why it fell back).
- Manual and automatic Trace both leave a usable stored recovery card when Memory is rich enough.
- `npm run build` passes; sub-agent verifies against Feature 007 spec.

### Feature 008 — Selection 解惑 (typed assist)

Status: complete (Verified).

Problem: selection「解惑」only shows the excerpt plus evidence cites; there is no typed explanation, and the panel looks like a generic AI block.

Scope:

- Mode-based 解惑: 书内出处 / 词条简介 / 深意阐释 / 概念释义 / 前后因果.
- Quiet left-panel redesign (chips + answer + collapsed evidence).
- Secondary 快速 / 深思 speed: flash vs pro+thinking; persist + cache by mode/speed.
- Read-bounded `/api/explain-selection` for non-source modes; source mode stays local cites.
- Fail closed to cite-only assist when the model is unavailable.

### Feature 014 — Persist 选文解惑 markers

Status: complete (Verified).

Problem: 解惑 results vanish when the panel closes; readers cannot revisit an explanation from the original span.

Scope:

- Persist every successful 解惑 result per book in localStorage (`yuezhi-explains:…`).
- Quiet in-text markers on the original selection; collapse multiple explains on one span to one badge + count.
- Long hover (~500ms) shows compact preview only (mode · speed, one-line conclusion, 依据 ×N); click reopens full panel with cached explanation.

### Feature 015 — Note selection underlines

Status: complete (Verified).

Problem: Saved selection notes have no durable in-text mark, and the notes list buries the selected excerpt under the note body.

Scope:

- Persist paragraph/offset anchors with notes; underline matching spans with a quiet solid bottom line (not 「解」badges).
- Notes sidebar: selection excerpt → chapter/page → note content; delete clears underline.

### Feature 015b — Keep EPUB images in reading flow

Status: complete (Verified).

Problem: EPUB parse stripped `<img>` / SVG image refs to text-only paragraphs, so in-book figures never appeared in the reader.

Scope:

- Parse images into `{ type: "image", src, alt }` paragraph blocks with embedded data URLs.
- Render inline figures; page packing includes image height so pages neither clip nor discard figures.
- Memory/search skip image-only blocks safely.

### Feature 009 — Recovery UX correctness polish

Scope:

- Ensure page-title recall control matches Context Builder suppress rules (not merely `pageIndex > 0`).
- Quiet status while model recovery is loading on reopen.
- Avoid flashing empty/wrong cards when job ids race.

Phase 7 quality gate:

- Returning readers get model-backed situation restore when Memory exists.
- Local fallback remains useful without hallucinated claims.

---

## Phase 8: Reader Memory And Type-Specific Aids

Status: planned.

Goal:

Make Reader Memory participate in recall decisions, and surface type-specific aids only when they help understanding.

### Feature 010 — Reader Memory as decision input

- Persist active reading time, remembered/missed, notes, bookmarks into `bookMemory.reader`.
- Feed forgetting and reader events into Context Builder with secondary weight only.
- Keep mainline / current-page fit as primary score.

### Feature 011 — Type-specific memory aids on demand

- Concept / argument / timeline aids appear only when Memory has reliable edges for the current type and page.
- Reuse left-push workspace patterns; no permanent index rail.

Phase 8 quality gate:

- Reader feedback changes ranking without flooding the card with noise.
- Non-history books can recover via topics/arguments without forcing people/places.

---

## Phase 9: Multi-Type Quality And Sample Corpus

Status: planned.

Goal:

Prove mission success standards beyond 《长征》 offline scaffolding.

### Feature 012 — Live multi-type evaluation gate

- Expand fixtures / sample books with coherent multi-chapter text per supported type.
- Live eval path reports relevance, coverage, recoveryFit with non-vacuous mid-page checks.
- Failures point to concrete Memory or prompt problems.

### Feature 013 — Sample shelf completeness

- Explicitly labeled sample book for every supported type with enough text to exercise classification, relevance, priority, and recovery.

Phase 9 quality gate:

- Eval can run offline and live.
- At least one non-history type demonstrates useful recovery anchors with evidence.

---

## Deferred (explicitly out of current phases)

- Large PDF conversion / OCR until Memory quality is stable.
- Social reading, community, recommendation feeds.
- Ability-tree visual productization (currently secondary).
- Chatbot-style freeform Q&A as the primary reading flow.
