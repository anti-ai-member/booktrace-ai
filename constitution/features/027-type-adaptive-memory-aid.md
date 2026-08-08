# Feature 027: Type-Adaptive Memory Aid

## Goal

Turn the same read-bounded Book Memory into the one compact structure that is
most useful for the current book and reading position. The aid is optional and
on demand: it must never compete with the three situation bridges or become a
permanent reading index.

## User flow

1. The reader opens a valid continued-reading recovery card.
2. When Book Memory contains a reliable type-appropriate structure, the card
   footer exposes one icon-only `梳理脉络` action.
3. Activating it closes the recovery card and opens a larger left-side
   workspace that pushes the reading canvas right.
4. The workspace shows one structure only:
   - history / military: chronological or causal timeline;
   - science / technical / textbook: concept or mechanism chain;
   - philosophy / social science / business: argument chain;
   - fiction / biography: evidenced relationship chain, otherwise episodic
     change.
5. Every visible item can jump to its original-text evidence. Closing the
   workspace restores the reading canvas and position.

## In scope

- A pure, book-agnostic selector that operates on canonical Book Memory.
- Strict read-bound filtering; evidence at or after the current paragraph is
  not eligible as prior-context aid material.
- Current-page relevance before priority, recency, or Reader Memory signals.
- Two to five concise items; no single-item pseudo-chain and no filler.
- Explicit links are preferred. Inferred sequence is allowed only for ordered
  events with distinct source positions, and is labelled as sequence rather
  than causation.
- Extend Trace output fields so future Memory can retain concept prerequisites,
  argument roles, and timeline causal references without title-specific rules.
- Quiet left-push workspace UI and ContextCite evidence jumps.
- An offline verification script covering history, science, argument, fiction,
  no-spoiler, irrelevant-primary, and insufficient-evidence cases.

## Out of scope

- A global graph, permanent reader rail entry, or whole-book mind map.
- Model calls when opening the aid; it must be instant from persisted Memory.
- Inventing edges from general knowledge or title similarity alone.
- RAG, vectors, HNSW, or full-chapter prompt stuffing.
- Mobile-specific layout work.

## Decision rules

1. Resolve an aid profile from the classified book type, not from a hardcoded
   title.
2. Require at least one item or explicit edge to match a concrete current-page
   dependency or one of the accepted situation bridges.
3. All remaining items must connect to that seed through an explicit Memory
   reference, a shared evidenced entity/concept, or chronological adjacency for
   a timeline/episode aid.
4. Bare entities, incidental places, publication metadata, biographies, and
   unrelated primary memories are excluded.
5. Return `null` when fewer than two connected evidenced items remain.

## Acceptance

- History, science, argument, and fiction fixtures select different aid kinds.
- An important but unrelated memory never appears as filler.
- Current/future paragraph evidence never appears in the aid.
- Every shown item has a readable title, summary, relation label, and evidence.
- The recovery card exposes no aid action when the selector returns `null`.
- The workspace opens from the left, pushes the reader, closes cleanly, and
  returns to evidence without losing reading position.
- `npm run verify:memory-aid` passes.
- `npm run verify:situation-bridge` and `npm run situation-bridge:evaluate`
  remain green.
- `npm run build` passes.
- A sub-agent verifies the implementation against this spec.

## Verification

Status: complete (Verified).

- `verify:memory-aid`: PASS, including canonical taxonomy mapping, incremental
  concept-link retention, no-spoiler filtering, relevance, and suppression.
- `verify:situation-bridge`: PASS.
- `situation-bridge:evaluate`: 12/12, overall 98, precision 94,
  suppressAccuracy 100.
- Production build and `git diff --check`: PASS.
- Independent sub-agent review: PASS after correcting the canonical
  `历史纪实 / 传记` category to resolve as a timeline profile.
- Live reader smoke: opening and page rendering remain responsive; an empty
  model response is surfaced without inventing a memory aid.
