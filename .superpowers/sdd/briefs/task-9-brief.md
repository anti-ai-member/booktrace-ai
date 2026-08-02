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

Fill `docs/hand-eval-bridge-protocol.md` results locally (do not commit private notes if they contain reading position clutter). Season pass if show-helpful 鈮?0% and suppress 鈮?0%.

- [ ] **Step 3: Record decision in AGENTS**

```markdown
- Season focus: win as a second-layer serious reader via situation-bridge hit rate and open-book reliability; do not chase catalog size against 鑵捐璇讳功/Kindle.
```

- [ ] **Step 4: Commit**

```bash
git add constitution/roadmap.md AGENTS.md docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md
git commit -m "docs: close Bridge Retention season gate notes"
```

---

