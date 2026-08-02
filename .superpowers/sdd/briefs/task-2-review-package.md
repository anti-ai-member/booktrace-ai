# Review package Task 2 (post-fix)
BASE: 1a6fe80a2a85783f5b57007cc367455cfe40b879
HEAD: 1567a0f5addb75f3d2bdd07ea35bff4e496c665d

## Commits
1567a0f fix: narrow recovery feedback keys to bridges and keyPoints
3e1f270 feat: persist recovery bridge feedback into Reader Memory


## Stat
 .superpowers/sdd/briefs/task-2-report.md | 97 ++++++++++++++++++++++++++++++++
 scripts/verify-situation-bridge.mjs      | 26 +++++++++
 src/App.jsx                              | 39 ++++++++++++-
 src/memoryModels.js                      | 21 +++++++
 4 files changed, 180 insertions(+), 3 deletions(-)


## Diff
diff --git a/.superpowers/sdd/briefs/task-2-report.md b/.superpowers/sdd/briefs/task-2-report.md
new file mode 100644
index 0000000..71a8cb0
--- /dev/null
+++ b/.superpowers/sdd/briefs/task-2-report.md
@@ -0,0 +1,97 @@
+# Task 2 Report: Persist card feedback into Reader Memory
+
+**Status:** DONE  
+**Branch:** `season/bridge-retention`  
+**Base:** `1a6fe80a2a85783f5b57007cc367455cfe40b879`  
+**Commit:** `3e1f270` 鈥?feat: persist recovery bridge feedback into Reader Memory
+
+## Deliverables
+
+| File | Action |
+| --- | --- |
+| `src/memoryModels.js` | Added `markReaderBridgeFeedback` (maps remembered/knew 鈫?`rememberedKeys`, missed/forgot 鈫?`missedKeys`) |
+| `src/App.jsx` | Wired feedback through `updateRecoveryMemoryState` / `recordRecoveryInteraction`; prefer `bridges[].candidateId` then `keyPoints[].memoryKey`; merge into analysis `bookMemory.reader` when a record exists |
+| `scripts/verify-situation-bridge.mjs` | Extended with node asserts for remembered/missed/knew and non-feedback no-op |
+
+## Task checklist
+
+- [x] Step 1: Inspect existing track actions 鈥?RecoveryCard emits `remembered` / `missed` (titles 鎯宠捣鏉ヤ簡 / 杩樻病鎯宠捣); also shown/hint/answer/evidence (metrics only)
+- [x] Step 2: Add `markReaderBridgeFeedback` in `memoryModels.js` (verbatim from brief)
+- [x] Step 3: Wire keys + persist via `recoveryMemoryStorageKey(book)` and analysis `bookMemory.reader`
+- [x] Step 4: Smoke via node asserts (browser localStorage check documented below)
+- [x] Step 5: Commit
+
+## Implementation notes
+
+### Track action mapping
+- UI sends `remembered` / `missed` only for Reader Memory key updates.
+- Helper also accepts aliases `knew` / `forgot`.
+- `shown` / `hint` / `answer` / `evidence` / `continue` still update metrics / per-key strength where applicable; they do **not** append to `rememberedKeys` / `missedKeys`.
+
+### Key collection (`recoveryCardMemoryKeys`)
+Order of preference:
+1. `card.bridges[].candidateId` (fallback `memoryKey`)
+2. `card.keyPoints[].memoryKey`
+3. Legacy: prerequisites / question / evidence memoryKeys (for strength tracking continuity)
+
+### Persistence paths
+1. **Recovery memory** (`shumai-recovery-memory:鈥): `next.reader` via `markReaderBridgeFeedback` + `updateReaderMemory` (lastActivityAt + forgettingScores).
+2. **Analysis record** (`yuezhi-analysis:鈥): when present, `bookMemory.reader` merged with the same feedback keys (`mergeReaderFeedbackIntoAnalysis`).
+
+`recordRecoveryInteraction` continues to call `updateRecoveryMemoryState`, so footer taps (鎯宠捣浜?/ 杩樻病鎯宠捣) flow through both stores.
+
+## Tests
+
+```text
+node scripts/verify-situation-bridge.mjs
+鈫?situation-bridge smoke ok { 鈥?readerFeedback: { remembered: 2, missed: 1 } }
+```
+
+Asserts covered:
+- remembered keys persist
+- missed merges without clearing remembered
+- non-feedback `shown` does not write keys
+- `knew` maps to remembered
+
+### Manual browser check (optional)
+1. Open builtin銆婇暱寰併€? force a recovery card (History on a dependent page / absence).
+2. Tap 鎯宠捣鏉ヤ簡 or 杩樻病鎯宠捣.
+3. In DevTools 鈫?Application 鈫?Local Storage, inspect:
+   - `shumai-recovery-memory:<bookId>` 鈫?`reader.rememberedKeys` / `reader.missedKeys`
+   - `yuezhi-analysis:鈥 (if analysis exists) 鈫?`bookMemory.reader` same keys
+4. Reload and confirm keys remain.
+
+## Self-review
+
+### Spec fidelity (Feature 019 item 1)
+- Persist track actions onto Reader Memory with `rememberedKeys` / `missedKeys` keyed by bridge `candidateId` / `memoryKey`: **done**.
+- No memory dashboard UI; no adjudicator budget changes; desktop-only scope untouched.
+
+### Concerns
+- None blocking. Browser end-to-end not run in this session (node helper coverage instead); Task 3 should consume these keys in `scoreGapFuel`.
+- When no analysis record exists yet, feedback lives only under recovery-memory until the next analysis write 鈥?by design.
+
+## Next task
+
+Task 3: Score bridges with Reader Memory (secondary only) 鈥?missed boost / remembered dampen 鈮?~0.15, extend eval fixtures.
+
+---
+
+## Review fix (Important)
+
+**Commit:** `d84c684` 鈥?fix: narrow recovery feedback keys to bridges and keyPoints  
+**Issue:** `updateRecoveryMemoryState` passed the full `recoveryCardMemoryKeys(card)` set into `markReaderBridgeFeedback` / `mergeReaderFeedbackIntoAnalysis`, incorrectly including question / prerequisites / evidence keys.
+
+**Change:**
+- Added `recoveryBridgeFeedbackKeys(card)` in `src/memoryModels.js` (bridges `candidateId` + keyPoints `memoryKey` only).
+- `App.jsx`: feedback paths use `feedbackKeys`; per-key strength / `forgettingScores` still use full `recoveryCardMemoryKeys`.
+- `scripts/verify-situation-bridge.mjs`: asserts fake card with `question.memoryKey` excludes that key from feedback collection.
+
+**Test:**
+
+```text
+node scripts/verify-situation-bridge.mjs
+鈫?situation-bridge smoke ok { 鈥?readerFeedback: { remembered: 2, missed: 1 } }
+```
+
+New asserts: feedback keys from bridges/keyPoints only; question/prereq/evidence excluded.
diff --git a/scripts/verify-situation-bridge.mjs b/scripts/verify-situation-bridge.mjs
index bb55eb8..4e4dee9 100644
--- a/scripts/verify-situation-bridge.mjs
+++ b/scripts/verify-situation-bridge.mjs
@@ -1,8 +1,12 @@
+import {
+  markReaderBridgeFeedback,
+  recoveryBridgeFeedbackKeys,
+} from "../src/memoryModels.js";
 import {
   adjudicatorPayloadFromShortlist,
   applySituationBridgeJudgement,
   buildSituationBridgePlan,
   prepareSituationBridgeShortlist,
   situationBridgeToRecoveryCard,
   shouldOfferSituationBridge,
 } from "../src/situationBridge.js";
@@ -158,13 +162,35 @@ const rejected = applySituationBridgeJudgement(shortlist, {
   ],
 });
 assert(
   rejected.source === "local" || rejected.suppressed
     || rejected.bridges.every((item) => item.candidateId !== "invented-cand"),
   "invented ids rejected",
 );
 
+// Reader Memory bridge feedback (Task 2)
+const remembered = markReaderBridgeFeedback(null, { action: "remembered", keys: ["cand:a", "cand:b"] });
+assert(remembered.rememberedKeys.includes("cand:a") && remembered.rememberedKeys.includes("cand:b"), "remembered keys persist");
+const missed = markReaderBridgeFeedback(remembered, { action: "missed", keys: ["cand:c"] });
+assert(missed.missedKeys.includes("cand:c") && missed.rememberedKeys.includes("cand:a"), "missed merges without clearing remembered");
+const ignored = markReaderBridgeFeedback(missed, { action: "shown", keys: ["cand:d"] });
+assert(!ignored.rememberedKeys.includes("cand:d") && !ignored.missedKeys.includes("cand:d"), "non-feedback actions skip key updates");
+const knew = markReaderBridgeFeedback(null, { action: "knew", keys: ["cand:e"] });
+assert(knew.rememberedKeys.includes("cand:e"), "knew maps to remembered");
+
+const feedbackKeys = recoveryBridgeFeedbackKeys({
+  bridges: [{ candidateId: "cand:bridge" }],
+  keyPoints: [{ memoryKey: "kp:1" }],
+  question: { memoryKey: "q:should-not-feedback" },
+  prerequisites: [{ memoryKey: "prereq:skip" }],
+  evidence: [{ memoryKey: "ev:skip" }],
+});
+assert(feedbackKeys.includes("cand:bridge") && feedbackKeys.includes("kp:1"), "feedback keys from bridges/keyPoints");
+assert(!feedbackKeys.includes("q:should-not-feedback"), "question memoryKey excluded from feedback keys");
+assert(!feedbackKeys.includes("prereq:skip") && !feedbackKeys.includes("ev:skip"), "prereq/evidence excluded from feedback keys");
+
 console.log("situation-bridge smoke ok", {
   bridges: dependent.bridges.map((item) => item.title),
   scenicReason: scenic.reason,
   judgedSource: judged.source,
+  readerFeedback: { remembered: remembered.rememberedKeys.length, missed: missed.missedKeys.length },
 });
diff --git a/src/App.jsx b/src/App.jsx
index 0d43144..dc1e2a4 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -49,16 +49,18 @@ import {
 import { parseEpub } from "./epub.js";
 import { BOOK_TYPES, findBookType } from "./bookTaxonomy.js";
 import { buildMemoryCandidates, buildMemoryEvidenceStore, locateEvidence } from "./memoryEngine.js";
 import {
   bookMemoryFromLegacy,
   collectMemoryAnchors,
   compatibilityTraceMemory,
   hasBookMemoryContent,
+  markReaderBridgeFeedback,
+  recoveryBridgeFeedbackKeys,
   normalizeBookMemory,
   readingIndexFromBookMemory,
   readerForgettingScore,
   updateReaderMemory,
 } from "./memoryModels.js";
 import {
   adjudicatorPayloadFromShortlist,
   applySituationBridgeJudgement,
@@ -4225,16 +4227,17 @@ function buildRecoveryPrerequisites(book, cursor, evidence) {
 }
 
 function updateRecoveryMemoryState(book, card, action) {
   if (!book || !card || !["shown", "remembered", "missed", "hint", "answer"].includes(action)) return;
   const storageKey = recoveryMemoryStorageKey(book);
   const current = loadStored(storageKey, {});
   const now = new Date().toISOString();
   const keys = recoveryCardMemoryKeys(card);
+  const feedbackKeys = recoveryBridgeFeedbackKeys(card);
   if (!keys.length) return;
   const next = { ...current };
   keys.forEach((key) => {
     const item = next[key] || { strength: 0, shown: 0, remembered: 0, missed: 0, hints: 0, answers: 0 };
     const updated = { ...item, updatedAt: now };
     if (action === "shown") {
       updated.shown = Number(updated.shown || 0) + 1;
       updated.lastShownAt = now;
@@ -4256,45 +4259,75 @@ function updateRecoveryMemoryState(book, card, action) {
     }
     if (action === "answer") {
       updated.answers = Number(updated.answers || 0) + 1;
       updated.lastAnswerAt = now;
       updated.strength = Math.max(0, Number(updated.strength || 0) - 1);
     }
     next[key] = updated;
   });
-  next.reader = updateReaderMemory(current.reader || null, {
+  const feedbackReader = markReaderBridgeFeedback(current.reader || null, {
+    action: action === "remembered" || action === "missed" ? action : null,
+    keys: action === "remembered" || action === "missed" ? feedbackKeys : [],
+  });
+  next.reader = updateReaderMemory(feedbackReader, {
     lastActivityAt: Date.now(),
-    rememberedKeys: action === "remembered" ? keys : [],
-    missedKeys: action === "missed" ? keys : [],
     forgettingScores: Object.fromEntries(keys.map((key) => [
       key,
       readerForgettingScore({
         memoryKey: key,
         reader: {
           rememberedKeys: action === "remembered" ? keys : [],
           missedKeys: action === "missed" ? keys : [],
         },
       }),
     ])),
   });
   localStorage.setItem(storageKey, JSON.stringify(next));
+  if (action === "remembered" || action === "missed") {
+    mergeReaderFeedbackIntoAnalysis(book, action, feedbackKeys);
+  }
 }
 
+/** Prefer bridge candidateId, then keyPoint memoryKey (Feature 019 feedback keys). */
 function recoveryCardMemoryKeys(card) {
   const keys = [
+    ...(card.bridges || []).map((item) => item.candidateId || item.memoryKey),
     ...(card.keyPoints || []).map((item) => item.memoryKey || item.evidence?.memoryKey),
     ...(card.prerequisites || []).map((item) => item.memoryKey || item.evidence?.memoryKey),
     card.question?.memoryKey,
     card.question?.evidence?.memoryKey,
     ...(card.evidence || []).map((item) => item.memoryKey),
   ];
   return [...new Set(keys.filter(Boolean))].slice(0, 8);
 }
 
+function mergeReaderFeedbackIntoAnalysis(book, action, keys) {
+  if (!book || !keys?.length) return;
+  if (action !== "remembered" && action !== "missed") return;
+  try {
+    const storageKey = analysisStorageKey(book);
+    const stored = loadStored(storageKey, null);
+    if (!stored) return;
+    const record = hydrateAnalysisRecord(stored, book);
+    if (!record?.bookMemory) return;
+    const nextReader = markReaderBridgeFeedback(record.bookMemory.reader, { action, keys });
+    localStorage.setItem(storageKey, JSON.stringify({
+      ...record,
+      bookMemory: {
+        ...record.bookMemory,
+        reader: nextReader,
+        updatedAt: new Date().toISOString(),
+      },
+    }));
+  } catch {
+    // Ignore storage failures; recovery-memory path still holds the feedback.
+  }
+}
+
 function recoveryMemoryKey(kind = "memory", title = "", occurrence = {}) {
   const chapterIndex = Number.isInteger(Number(occurrence.chapterIndex)) ? Number(occurrence.chapterIndex) : 0;
   const paragraphIndex = Number.isInteger(Number(occurrence.paragraphIndex)) ? Number(occurrence.paragraphIndex) : 0;
   const normalizedTitle = summaryText(title || "memory").replace(/\s+/g, "").slice(0, 32);
   return `${kind}:${chapterIndex}:${paragraphIndex}:${normalizedTitle}`;
 }
 
 function recoveryForgettingBoost(state = null, occurrence = {}, cursor = {}) {
diff --git a/src/memoryModels.js b/src/memoryModels.js
index 1c1b095..91753d5 100644
--- a/src/memoryModels.js
+++ b/src/memoryModels.js
@@ -250,16 +250,37 @@ export function updateReaderMemory(reader = null, patch = {}) {
     rememberedKeys: uniqueStrings([...(current.rememberedKeys || []), ...(patch.rememberedKeys || [])]),
     missedKeys: uniqueStrings([...(current.missedKeys || []), ...(patch.missedKeys || [])]),
     noteRefs: uniqueStrings([...(current.noteRefs || []), ...(patch.noteRefs || [])]),
     bookmarkRefs: uniqueStrings([...(current.bookmarkRefs || []), ...(patch.bookmarkRefs || [])]),
     forgettingScores: { ...current.forgettingScores, ...(patch.forgettingScores || {}) },
   });
 }
 
+/** Feedback keys only from bridges and keyPoints (Feature 019 / Task 2). */
+export function recoveryBridgeFeedbackKeys(card) {
+  return [...new Set([
+    ...(card?.bridges || []).map((item) => item.candidateId || item.memoryKey),
+    ...(card?.keyPoints || []).map((item) => item.memoryKey || item.evidence?.memoryKey),
+  ].filter(Boolean))];
+}
+
+/** Map recovery-card track actions onto Reader Memory remembered/missed keys. */
+export function markReaderBridgeFeedback(reader = null, { action, keys = [] } = {}) {
+  const list = (keys || []).map(String).filter(Boolean);
+  if (!list.length) return normalizeReaderMemory(reader);
+  if (action === "remembered" || action === "knew") {
+    return updateReaderMemory(reader, { rememberedKeys: list });
+  }
+  if (action === "missed" || action === "forgot") {
+    return updateReaderMemory(reader, { missedKeys: list });
+  }
+  return normalizeReaderMemory(reader);
+}
+
 export function collectMemoryAnchors(memory = null, cursor = null, reader = null) {
   const scoped = filterBookMemoryByCursor(memory, cursor);
   const readerState = normalizeReaderMemory(reader || scoped.reader);
   const items = [
     ...(scoped.episodic || []),
     ...(scoped.timeline || []),
     ...(scoped.arguments || []),
     ...(scoped.topics || []),

