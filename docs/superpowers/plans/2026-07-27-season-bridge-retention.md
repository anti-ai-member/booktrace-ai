# Season Bridge Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 书脉 win as a second-layer serious reader by maximizing situation-bridge hit rate and open-book reliability — never by growing a catalog.

**Architecture:** Keep Memory Engine + local shortlist + judge-only adjudicator. This season wires Reader Memory feedback into bridge fuel scoring, hardens builtin/import open paths, and proves non-history recovery with type-honest anchors. No new RAG, no book store, no default AI dashboards.

**Tech Stack:** Existing React reader (`src/App.jsx`), `src/situationBridge.js`, `src/memoryModels.js`, Express `/api/situation-bridge`, offline eval `scripts/situation-bridge-eval.mjs`, Feature specs under `constitution/features/`.

## Global Constraints

- Product name `书脉`; slogan `读得清脉络，记得住来处`.
- Do not compete on book count; imported + builtin books only.
- Never dump prior chapters / full `bookMemory` into the adjudicator prompt.
- Reading-bounded: no unread spoilers.
- Quiet UI: bridges on demand; scenic pages suppress.
- Desktop reading first; defer mobile.
- Spec → implement → verify (smoke/eval/build + sub-agent) → next task.
- Follow `docs/product-ui-ux-spec.md` for recovery / 解惑 chrome.
- Default models remain DeepSeek flash/pro per AGENTS; keys only from `.env`.

---

## Season map (do in order)

```text
Week 1–2  Pillar 1  Reader Memory → bridge scoring + hand-eval protocol
Week 2–3  Pillar 2  Builtin shelf + import friction
Week 3–4  Pillar 3  Type-honest non-history bridges + eval fixtures
Week 4–5  Gate      20-case hand protocol + docs/roadmap update
```

Out of season: mobile, sync cloud, store, social, PDF OCR, permanent relation rail.

---

### Task 1: Feature 019 spec — Reader Memory into bridges

**Files:**
- Create: `constitution/features/019-reader-memory-bridge-fuel.md`
- Modify: `constitution/roadmap.md` (mark Phase 8 Feature 010 as in-progress / link 019)
- Modify: `docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md` (status: implementing)

**Interfaces:**
- Consumes: `normalizeReaderMemory`, `updateReaderMemory`, `readerForgettingScore` from `src/memoryModels.js`
- Produces: Spec contract for `collectRecallFuel` / `scoreGapFuel` reader boosts and card `onTrack` → `rememberedKeys` / `missedKeys` by `candidateId`

- [ ] **Step 1: Write Feature 019**

Create `constitution/features/019-reader-memory-bridge-fuel.md` with this body:

```markdown
# Feature 019: Reader Memory → Situation-Bridge Fuel

## Goal
Use「想起了 / 没想起」and prior reader traces as *secondary* ranking signals so the next reopen prefers bridges the reader actually needed.

## In scope
1. Persist recovery card track actions onto `bookMemory.reader` (or the existing recovery-memory storage merged into reader) with `rememberedKeys` / `missedKeys` keyed by bridge `candidateId` / `memoryKey`.
2. In `situationBridge.js` `scoreGapFuel` / fuel strength: missed keys boost, remembered keys mild dampen (never zero out mainline fit).
3. Keep mainline / current-page gap fit primary; reader signal ≤ ~0.15 absolute boost.
4. Extend offline fixtures with one missed-key and one remembered-key case.
5. Document hand-eval protocol (20 cases) in `docs/situation-bridge-evaluation.md`.

## Out of scope
- New UI chrome for a “memory dashboard”
- Changing adjudicator prompt budgets
- Mobile

## Acceptance
- `npm run situation-bridge:evaluate` still passes; new fixtures green
- Manual: mark 没想起 on a bridge → next manual History prefers related fuel when gaps match
- Spec review by sub-agent against this file
```

- [ ] **Step 2: Link roadmap**

In `constitution/roadmap.md` under Feature 010, add:

```markdown
Implementation vehicle this season: Feature 019 (`constitution/features/019-reader-memory-bridge-fuel.md`).
```

- [ ] **Step 3: Commit**

```bash
git add constitution/features/019-reader-memory-bridge-fuel.md constitution/roadmap.md
git commit -m "spec: Feature 019 Reader Memory into situation-bridge fuel"
```

---

### Task 2: Persist card feedback into Reader Memory

**Files:**
- Modify: `src/App.jsx` (`recordRecoveryInteraction` ~945+)
- Modify: `src/memoryModels.js` only if a small helper is needed (`markReaderBridgeFeedback`)
- Test: extend `scripts/verify-situation-bridge.mjs` or add a tiny node assert in eval fixtures later

**Interfaces:**
- Consumes: RecoveryCard `onTrack(action, card)` with actions `remembered` | `missed` | `continue` | `evidence` (use existing labels in `RecoveryCard`)
- Produces: Updated stored reader state including bridge candidate ids from `card.bridges[].candidateId` or `card.keyPoints[].memoryKey`

- [ ] **Step 1: Inspect existing track actions**

Run in repo:

```bash
rg -n "onTrack|想起了|没想起|recordRecoveryInteraction" src/App.jsx
```

Note the exact action strings the footer already emits.

- [ ] **Step 2: Add helper in `memoryModels.js`**

```js
export function markReaderBridgeFeedback(reader = null, { action, keys = [] } = {}) {
  const list = (keys || []).map(String).filter(Boolean);
  if (!list.length) return normalizeReaderMemory(reader);
  if (action === "remembered" || action === "knew") {
    return updateReaderMemory(reader, { rememberedKeys: list });
  }
  if (action === "missed" || action === "forgot") {
    return updateReaderMemory(reader, { missedKeys: list });
  }
  return normalizeReaderMemory(reader);
}
```

Map whatever the UI actually sends onto `remembered` / `missed`.

- [ ] **Step 3: Wire `recordRecoveryInteraction`**

When action is remembered/missed, collect keys from `card.bridges` / `keyPoints`, call `markReaderBridgeFeedback`, persist via existing `recoveryMemoryStorageKey(book)` **and** merge into analysis `bookMemory.reader` when an analysis record exists.

- [ ] **Step 4: Manual smoke**

Open builtin 《长征》, force a recovery card (History on a dependent page), tap 想起了 / 没想起, reload, confirm keys appear in stored JSON (`localStorage` / IndexedDB path the app already uses).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/memoryModels.js
git commit -m "feat: persist recovery bridge feedback into Reader Memory"
```

---

### Task 3: Score bridges with Reader Memory (secondary only)

**Files:**
- Modify: `src/situationBridge.js` (`memoryStrength`, `scoreGapFuel`, `collectRecallFuel`)
- Modify: `scripts/fixtures/situation-bridge-cases.json`
- Modify: `scripts/situation-bridge-eval.mjs` if new expect fields needed
- Test: `npm run situation-bridge:evaluate`

**Interfaces:**
- Consumes: `reader.missedKeys` / `reader.rememberedKeys`
- Produces: Higher `strength` / `scoreGapFuel` for missed keys; slight penalty for remembered; still requires gap fit

- [ ] **Step 1: Add failing fixture cases**

Append two cases to `scripts/fixtures/situation-bridge-cases.json`:

1. `reader-missed-boost-show` — same as a dependent history page, but `reader: { missedKeys: ["mem:ep1"] }` and expect bridges to include title hint matching that episodic name.
2. `reader-remembered-not-only` — rememberedKeys include a weak secondary entity; expect still ≥2 bridges and precision hints on mainline events (not only the remembered weak name).

- [ ] **Step 2: Run eval (expect possible fail)**

```bash
npm run situation-bridge:evaluate
```

Expected: may fail until scoring lands.

- [ ] **Step 3: Implement scoring**

In `scoreGapFuel` / `memoryStrength`:

```js
const key = item.id || item.candidateId;
const missed = reader?.missedKeys?.includes(key) ? 0.12 : 0;
const remembered = reader?.rememberedKeys?.includes(key) ? -0.06 : 0;
// clamp total reader delta to [-0.08, 0.15]
```

Pass `reader` from `prepareSituationBridgeShortlist` options into fuel scoring.

- [ ] **Step 4: Re-run gate**

```bash
npm run situation-bridge:evaluate
npm run verify:situation-bridge
```

Expected: exit 0, overall ≥ 80, precision ≥ 70.

- [ ] **Step 5: Commit**

```bash
git add src/situationBridge.js scripts/fixtures/situation-bridge-cases.json scripts/situation-bridge-eval.mjs
git commit -m "feat: secondary Reader Memory boosts for situation-bridge fuel"
```

---

### Task 4: Hand-eval protocol (differentiator proof)

**Files:**
- Modify: `docs/situation-bridge-evaluation.md`
- Create: `docs/hand-eval-bridge-protocol.md`
- Create: `reports/.gitkeep` already ignored — store results locally only

**Interfaces:**
- Produces: A 20-case checklist humans can run on desktop against builtin 《长征》 + one imported argument/fiction EPUB

- [ ] **Step 1: Write protocol**

`docs/hand-eval-bridge-protocol.md` must include:

- 10 show cases (dependent mid-book pages, ≥12h simulated absence via stored lastActivity if needed)
- 5 suppress cases (scenic / chapter ornament)
- 3 evidence-jump cases
- 2「没想起」then reopen ranking cases

Each row: book, chapter/page intent, expected show|suppress, pass/fail, note.

- [ ] **Step 2: Link from evaluation doc**

Add a “Hand protocol” section pointing to that file; season gate = ≥70% helpful on show rows and ≥80% suppress correct.

- [ ] **Step 3: Commit**

```bash
git add docs/hand-eval-bridge-protocol.md docs/situation-bridge-evaluation.md
git commit -m "docs: hand-eval protocol for situation-bridge hit rate"
```

---

### Task 5: Feature 020 spec — Open-book reliability

**Files:**
- Create: `constitution/features/020-open-book-reliability.md`

**Interfaces:**
- Produces: Spec for builtin always-visible, parse error surfacing, non-blocking analysis

- [ ] **Step 1: Write Feature 020**

```markdown
# Feature 020: Open-Book Reliability

## Goal
A cold browser profile sees 《长征》 without importing; import failures explain the next action; Trace never freezes page turns.

## In scope
1. Builtin book fetch/parse errors show a recoverable shelf state (retry), not an empty “no books” void when `/books/long-march.epub` exists.
2. Import duplicate fingerprint: reopen existing book instead of silent no-op.
3. Keep analysis/adjudicator on idle/background paths; never `await` model calls inside page-turn handlers.
4. Notice copy for missing API key when user triggers AI — reading still works offline for local bridges.

## Out of scope
- Cloud sync, account login, store

## Acceptance
- Fresh profile: builtin appears within first load without user import
- Kill API key: reading + local History still function; adjudicator falls back locally
```

- [ ] **Step 2: Commit**

```bash
git add constitution/features/020-open-book-reliability.md
git commit -m "spec: Feature 020 open-book reliability"
```

---

### Task 6: Implement open-book reliability

**Files:**
- Modify: `src/App.jsx` (`loadBuiltInBook`, import handlers, analysis entry)
- Optional: tiny notice helpers only

**Interfaces:**
- Consumes: `BOOK_PATH`, `BUILT_IN_BOOK_ID`, `parseEpubInWorker`
- Produces: Shelf never silently empty when builtin asset is present; clear `loadError` + Retry

- [ ] **Step 1: Reproduce empty-shelf failure modes**

In DevTools: block `/books/long-march.epub`, reload, note UI. Unblock, add Retry.

- [ ] **Step 2: UI for builtin load failure**

When `loadError` and library empty, show shelf empty-state with **重试加载《长征》** calling `loadBuiltInBook` again — not only「导入书籍」.

- [ ] **Step 3: Duplicate import**

On matching fingerprint, `openBook(existing)` + notice「书架已有这本书，已为你打开」.

- [ ] **Step 4: Verify**

Cold load with network allowed: builtin visible. History without API key: local bridges or toast, no freeze.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "fix: builtin retry and duplicate-import open path"
```

---

### Task 7: Feature 021 spec — Type-honest bridges

**Files:**
- Create: `constitution/features/021-type-honest-bridges.md`

**Interfaces:**
- Produces: Mapping book type → preferred gap kinds / fuel channels (history vs argument vs fiction)

- [ ] **Step 1: Write Feature 021**

```markdown
# Feature 021: Type-Honest Situation Bridges

## Goal
Non-history books recover via concepts/arguments/intent, not forced people/places lists.

## In scope
1. `prepareSituationBridgeShortlist` accepts `bookType` / profile category and weights `extractPageGaps` + channel fusion.
2. Argument/science: boost concept/intent gaps; demote incidental person gaps unless primary.
3. Fiction: boost person/intent/relation; demote abstract mega-topics.
4. One new argument fixture + one fiction fixture already exist — tighten expects for gapKinds.
5. Sample shelf: ensure at least one non-history sample is labeled (Feature 013 lite — may reuse existing taxonomy samples if present).

## Out of scope
- Full sample corpus for every taxonomy type (full Feature 013 later)
- New graph UI

## Acceptance
- `situation-bridge:evaluate` byFactor shows concept+intent and intent+reader passing
- Hand protocol includes ≥3 non-history rows
```

- [ ] **Step 2: Commit**

```bash
git add constitution/features/021-type-honest-bridges.md
git commit -m "spec: Feature 021 type-honest situation bridges"
```

---

### Task 8: Implement type-honest weighting

**Files:**
- Modify: `src/situationBridge.js` (`extractPageGaps`, `fuseCandidates` or a `typeBias(bookType)` helper)
- Modify: `scripts/fixtures/situation-bridge-cases.json` expects if needed
- Test: `npm run situation-bridge:evaluate`

**Interfaces:**
- Consumes: `book.bookType` or options.bookType string
- Produces: Bias table e.g. argument → `{ concept: 1.15, intent: 1.1, person: 0.85 }`

- [ ] **Step 1: Add `typeBias(category)`**

```js
function typeBias(category = "") {
  if (/科普|技术|哲学|商业|教材|论证/.test(category)) {
    return { concept: 1.2, intent: 1.1, causal: 1.05, person: 0.85, spatial: 0.8 };
  }
  if (/小说|文学/.test(category)) {
    return { person: 1.15, intent: 1.15, relation: 1.1, concept: 0.85 };
  }
  return { person: 1.05, causal: 1.1, temporal: 1.05, spatial: 1.05 };
}
```

Apply to gap importance and/or `scoreGapFuel` kind bonus.

- [ ] **Step 2: Pass bookType from App prepare paths**

`prepareSituationRecovery` / shortlist options include `bookType: book.bookType || bookProfile?.category`.

- [ ] **Step 3: Eval + smoke**

```bash
npm run situation-bridge:evaluate
npm run verify:situation-bridge
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/situationBridge.js src/App.jsx scripts/fixtures/situation-bridge-cases.json
git commit -m "feat: type-honest gap/fuel bias for situation bridges"
```

---

### Task 9: Season gate + roadmap closeout

**Files:**
- Modify: `constitution/roadmap.md` (Phase 8 notes, season status)
- Modify: `AGENTS.md` (one recorded decision: second-layer / hit-rate season)
- Modify: `docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md` (status: gated)

- [ ] **Step 1: Run automated gates**

```bash
npm run verify:situation-bridge
npm run situation-bridge:evaluate
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Run hand protocol (human)**

Fill `docs/hand-eval-bridge-protocol.md` results locally (do not commit private notes if they contain reading position clutter). Season pass if show-helpful ≥70% and suppress ≥80%.

- [ ] **Step 3: Record decision in AGENTS**

```markdown
- Season focus: win as a second-layer serious reader via situation-bridge hit rate and open-book reliability; do not chase catalog size against 腾讯读书/Kindle.
```

- [ ] **Step 4: Commit**

```bash
git add constitution/roadmap.md AGENTS.md docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md
git commit -m "docs: close Bridge Retention season gate notes"
```

---

## Self-review

| Design requirement | Task |
| --- | --- |
| Reader Memory → bridges | 1–3 |
| Hand-eval proof | 4, 9 |
| Open-book friction | 5–6 |
| Type-honest non-history | 7–8 |
| No catalog competition | Global + AGENTS |
| Keep adjudicator budgets | Global (no task widens prompt) |

No TBD placeholders. Later full Feature 013 sample-per-type corpus is intentionally deferred after this season’s lite proof.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-27-season-bridge-retention.md`.  
Design saved to `docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md`.
