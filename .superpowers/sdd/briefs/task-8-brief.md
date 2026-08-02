### Task 8: Implement type-honest weighting

**Files:**
- Modify: `src/situationBridge.js` (`extractPageGaps`, `fuseCandidates` or a `typeBias(bookType)` helper)
- Modify: `scripts/fixtures/situation-bridge-cases.json` expects if needed
- Test: `npm run situation-bridge:evaluate`

**Interfaces:**
- Consumes: `book.bookType` or options.bookType string
- Produces: Bias table e.g. argument 鈫?`{ concept: 1.15, intent: 1.1, person: 0.85 }`

- [ ] **Step 1: Add `typeBias(category)`**

```js
function typeBias(category = "") {
  if (/绉戞櫘|鎶€鏈瘄鍝插|鍟嗕笟|鏁欐潗|璁鸿瘉/.test(category)) {
    return { concept: 1.2, intent: 1.1, causal: 1.05, person: 0.85, spatial: 0.8 };
  }
  if (/灏忚|鏂囧/.test(category)) {
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


