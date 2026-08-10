# Feature 030: On-demand Local Context Views

## Goal

Turn the existing relationship workspace into an evidence-backed local context
view that appears only when selected text has a reliable one-hop relationship,
concept dependency, causal link, or argument link in the already-read Memory.

## User flow

1. The reader selects a person, organization, event, concept, or claim.
2. The transient selection toolbar shows `关联` only when a local view can be
   built for that exact selection.
3. Clicking it opens the existing large left-push workspace; the reading canvas
   remains visible on the right.
4. The workspace title adapts to the content: `上下文关系`, `概念关联`,
   `因果承接`, or `论证脉络`.
5. The graph shows only the focus and its direct evidenced neighbors. Selecting
   a link reveals a short relation label and a jump to its original evidence.
6. Closing returns to the same reading position.

## In scope

- A pure builder for a read-bounded local context view.
- Relationship edges from canonical `bookMemory.relationships`.
- Topic edges from `prerequisites` and `relatedTo`.
- Timeline/event edges from `causedBy` and `causes`.
- Argument edges from `supports` and `respondsTo`.
- Exact-selection focus before page-context fallback; selection action never
  silently opens an unrelated page-wide graph.
- At most 7 nodes and 8 one-hop edges.
- Every node and edge has usable original-text evidence.
- Reuse the left-push React Flow workspace; no minimap and no permanent rail
  entry.

## Out of scope

- Whole-book graph browsing, automatic graph popups, graph editing, or inferred
  LLM edges.
- Multi-hop expansion, graph search, or a new backend endpoint.
- Reintroducing the legacy reading-index graph tab.
- Showing nodes whose only evidence is beyond the current cursor.
- Replacing the Memory Aid or continued-reading card.

## Decision rules

1. When a selection exists, at least one canonical node/relationship endpoint
   must match that selection. Page text may disambiguate but cannot choose a
   different focus.
2. Only explicit canonical fields create edges. Do not infer similarity from
   co-occurrence.
3. Every edge must connect two evidence-bearing nodes and carry source evidence.
4. All evidence must be at or before the current read cursor; unread evidence
   is excluded.
5. Prefer primary and recent direct neighbors, then proximity. Deduplicate by
   normalized endpoint pair and relation.
6. A view with no reliable edge is suppressed and the `关联` action is hidden.

## Acceptance

- Selecting a person with an evidenced relationship opens only its one-hop
  context.
- Selecting a concept with a canonical prerequisite opens a concept view.
- Selecting an event with an explicit cause opens a causal view.
- Selecting a claim with an explicit support/responds-to link opens an argument
  view.
- An unrelated selection, inferred-only pair, future edge, or orphan node is
  suppressed.
- Every visible detail can jump to original evidence.
- Existing relationship left-push layout and reading-position preservation stay
  intact.
- `npm run verify:local-context-view`, `npm run build`, and existing recall
  regression gates pass.
- Browser inspection and a sub-agent verification both pass.

## Verification

Status: implemented and verified.

- Pure relationship/concept/causal/argument builder: PASS.
- Exact focus, future-evidence suppression, one-hop and size bounds: PASS.
- Existing recovery and Reader Memory regression gates: PASS.
- Production build and browser reader smoke test: PASS.
- Independent sub-agent review: PASS after tightening short-selection matching.
