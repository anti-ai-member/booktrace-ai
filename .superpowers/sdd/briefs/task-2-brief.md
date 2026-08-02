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
rg -n "onTrack|鎯宠捣浜唡娌℃兂璧穦recordRecoveryInteraction" src/App.jsx
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

Open builtin 銆婇暱寰併€? force a recovery card (History on a dependent page), tap 鎯宠捣浜?/ 娌℃兂璧? reload, confirm keys appear in stored JSON (`localStorage` / IndexedDB path the app already uses).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/memoryModels.js
git commit -m "feat: persist recovery bridge feedback into Reader Memory"
```

---


