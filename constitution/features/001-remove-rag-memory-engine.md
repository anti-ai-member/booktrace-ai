# Feature 001: Remove RAG And Establish Memory Engine Core

## Status

Verified.

## Problem

The current runtime still depends on `src/rag.js`, which mixes paragraph chunks, keyword indexes, entity indexes, simulated embeddings, and an in-memory HNSW graph. This conflicts with the new product architecture: Memory Engine should decide what matters; evidence location should be lightweight and read-bounded.

## Goal

Remove the RAG/HNSW/vector pipeline from runtime code and replace it with a Memory Engine foundation that keeps the current reader working:

- search still returns source-backed results,
- analysis still receives candidate memory anchors,
- recovery cards still receive ContextCite-style evidence,
- no foreground UI blocking is introduced.

## Scope

In scope:

- Delete `src/rag.js`.
- Add a lightweight `src/memoryEngine.js`.
- Replace imports and state names in `src/App.jsx`.
- Replace `retrievedEvidence` runtime payload naming with `supportingEvidence`.
- Update server prompt/API naming to avoid RAG language while preserving compatibility where useful.
- Update docs and project instructions that still point to the old RAG/HNSW direction.

Out of scope:

- Full persistent Entity/Timeline/Topic/Argument/Episodic/Reader Memory schemas.
- New UI layout.
- PDF parser fixes.
- A new benchmark dataset.

## Data Contract

`buildMemoryEvidenceStore(book, traceIndex)` returns:

- `bookId`
- `chunks`
- `chunkMap`
- `keywordIndex`
- `entityIndex`
- `timeIndex`

Each chunk contains:

- `id`
- `bookId`
- `chapterIndex`
- `chapterTitle`
- `paragraphIndex`
- `text`
- `entities`
- `timeMentions`
- `tokens`

`locateEvidence(store, options)` returns read-bounded results with:

- source coordinates,
- excerpt,
- score,
- `matchSources`,
- `cite` with ContextCite-compatible fields.

`buildMemoryCandidates(chapters, traceProfile)` returns high-recall candidate anchors:

- `id`
- `type`
- `name`
- `count`
- `occurrences`
- `contexts`
- `impactHint`

## Implementation Rules

- Do not introduce vector, embedding, HNSW, or RAG code.
- Evidence scoring may use lexical tokens, entity overlap, reading proximity, and trace importance only.
- Keep existing model API routes working.
- Keep all source location filtered by current read cursor when provided.
- Yield during large candidate extraction so UI remains responsive.

## Verification

Local verification:

- `npm run build`
- `rg -n "from .*/rag|rag\\.js|HNSW|embedding|embedTokens|vector|RAG" src server.mjs package.json`

Sub-agent verification:

- Confirm the implementation matches this spec.
- Confirm no runtime RAG/HNSW/vector path remains.
- Confirm search, analysis payload construction, and recovery card construction still have evidence/citation objects.
