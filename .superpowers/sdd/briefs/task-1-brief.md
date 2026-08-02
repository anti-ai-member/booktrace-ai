### Task 1: Feature 019 spec 鈥?Reader Memory into bridges

**Files:**
- Create: `constitution/features/019-reader-memory-bridge-fuel.md`
- Modify: `constitution/roadmap.md` (mark Phase 8 Feature 010 as in-progress / link 019)
- Modify: `docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md` (status: implementing)

**Interfaces:**
- Consumes: `normalizeReaderMemory`, `updateReaderMemory`, `readerForgettingScore` from `src/memoryModels.js`
- Produces: Spec contract for `collectRecallFuel` / `scoreGapFuel` reader boosts and card `onTrack` 鈫?`rememberedKeys` / `missedKeys` by `candidateId`

- [ ] **Step 1: Write Feature 019**

Create `constitution/features/019-reader-memory-bridge-fuel.md` with this body:

```markdown
# Feature 019: Reader Memory 鈫?Situation-Bridge Fuel

## Goal
Use銆屾兂璧蜂簡 / 娌℃兂璧枫€峚nd prior reader traces as *secondary* ranking signals so the next reopen prefers bridges the reader actually needed.

## In scope
1. Persist recovery card track actions onto `bookMemory.reader` (or the existing recovery-memory storage merged into reader) with `rememberedKeys` / `missedKeys` keyed by bridge `candidateId` / `memoryKey`.
2. In `situationBridge.js` `scoreGapFuel` / fuel strength: missed keys boost, remembered keys mild dampen (never zero out mainline fit).
3. Keep mainline / current-page gap fit primary; reader signal 鈮?~0.15 absolute boost.
4. Extend offline fixtures with one missed-key and one remembered-key case.
5. Document hand-eval protocol (20 cases) in `docs/situation-bridge-evaluation.md`.

## Out of scope
- New UI chrome for a 鈥渕emory dashboard鈥?- Changing adjudicator prompt budgets
- Mobile

## Acceptance
- `npm run situation-bridge:evaluate` still passes; new fixtures green
- Manual: mark 娌℃兂璧?on a bridge 鈫?next manual History prefers related fuel when gaps match
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


