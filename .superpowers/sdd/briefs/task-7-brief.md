### Task 7: Feature 021 spec 鈥?Type-honest bridges

**Files:**
- Create: `constitution/features/021-type-honest-bridges.md`

**Interfaces:**
- Produces: Mapping book type 鈫?preferred gap kinds / fuel channels (history vs argument vs fiction)

- [ ] **Step 1: Write Feature 021**

```markdown
# Feature 021: Type-Honest Situation Bridges

## Goal
Non-history books recover via concepts/arguments/intent, not forced people/places lists.

## In scope
1. `prepareSituationBridgeShortlist` accepts `bookType` / profile category and weights `extractPageGaps` + channel fusion.
2. Argument/science: boost concept/intent gaps; demote incidental person gaps unless primary.
3. Fiction: boost person/intent/relation; demote abstract mega-topics.
4. One new argument fixture + one fiction fixture already exist 鈥?tighten expects for gapKinds.
5. Sample shelf: ensure at least one non-history sample is labeled (Feature 013 lite 鈥?may reuse existing taxonomy samples if present).

## Out of scope
- Full sample corpus for every taxonomy type (full Feature 013 later)
- New graph UI

## Acceptance
- `situation-bridge:evaluate` byFactor shows concept+intent and intent+reader passing
- Hand protocol includes 鈮? non-history rows
```

- [ ] **Step 2: Commit**

```bash
git add constitution/features/021-type-honest-bridges.md
git commit -m "spec: Feature 021 type-honest situation bridges"
```

---


