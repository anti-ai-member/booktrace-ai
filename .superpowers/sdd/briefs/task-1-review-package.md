# Review package Task 1
BASE: a8467f3366af245b0e911bca136b233a7d325fcd
HEAD: 1a6fe80a2a85783f5b57007cc367455cfe40b879

## Commits
1a6fe80 spec: Feature 019 Reader Memory into situation-bridge fuel


## Stat
 .../features/019-reader-memory-bridge-fuel.md      | 21 +++++++
 constitution/roadmap.md                            |  4 +-
 .../2026-07-27-season-bridge-retention-design.md   | 66 ++++++++++++++++++++++
 3 files changed, 90 insertions(+), 1 deletion(-)


## Diff
diff --git a/constitution/features/019-reader-memory-bridge-fuel.md b/constitution/features/019-reader-memory-bridge-fuel.md
new file mode 100644
index 0000000..7ad8b25
--- /dev/null
+++ b/constitution/features/019-reader-memory-bridge-fuel.md
@@ -0,0 +1,21 @@
+# Feature 019: Reader Memory 鈫?Situation-Bridge Fuel
+
+## Goal
+Use銆屾兂璧蜂簡 / 娌℃兂璧枫€峚nd prior reader traces as *secondary* ranking signals so the next reopen prefers bridges the reader actually needed.
+
+## In scope
+1. Persist recovery card track actions onto `bookMemory.reader` (or the existing recovery-memory storage merged into reader) with `rememberedKeys` / `missedKeys` keyed by bridge `candidateId` / `memoryKey`.
+2. In `situationBridge.js` `scoreGapFuel` / fuel strength: missed keys boost, remembered keys mild dampen (never zero out mainline fit).
+3. Keep mainline / current-page gap fit primary; reader signal 鈮?~0.15 absolute boost.
+4. Extend offline fixtures with one missed-key and one remembered-key case.
+5. Document hand-eval protocol (20 cases) in `docs/situation-bridge-evaluation.md`.
+
+## Out of scope
+- New UI chrome for a "memory dashboard"
+- Changing adjudicator prompt budgets
+- Mobile
+
+## Acceptance
+- `npm run situation-bridge:evaluate` still passes; new fixtures green
+- Manual: mark 娌℃兂璧?on a bridge 鈫?next manual History prefers related fuel when gaps match
+- Spec review by sub-agent against this file
diff --git a/constitution/roadmap.md b/constitution/roadmap.md
index 880b384..6d42b28 100644
--- a/constitution/roadmap.md
+++ b/constitution/roadmap.md
@@ -243,32 +243,34 @@ Scope:
 
 Phase 7 quality gate:
 
 - Returning readers get model-backed situation restore when Memory exists.
 - Local fallback remains useful without hallucinated claims.
 
 ---
 
 ## Phase 8: Reader Memory And Type-Specific Aids
 
-Status: planned.
+Status: in progress.
 
 Goal:
 
 Make Reader Memory participate in recall decisions, and surface type-specific aids only when they help understanding.
 
 ### Feature 010 鈥?Reader Memory as decision input
 
 - Persist active reading time, remembered/missed, notes, bookmarks into `bookMemory.reader`.
 - Feed forgetting and reader events into Context Builder with secondary weight only.
 - Keep mainline / current-page fit as primary score.
 
+Implementation vehicle this season: Feature 019 (`constitution/features/019-reader-memory-bridge-fuel.md`).
+
 ### Feature 011 鈥?Type-specific memory aids on demand
 
 - Concept / argument / timeline aids appear only when Memory has reliable edges for the current type and page.
 - Reuse left-push workspace patterns; no permanent index rail.
 
 Phase 8 quality gate:
 
 - Reader feedback changes ranking without flooding the card with noise.
 - Non-history books can recover via topics/arguments without forcing people/places.
 
diff --git a/docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md b/docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md
new file mode 100644
index 0000000..422f2fa
--- /dev/null
+++ b/docs/superpowers/specs/2026-07-27-season-bridge-retention-design.md
@@ -0,0 +1,66 @@
+# Design: Season 鈥?Bridge Retention (not catalog)
+
+**Date:** 2026-07-27  
+**Status:** implementing  
+**Product:** 涔﹁剦  
+**Constraint:** Cannot and will not compete with 鑵捐璇讳功 / Kindle on book count or discovery.
+
+## Problem
+
+Mature readers already have somewhere to *find* books. They abandon 涔﹁剦 when:
+
+1. Reopening after days does not restore the situation model (false or noisy bridges).
+2. Opening / importing friction kills the first session before the differentiator appears.
+3. Non-history books feel like a history-reader with AI paint.
+
+## Positioning lock
+
+> 涔﹁剦 is the **second layer** for hard, interruptible reading: bring *your* book, leave with a living Memory and on-demand situation bridges.  
+> 鑵捐璇讳功 / Kindle remain the first layer for shelf size and casual reading.
+
+## Approaches considered
+
+| Approach | Focus | Pros | Cons |
+| --- | --- | --- | --- |
+| A. Platform season | Mobile + formats + sync | Looks like a 鈥渞eal reader鈥?| Competes on their turf; delays differentiator |
+| **B. Hit-rate season (recommended)** | Bridge precision + Reader Memory + open-book friction | Directly proves mission | Shelf still thin by design |
+| C. Aid season | Graphs / concept maps first | Visually impressive | Pulls attention from reading; weak without hit-rate |
+
+**Decision:** Approach B for one season (~4鈥? weeks of focused work).
+
+## Season outcome
+
+A returning reader of a hard book can say:
+
+> 鈥淚 opened 涔﹁剦 after a week, it showed 2鈥? things I actually needed, I jumped to evidence, and continued 鈥?I would not get that from 鑵捐璇讳功.鈥?+
+## Non-goals (explicit)
+
+- Book store, recommendations, social
+- Matching catalog breadth
+- Mobile-first rewrite
+- Extra permanent AI dashboards / default relation graphs
+- Dumping more prior text into the model
+
+## Three pillars
+
+1. **Bridge hit-rate loop** 鈥?Reader Memory (鎯宠捣浜?娌℃兂璧? feeds candidate scoring; live hand-eval on 銆婇暱寰併€?+ one argument/fiction book.
+2. **Zero-drama open book** 鈥?Built-in 銆婇暱寰併€?always on shelf; import failures explain themselves; analysis never blocks page turns.
+3. **Type-honest recovery** 鈥?Concept/argument books recover via topics/claims, not forced people/places.
+
+## Success metrics (season gate)
+
+| Metric | Target |
+| --- | --- |
+| Hand-eval bridge precision (show cards) | 鈮?70% 鈥渉elpful鈥?on 20 scripted reopen/manual cases |
+| Suppress correctness | 鈮?80% on scenic / low-dependency pages |
+| Offline `situation-bridge:evaluate` | Gate still green; fixtures expand with Reader Memory cases |
+| Time-to-first-page on cold start | Built-in book visible without import |
+| Non-history demo | One labeled sample proves concept/argument bridges |
+
+## Specs to open during the season
+
+- Feature 019 鈥?Reader Memory 鈫?situation-bridge fuel (extends roadmap 010)
+- Feature 020 鈥?Open-book reliability (builtin + import UX)
+- Feature 021 鈥?Type-honest bridge profiles (extends roadmap 011 partially)
+- Expand Feature 018 Phase C fixtures / live hand protocol

