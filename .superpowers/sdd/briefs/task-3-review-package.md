# Review package Task 3
BASE: 1567a0f5addb75f3d2bdd07ea35bff4e496c665d
HEAD: 5996c9540dd6b7acc486a3b81f67ec5604989c87

## Commits
5996c95 feat: secondary Reader Memory boosts for situation-bridge fuel


## Stat
 .superpowers/sdd/briefs/task-3-report.md     |  70 ++++++++++++++
 scripts/fixtures/situation-bridge-cases.json | 137 +++++++++++++++++++++++++++
 scripts/situation-bridge-eval.mjs            |  25 +++--
 src/situationBridge.js                       |  46 ++++++---
 4 files changed, 252 insertions(+), 26 deletions(-)


## Diff
diff --git a/.superpowers/sdd/briefs/task-3-report.md b/.superpowers/sdd/briefs/task-3-report.md
new file mode 100644
index 0000000..a913799
--- /dev/null
+++ b/.superpowers/sdd/briefs/task-3-report.md
@@ -0,0 +1,70 @@
+# Task 3 Report: Score bridges with Reader Memory (secondary only)
+
+**Status:** DONE  
+**Branch:** `season/bridge-retention`  
+**Base:** `1567a0f5addb75f3d2bdd07ea35bff4e496c665d`  
+**Commit:** (see git log) 鈥?feat: secondary Reader Memory boosts for situation-bridge fuel
+
+## Deliverables
+
+| File | Action |
+| --- | --- |
+| `src/situationBridge.js` | Missed +0.12 / remembered 鈭?.06 in `scoreGapFuel` + `memoryStrength`; clamp `[-0.08, 0.15]`; thread `reader` through fuse/match/offer |
+| `scripts/fixtures/situation-bridge-cases.json` | Added `reader-missed-boost-show`, `reader-remembered-not-only` |
+| `scripts/situation-bridge-eval.mjs` | Pass `fixture.reader`; support `expect.mustIncludeTitleHints` |
+
+## Task checklist
+
+- [x] Step 1: Add failing fixtures (`reader-missed-boost-show`, `reader-remembered-not-only`)
+- [x] Step 2: Run eval (red: missed case lacked episodic bridge before scoring)
+- [x] Step 3: Implement secondary Reader Memory deltas in scoring
+- [x] Step 4: Re-run `situation-bridge:evaluate` + `verify:situation-bridge` (both exit 0)
+- [x] Step 5: Commit
+
+## Implementation notes
+
+### Reader signal (secondary only)
+```js
+missed 鈫?+0.12
+remembered 鈫?-0.06
+clamp 鈫?[-0.08, 0.15]
+```
+- Applied in `scoreGapFuel` via fuel `id` / `candidateId` (e.g. `mem:ep1`).
+- Applied in `memoryStrength` for both `mem:${id}` and raw `id`.
+- Gap overlap / kind / mainline strength unchanged 鈥?reader delta cannot zero them out.
+- No adjudicator prompt/budget changes; no UI.
+
+### Fixtures
+1. **reader-missed-boost-show** 鈥?same dependent history page as `hist-person-causal-show`, `reader.missedKeys: ["mem:ep1"]`, `mustIncludeTitleHints: ["灏侀攣娓″彛"]` so the episodic name must appear among bridges.
+2. **reader-remembered-not-only** 鈥?weak secondary `灞辫胺鏂ュ€檂 in `rememberedKeys`; expect 鈮? bridges with mainline titleHints (澶忚嫳鏉?/ 娓″彛 / 灏侀攣), not only the weak name.
+
+### Eval harness
+- `prepareSituationBridgeShortlist` / `buildSituationBridgePlan` now receive `fixture.reader`.
+- New optional `mustIncludeTitleHints`: every listed hint must match at least one bridge title/whyNeeded (stricter than precision-only).
+
+## Tests
+
+```text
+npm run situation-bridge:evaluate
+鈫?Overall: 100/100 路 Precision: 100/100
+鈫?Cases: 10/10 passed (including reader-missed 1/1, reader-remembered 1/1)
+
+npm run verify:situation-bridge
+鈫?situation-bridge smoke ok { 鈥?readerFeedback: { remembered: 2, missed: 1 } }
+```
+
+## Self-review
+
+### Spec fidelity (Feature 019 items 2鈥?)
+- Missed boost / remembered dampen with ~0.15 cap: **done**.
+- Mainline / gap fit remains primary: **done**.
+- Offline fixtures extended: **done**.
+- Out of scope respected (no memory dashboard, no adjudicator budget change, desktop-only).
+
+### Concerns
+- None blocking. Compounded effect (strength delta 脳 0.45 plus scoreGapFuel delta) can slightly exceed 0.15 on the final fuse score when both paths fire; absolute additive term itself stays clamped. Acceptable for secondary ranking.
+- Hand-eval protocol doc (`docs/situation-bridge-evaluation.md`) is Feature 019 item 5 鈥?later task if planned separately.
+
+## Next task
+
+Task 4+ per season plan (hand-eval protocol / remaining Feature 019 acceptance).
diff --git a/scripts/fixtures/situation-bridge-cases.json b/scripts/fixtures/situation-bridge-cases.json
index 6b9386d..7af1689 100644
--- a/scripts/fixtures/situation-bridge-cases.json
+++ b/scripts/fixtures/situation-bridge-cases.json
@@ -540,10 +540,147 @@
       "timeline": [],
       "topics": [],
       "arguments": [],
       "relationships": []
     },
     "cursor": { "chapterIndex": 1, "pageIndex": 0, "paragraphIndex": 0 },
     "currentPageText": "鍥犳澶忚嫳鏉颁笅浠ょ户缁寳涓婏紝娓″彛涓€浜嬩粛鍘嬪湪浼椾汉蹇冨ご銆?,
     "mode": "manual"
+  },
+  {
+    "id": "reader-missed-boost-show",
+    "bookType": "history",
+    "factor": "reader-missed",
+    "reader": { "missedKeys": ["mem:ep1"] },
+    "expect": {
+      "suppressed": false,
+      "minBridges": 2,
+      "titleHints": ["灏侀攣娓″彛", "澶忚嫳鏉?, "娓″彛"],
+      "mustIncludeTitleHints": ["灏侀攣娓″彛"],
+      "gapKinds": ["person", "causal", "intent", "state"]
+    },
+    "book": {
+      "id": "hist-a",
+      "chapters": [
+        {
+          "id": "c0",
+          "title": "杞Щ",
+          "paragraphs": [
+            "澶忚嫳鏉板喅瀹氱巼閮ㄥ厛琛岃浆绉伙紝骞跺懡浠ゅ崼闃熷皝閿佹浮鍙ｃ€?,
+            "姝ゅ悗鏁版棩锛岄儴闃熷湪灞辫胺涓紤鏁达紝绛夊緟浼氬悎淇″彿銆?,
+            "闆ㄥ仠涔嬪悗锛屾枼鍊欏洖鎶ュ宀稿凡鏃犺拷鍏点€?
+          ]
+        },
+        {
+          "id": "c1",
+          "title": "鍖椾笂",
+          "paragraphs": [
+            "鍥犳澶忚嫳鏉颁笅浠ょ户缁寳涓婏紝娓″彛涓€浜嬩粛鍘嬪湪浼椾汉蹇冨ご銆?,
+            "灞辫胺閲屽彧鍓╅澹帮紝骞舵棤鏂扮殑鍛戒护銆?
+          ]
+        }
+      ]
+    },
+    "bookMemory": {
+      "version": 2,
+      "entities": [
+        {
+          "id": "e1",
+          "kind": "person",
+          "name": "澶忚嫳鏉?,
+          "summary": "鐜囬儴杞Щ骞跺皝閿佹浮鍙ｇ殑涓讳簨鑰?,
+          "priority": "primary",
+          "evidence": { "chapterIndex": 0, "paragraphIndex": 0, "quote": "澶忚嫳鏉板喅瀹氱巼閮ㄥ厛琛岃浆绉? }
+        }
+      ],
+      "episodic": [
+        {
+          "id": "ep1",
+          "kind": "event",
+          "name": "灏侀攣娓″彛",
+          "summary": "澶忚嫳鏉板懡浠ゅ崼闃熷皝閿佹浮鍙ｄ互渚胯浆绉?,
+          "priority": "primary",
+          "evidence": { "chapterIndex": 0, "paragraphIndex": 0, "quote": "鍛戒护鍗槦灏侀攣娓″彛" }
+        }
+      ],
+      "timeline": [],
+      "topics": [],
+      "arguments": [],
+      "relationships": []
+    },
+    "cursor": { "chapterIndex": 1, "pageIndex": 0, "paragraphIndex": 0 },
+    "currentPageText": "鍥犳澶忚嫳鏉颁笅浠ょ户缁寳涓婏紝娓″彛涓€浜嬩粛鍘嬪湪浼椾汉蹇冨ご銆?,
+    "mode": "manual"
+  },
+  {
+    "id": "reader-remembered-not-only",
+    "bookType": "history",
+    "factor": "reader-remembered",
+    "reader": { "rememberedKeys": ["mem:person:灞辫胺鏂ュ€?] },
+    "expect": {
+      "suppressed": false,
+      "minBridges": 2,
+      "titleHints": ["澶忚嫳鏉?, "娓″彛", "灏侀攣"],
+      "gapKinds": ["person", "causal", "intent", "state"]
+    },
+    "book": {
+      "id": "hist-a",
+      "chapters": [
+        {
+          "id": "c0",
+          "title": "杞Щ",
+          "paragraphs": [
+            "澶忚嫳鏉板喅瀹氱巼閮ㄥ厛琛岃浆绉伙紝骞跺懡浠ゅ崼闃熷皝閿佹浮鍙ｃ€?,
+            "姝ゅ悗鏁版棩锛岄儴闃熷湪灞辫胺涓紤鏁达紝绛夊緟浼氬悎淇″彿銆?,
+            "闆ㄥ仠涔嬪悗锛屽北璋锋枼鍊欏洖鎶ュ宀稿凡鏃犺拷鍏点€?
+          ]
+        },
+        {
+          "id": "c1",
+          "title": "鍖椾笂",
+          "paragraphs": [
+            "鍥犳澶忚嫳鏉颁笅浠ょ户缁寳涓婏紝娓″彛涓€浜嬩粛鍘嬪湪浼椾汉蹇冨ご銆?,
+            "灞辫胺閲屽彧鍓╅澹帮紝骞舵棤鏂扮殑鍛戒护銆?
+          ]
+        }
+      ]
+    },
+    "bookMemory": {
+      "version": 2,
+      "entities": [
+        {
+          "id": "e1",
+          "kind": "person",
+          "name": "澶忚嫳鏉?,
+          "summary": "鐜囬儴杞Щ骞跺皝閿佹浮鍙ｇ殑涓讳簨鑰?,
+          "priority": "primary",
+          "evidence": { "chapterIndex": 0, "paragraphIndex": 0, "quote": "澶忚嫳鏉板喅瀹氱巼閮ㄥ厛琛岃浆绉? }
+        },
+        {
+          "id": "e-weak",
+          "kind": "person",
+          "name": "灞辫胺鏂ュ€?,
+          "summary": "闆ㄥ仠鍚庡洖鎶ュ宀告儏鍐电殑娆¤浜虹墿",
+          "priority": "secondary",
+          "evidence": { "chapterIndex": 0, "paragraphIndex": 2, "quote": "灞辫胺鏂ュ€欏洖鎶ュ宀稿凡鏃犺拷鍏? }
+        }
+      ],
+      "episodic": [
+        {
+          "id": "ep1",
+          "kind": "event",
+          "name": "灏侀攣娓″彛",
+          "summary": "澶忚嫳鏉板懡浠ゅ崼闃熷皝閿佹浮鍙ｄ互渚胯浆绉?,
+          "priority": "primary",
+          "evidence": { "chapterIndex": 0, "paragraphIndex": 0, "quote": "鍛戒护鍗槦灏侀攣娓″彛" }
+        }
+      ],
+      "timeline": [],
+      "topics": [],
+      "arguments": [],
+      "relationships": []
+    },
+    "cursor": { "chapterIndex": 1, "pageIndex": 0, "paragraphIndex": 0 },
+    "currentPageText": "鍥犳澶忚嫳鏉颁笅浠ょ户缁寳涓婏紝娓″彛涓€浜嬩粛鍘嬪湪浼椾汉蹇冨ご銆?,
+    "mode": "manual"
   }
 ]
diff --git a/scripts/situation-bridge-eval.mjs b/scripts/situation-bridge-eval.mjs
index 8796a06..2954b5e 100644
--- a/scripts/situation-bridge-eval.mjs
+++ b/scripts/situation-bridge-eval.mjs
@@ -33,27 +33,29 @@ console.log(`Precision: ${report.scores.precision}/100 路 SuppressAccuracy: ${re
 console.log(`Budget: ${report.scores.budgetCompliance}/100 路 InventIdReject: ${report.scores.inventIdReject}/100`);
 console.log(report.summary.join("\n"));
 if (!report.pass.passed) {
   console.error(`Gate failed: ${report.pass.reasons.join("; ")}`);
   process.exitCode = 1;
 }
 
 async function evaluateCase(fixture, options) {
-  const shortlist = prepareSituationBridgeShortlist({
+  const planOptions = {
     book: fixture.book,
     bookMemory: fixture.bookMemory,
     cursor: fixture.cursor,
     currentPageText: fixture.currentPageText,
     notes: fixture.notes || [],
     explains: fixture.explains || [],
     bookmarks: fixture.bookmarks || [],
+    reader: fixture.reader || null,
     mode: fixture.mode || "manual",
     minAbsenceMs: 0,
-  });
+  };
+  const shortlist = prepareSituationBridgeShortlist(planOptions);
 
   let plan;
   let liveMeta = null;
   if (fixture.useJudgement && !shortlist.suppressed) {
     const judgement = await buildJudgement(shortlist, fixture, options);
     plan = applySituationBridgeJudgement(shortlist, judgement.payload);
     liveMeta = judgement.meta;
     // Also probe invented-id rejection on a copy of the shortlist.
@@ -73,27 +75,17 @@ async function evaluateCase(fixture, options) {
       (item) => item.candidateId === "invented-cand" || item.gapId === "invented-gap",
     );
     return scoreRow(fixture, plan, shortlist, {
       inventedRejected: !inventedSurvived,
       liveMeta,
     });
   }
 
-  plan = buildSituationBridgePlan({
-    book: fixture.book,
-    bookMemory: fixture.bookMemory,
-    cursor: fixture.cursor,
-    currentPageText: fixture.currentPageText,
-    notes: fixture.notes || [],
-    explains: fixture.explains || [],
-    bookmarks: fixture.bookmarks || [],
-    mode: fixture.mode || "manual",
-    minAbsenceMs: 0,
-  });
+  plan = buildSituationBridgePlan(planOptions);
   return scoreRow(fixture, plan, shortlist, { liveMeta });
 }
 
 async function buildJudgement(shortlist, fixture, options) {
   const payload = adjudicatorPayloadFromShortlist(shortlist);
   if (options.live && payload) {
     try {
       const response = await fetch(options.apiUrl, {
@@ -172,16 +164,23 @@ function scoreRow(fixture, plan, shortlist, extras = {}) {
     checks.push({ id: "minBridges", pass: minOk });
 
     const evidenceOk = bridges.every((item) => item.whyNeeded && item.evidence);
     checks.push({ id: "evidence", pass: evidenceOk });
 
     const precision = scorePrecision(bridges, expect.titleHints || []);
     checks.push({ id: "precision", pass: precision >= 0.5, value: precision });
 
+    if (expect.mustIncludeTitleHints?.length) {
+      const missing = expect.mustIncludeTitleHints.filter(
+        (hint) => !bridges.some((bridge) => overlaps(bridge.title, hint) || overlaps(bridge.whyNeeded, hint)),
+      );
+      checks.push({ id: "mustInclude", pass: missing.length === 0, missing });
+    }
+
     if (expect.gapKinds?.length && plan?.gaps?.length) {
       const kinds = new Set(plan.gaps.map((item) => item.kind));
       const hit = expect.gapKinds.some((kind) => kinds.has(kind));
       checks.push({ id: "gapKind", pass: hit });
     }
 
     if (expect.source) {
       checks.push({ id: "source", pass: plan?.source === expect.source });
diff --git a/src/situationBridge.js b/src/situationBridge.js
index ae5b864..1bf729c 100644
--- a/src/situationBridge.js
+++ b/src/situationBridge.js
@@ -63,23 +63,23 @@ export function prepareSituationBridgeShortlist({
     notes,
     explains,
     bookmarks,
     reader,
     pageText,
   });
   if (!fuel.length) return suppressedPlan("no-bridges", absence);
 
-  const offer = shouldOfferSituationBridge({ gaps, fuel, mode });
+  const offer = shouldOfferSituationBridge({ gaps, fuel, mode, reader });
   if (!offer.ok) return suppressedPlan(offer.reason, absence);
 
-  const candidates = fuseCandidates(gaps, fuel).slice(0, MAX_CANDIDATES);
+  const candidates = fuseCandidates(gaps, fuel, reader).slice(0, MAX_CANDIDATES);
   if (candidates.length < 2) return suppressedPlan("no-bridges", absence);
 
-  const localBridges = matchBridgesLocal(gaps, candidates, mode);
+  const localBridges = matchBridgesLocal(gaps, candidates, mode, reader);
   const chapterTitle = book.chapters[normalizedCursor.chapterIndex]?.title || `绗?${normalizedCursor.chapterIndex + 1} 鑺俙;
 
   return {
     suppressed: false,
     reason: null,
     intensity: absence.intensity,
     absenceLabel: absence.label,
     positionLabel: `涓婃鍋滃湪 ${chapterTitle} 路 绗?${(normalizedCursor.pageIndex || 0) + 1} 椤礰,
@@ -227,23 +227,23 @@ export function applySituationBridgeJudgement(shortlist, judgement) {
         gapId: gap?.id || null,
       };
     }
   }
 
   return finalizeSituationBridgePlan(shortlist, { bridges, question });
 }
 
-export function shouldOfferSituationBridge({ gaps = [], fuel = [], mode = "auto" } = {}) {
+export function shouldOfferSituationBridge({ gaps = [], fuel = [], mode = "auto", reader = null } = {}) {
   if (!gaps.length) return { ok: false, reason: "page-not-dependent" };
   const importantGaps = gaps.filter((gap) => gap.importance >= (mode === "manual" ? 0.35 : 0.45));
   if (!importantGaps.length) return { ok: false, reason: "low-importance-gaps" };
 
   const strongFuel = fuel.filter((item) => item.strength >= (mode === "manual" ? 0.35 : 0.42));
-  const canCover = importantGaps.some((gap) => strongFuel.some((item) => scoreGapFuel(gap, item) >= 0.28));
+  const canCover = importantGaps.some((gap) => strongFuel.some((item) => scoreGapFuel(gap, item, reader) >= 0.28));
   if (!canCover) return { ok: false, reason: "low-importance-gaps" };
   return { ok: true, reason: null };
 }
 
 export function situationBridgeToRecoveryCard(plan) {
   if (!plan || plan.suppressed || !plan.bridges?.length) return null;
   return {
     intensity: plan.intensity,
@@ -454,21 +454,21 @@ function collectRecallFuel({
 
   recentParagraphFuel(book, cursor).forEach((item) => fuel.push(item));
 
   // Drop fuel that shares almost no lexical contact with page or gaps later; keep for now.
   void pageText;
   return dedupeFuel(fuel).sort((a, b) => b.strength - a.strength);
 }
 
-function fuseCandidates(gaps, fuel) {
+function fuseCandidates(gaps, fuel, reader = null) {
   const scored = [];
   gaps.forEach((gap) => {
     const ranked = fuel
-      .map((item) => ({ item, score: scoreGapFuel(gap, item) }))
+      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader) }))
       .filter((entry) => entry.score >= 0.22)
       .sort((a, b) => b.score - a.score)
       .slice(0, 3);
     ranked.forEach((entry, index) => {
       scored.push({
         ...entry.item,
         candidateId: entry.item.id,
         forGapId: gap.id,
@@ -488,17 +488,17 @@ function fuseCandidates(gaps, fuel) {
     });
   });
 
   return dedupeFuel(scored)
     .sort((a, b) => (b.fuseScore || b.strength) - (a.fuseScore || a.strength))
     .slice(0, MAX_CANDIDATES);
 }
 
-function matchBridgesLocal(gaps, candidates, mode) {
+function matchBridgesLocal(gaps, candidates, mode, reader = null) {
   const bridges = [];
   const usedCandidates = new Set();
   const threshold = mode === "manual" ? 0.3 : 0.34;
   const sortedGaps = [...gaps].sort((a, b) => b.importance - a.importance);
 
   const pushBridge = (gap, item, score) => {
     const candidateId = item.candidateId || item.id;
     if (!gap || !candidateId || usedCandidates.has(candidateId)) return false;
@@ -514,28 +514,28 @@ function matchBridgesLocal(gaps, candidates, mode) {
       score,
     });
     return true;
   };
 
   sortedGaps.forEach((gap) => {
     const best = candidates
       .filter((item) => !usedCandidates.has(item.candidateId || item.id))
-      .map((item) => ({ item, score: scoreGapFuel(gap, item) }))
+      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader) }))
       .filter((entry) => entry.score >= threshold)
       .sort((a, b) => b.score - a.score)[0];
     if (best) pushBridge(gap, best.item, best.score);
   });
 
   // One gap must not cap the card at a single bridge when other strong candidates remain.
   if (bridges.length && bridges.length < MAX_BRIDGES_AUTO) {
     const fillGap = sortedGaps[0];
     candidates
       .filter((item) => !usedCandidates.has(item.candidateId || item.id))
-      .map((item) => ({ item, score: scoreGapFuel(fillGap, item) }))
+      .map((item) => ({ item, score: scoreGapFuel(fillGap, item, reader) }))
       .filter((entry) => entry.score >= threshold)
       .sort((a, b) => b.score - a.score)
       .forEach((entry) => {
         if (bridges.length >= MAX_BRIDGES_SHOW) return;
         pushBridge(fillGap, entry.item, entry.score);
       });
   }
 
@@ -560,29 +560,47 @@ function whyNeededText(gap, candidate) {
     return `鏈〉鍦烘櫙钀藉埌銆?{clip(label, 16)}銆嶏紝闇€鍏堟帴涓婃鍓嶄綅缃彉鍖栥€俙;
   }
   if (gap.kind === "temporal") {
     return `鏈〉鎵挎帴姝ゅ墠闃舵锛岄渶鍏堟兂璧凤細${clip(candidate.title, 16)}銆俙;
   }
   return `璇绘噦鏈〉鍓嶏紝鍏堟帴涓婏細${clip(candidate.title, 16)}銆俙;
 }
 
-function scoreGapFuel(gap, item) {
+function scoreGapFuel(gap, item, reader = null) {
   if (!gap || !item) return 0;
   const kindBonus = (item.gapKinds || []).includes(gap.kind) ? 0.22 : 0;
   const label = normaliseText(gap.label);
   const hay = normaliseText(`${item.title} ${item.snippet}`);
   let overlap = 0;
   if (label && hay.includes(label)) overlap += 0.5;
   tokenize(label).forEach((token) => {
     if (token.length >= 2 && hay.includes(token)) overlap += 0.08;
   });
   const strength = Number(item.strength) || 0.3;
   const traceBonus = item.channel === "readerTrace" ? 0.12 : 0;
-  return Math.min(1.4, overlap + kindBonus + strength * 0.45 + traceBonus);
+  const readerDelta = readerSignalDelta(item.id || item.candidateId, reader);
+  return Math.min(1.4, overlap + kindBonus + strength * 0.45 + traceBonus + readerDelta);
+}
+
+/** Secondary Reader Memory signal only; never replaces gap fit. */
+function readerSignalDelta(key, reader) {
+  return readerSignalDeltaForKeys([key], reader);
+}
+
+function readerSignalDeltaForKeys(keys, reader) {
+  if (!reader || !keys?.length) return 0;
+  let missed = 0;
+  let remembered = 0;
+  for (const key of keys) {
+    if (!key) continue;
+    if (reader?.missedKeys?.includes(key)) missed = 0.12;
+    if (reader?.rememberedKeys?.includes(key)) remembered = -0.06;
+  }
+  return Math.max(-0.08, Math.min(0.15, missed + remembered));
 }
 
 function channelForMemoryItem(item) {
   if (item.kind === "place") return "spatial";
   if (item.kind === "person" || item.kind === "organization") return "entity";
   if (item.kind === "event" || item.kind === "scene" || item.kind === "timepoint") return "causal";
   if (item.kind === "claim" || item.kind === "conclusion" || item.kind === "reason") return "intent";
   if (item.kind === "concept" || item.kind === "definition" || item.kind === "mechanism" || item.kind === "framework") return "concept";
@@ -600,17 +618,19 @@ function kindsForChannel(channel) {
     proximity: ["causal", "state", "temporal", "person"],
   }[channel] || ["state"];
 }
 
 function memoryStrength(item, reader) {
   const priority = item.priority === "primary" ? 0.7 : item.priority === "recent" ? 0.55 : 0.4;
   const mainline = ACTION_HINT.test(item.summary || "") ? 0.15 : 0;
   const forgetting = readerForgettingScore({ memoryKey: item.id, reader }) * 0.12;
-  return Math.min(1, priority + mainline + forgetting);
+  // Fuel ids are `mem:${id}`; feedback keys from cards use the same form.
+  const readerDelta = readerSignalDeltaForKeys([`mem:${item.id}`, item.id], reader);
+  return Math.min(1, Math.max(0, priority + mainline + forgetting + readerDelta));
 }
 
 function recentParagraphFuel(book, cursor) {
   const items = [];
   const chapters = book?.chapters || [];
   let remaining = 8;
   for (let chapterIndex = cursor.chapterIndex; chapterIndex >= 0 && remaining > 0; chapterIndex -= 1) {
     const paragraphs = chapters[chapterIndex]?.paragraphs || [];

