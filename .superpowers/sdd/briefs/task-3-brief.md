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

1. `reader-missed-boost-show` 鈥?same as a dependent history page, but `reader: { missedKeys: ["mem:ep1"] }` and expect bridges to include title hint matching that episodic name.
2. `reader-remembered-not-only` 鈥?rememberedKeys include a weak secondary entity; expect still 鈮? bridges and precision hints on mainline events (not only the remembered weak name).

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

Expected: exit 0, overall 鈮?80, precision 鈮?70.

- [ ] **Step 5: Commit**

```bash
git add src/situationBridge.js scripts/fixtures/situation-bridge-cases.json scripts/situation-bridge-eval.mjs
git commit -m "feat: secondary Reader Memory boosts for situation-bridge fuel"
```

---


