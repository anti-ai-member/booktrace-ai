# Task 2 Report: Persist card feedback into Reader Memory

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `1a6fe80a2a85783f5b57007cc367455cfe40b879`  
**Commit:** `3e1f270` — feat: persist recovery bridge feedback into Reader Memory

## Deliverables

| File | Action |
| --- | --- |
| `src/memoryModels.js` | Added `markReaderBridgeFeedback` (maps remembered/knew → `rememberedKeys`, missed/forgot → `missedKeys`) |
| `src/App.jsx` | Wired feedback through `updateRecoveryMemoryState` / `recordRecoveryInteraction`; prefer `bridges[].candidateId` then `keyPoints[].memoryKey`; merge into analysis `bookMemory.reader` when a record exists |
| `scripts/verify-situation-bridge.mjs` | Extended with node asserts for remembered/missed/knew and non-feedback no-op |

## Task checklist

- [x] Step 1: Inspect existing track actions — RecoveryCard emits `remembered` / `missed` (titles 想起来了 / 还没想起); also shown/hint/answer/evidence (metrics only)
- [x] Step 2: Add `markReaderBridgeFeedback` in `memoryModels.js` (verbatim from brief)
- [x] Step 3: Wire keys + persist via `recoveryMemoryStorageKey(book)` and analysis `bookMemory.reader`
- [x] Step 4: Smoke via node asserts (browser localStorage check documented below)
- [x] Step 5: Commit

## Implementation notes

### Track action mapping
- UI sends `remembered` / `missed` only for Reader Memory key updates.
- Helper also accepts aliases `knew` / `forgot`.
- `shown` / `hint` / `answer` / `evidence` / `continue` still update metrics / per-key strength where applicable; they do **not** append to `rememberedKeys` / `missedKeys`.

### Key collection (`recoveryCardMemoryKeys`)
Order of preference:
1. `card.bridges[].candidateId` (fallback `memoryKey`)
2. `card.keyPoints[].memoryKey`
3. Legacy: prerequisites / question / evidence memoryKeys (for strength tracking continuity)

### Persistence paths
1. **Recovery memory** (`shumai-recovery-memory:…`): `next.reader` via `markReaderBridgeFeedback` + `updateReaderMemory` (lastActivityAt + forgettingScores).
2. **Analysis record** (`yuezhi-analysis:…`): when present, `bookMemory.reader` merged with the same feedback keys (`mergeReaderFeedbackIntoAnalysis`).

`recordRecoveryInteraction` continues to call `updateRecoveryMemoryState`, so footer taps (想起了 / 还没想起) flow through both stores.

## Tests

```text
node scripts/verify-situation-bridge.mjs
→ situation-bridge smoke ok { … readerFeedback: { remembered: 2, missed: 1 } }
```

Asserts covered:
- remembered keys persist
- missed merges without clearing remembered
- non-feedback `shown` does not write keys
- `knew` maps to remembered

### Manual browser check (optional)
1. Open builtin《长征》, force a recovery card (History on a dependent page / absence).
2. Tap 想起来了 or 还没想起.
3. In DevTools → Application → Local Storage, inspect:
   - `shumai-recovery-memory:<bookId>` → `reader.rememberedKeys` / `reader.missedKeys`
   - `yuezhi-analysis:…` (if analysis exists) → `bookMemory.reader` same keys
4. Reload and confirm keys remain.

## Self-review

### Spec fidelity (Feature 019 item 1)
- Persist track actions onto Reader Memory with `rememberedKeys` / `missedKeys` keyed by bridge `candidateId` / `memoryKey`: **done**.
- No memory dashboard UI; no adjudicator budget changes; desktop-only scope untouched.

### Concerns
- None blocking. Browser end-to-end not run in this session (node helper coverage instead); Task 3 should consume these keys in `scoreGapFuel`.
- When no analysis record exists yet, feedback lives only under recovery-memory until the next analysis write — by design.

## Next task

Task 3: Score bridges with Reader Memory (secondary only) — missed boost / remembered dampen ≤ ~0.15, extend eval fixtures.

---

## Review fix (Important)

**Commit:** `d84c684` — fix: narrow recovery feedback keys to bridges and keyPoints  
**Issue:** `updateRecoveryMemoryState` passed the full `recoveryCardMemoryKeys(card)` set into `markReaderBridgeFeedback` / `mergeReaderFeedbackIntoAnalysis`, incorrectly including question / prerequisites / evidence keys.

**Change:**
- Added `recoveryBridgeFeedbackKeys(card)` in `src/memoryModels.js` (bridges `candidateId` + keyPoints `memoryKey` only).
- `App.jsx`: feedback paths use `feedbackKeys`; per-key strength / `forgettingScores` still use full `recoveryCardMemoryKeys`.
- `scripts/verify-situation-bridge.mjs`: asserts fake card with `question.memoryKey` excludes that key from feedback collection.

**Test:**

```text
node scripts/verify-situation-bridge.mjs
→ situation-bridge smoke ok { … readerFeedback: { remembered: 2, missed: 1 } }
```

New asserts: feedback keys from bridges/keyPoints only; question/prereq/evidence excluded.
