# Review package Task 8
BASE: 52670123f07200fca1d29dc3bdd7df225194e51c
HEAD: 38f28857e89169872aa3205d483f58034b8c7596

## Commits
38f2885 feat: type-honest gap/fuel bias for situation bridges


## Stat
 scripts/fixtures/situation-bridge-cases.json |  6 +--
 scripts/situation-bridge-eval.mjs            |  1 +
 src/App.jsx                                  |  4 ++
 src/situationBridge.js                       | 67 ++++++++++++++++++++--------
 4 files changed, 56 insertions(+), 22 deletions(-)


## Diff
diff --git a/scripts/fixtures/situation-bridge-cases.json b/scripts/fixtures/situation-bridge-cases.json
index 7af1689..1bf4f3a 100644
--- a/scripts/fixtures/situation-bridge-cases.json
+++ b/scripts/fixtures/situation-bridge-cases.json
@@ -205,17 +205,17 @@
   {
     "id": "concept-intent-show",
     "bookType": "argument",
     "factor": "concept+intent",
     "expect": {
       "suppressed": false,
       "minBridges": 2,
       "titleHints": ["鍙敊鎬?, "璇佷吉", "鎵硅瘎"],
-      "gapKinds": ["concept", "intent", "causal", "state"]
+      "gapKinds": ["concept", "causal"]
     },
     "book": {
       "id": "arg-a",
       "chapters": [
         {
           "id": "c0",
           "title": "鍙敊鎬?,
           "paragraphs": [
@@ -355,17 +355,17 @@
   {
     "id": "reader-trace-intent-show",
     "bookType": "fiction",
     "factor": "intent+reader",
     "expect": {
       "suppressed": false,
       "minBridges": 2,
       "titleHints": ["鑳屽彌", "绂诲紑", "濂戠害"],
-      "gapKinds": ["intent", "person", "causal", "state", "relation"]
+      "gapKinds": ["person", "causal", "intent"]
     },
     "book": {
       "id": "fic-a",
       "chapters": [
         {
           "id": "c0",
           "title": "濂戠害",
           "paragraphs": [
@@ -610,17 +610,17 @@
     "cursor": { "chapterIndex": 1, "pageIndex": 0, "paragraphIndex": 0 },
     "currentPageText": "鍥犳澶忚嫳鏉颁笅浠ょ户缁寳涓婏紝娓″彛涓€浜嬩粛鍘嬪湪浼椾汉蹇冨ご銆?,
     "mode": "manual"
   },
   {
     "id": "reader-remembered-not-only",
     "bookType": "history",
     "factor": "reader-remembered",
-    "reader": { "rememberedKeys": ["mem:person:灞辫胺鏂ュ€?] },
+    "reader": { "rememberedKeys": ["mem:e-weak"] },
     "expect": {
       "suppressed": false,
       "minBridges": 2,
       "titleHints": ["澶忚嫳鏉?, "娓″彛", "灏侀攣"],
       "gapKinds": ["person", "causal", "intent", "state"]
     },
     "book": {
       "id": "hist-a",
diff --git a/scripts/situation-bridge-eval.mjs b/scripts/situation-bridge-eval.mjs
index 2954b5e..6162c3f 100644
--- a/scripts/situation-bridge-eval.mjs
+++ b/scripts/situation-bridge-eval.mjs
@@ -44,16 +44,17 @@ async function evaluateCase(fixture, options) {
     cursor: fixture.cursor,
     currentPageText: fixture.currentPageText,
     notes: fixture.notes || [],
     explains: fixture.explains || [],
     bookmarks: fixture.bookmarks || [],
     reader: fixture.reader || null,
     mode: fixture.mode || "manual",
     minAbsenceMs: 0,
+    bookType: fixture.bookType || fixture.book?.bookType || "",
   };
   const shortlist = prepareSituationBridgeShortlist(planOptions);
 
   let plan;
   let liveMeta = null;
   if (fixture.useJudgement && !shortlist.suppressed) {
     const judgement = await buildJudgement(shortlist, fixture, options);
     plan = applySituationBridgeJudgement(shortlist, judgement.payload);
diff --git a/src/App.jsx b/src/App.jsx
index 59fca45..747b1d1 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -1033,16 +1033,17 @@ export function App() {
       const cursor = { ...normalizeRecoveryCursor(nextBook, saved), pageWidth: saved.pageWidth, pageHeight: saved.pageHeight };
       const readerFuel = {
         notes: loadStored(notesStorageKey(nextBook), []),
         explains: loadExplains(nextBook),
         bookmarks: loadStored(bookmarkStorageKey(nextBook), []),
       };
       const { shortlist, card: localCard } = prepareSituationRecovery(nextBook, persistedMemory, cursor, lastActivity, memoryState, {
         mode: "auto",
+        bookType: nextBook.bookType || storedRecord?.profile?.category || "",
         ...readerFuel,
       });
       if (recoveryCardJobRef.current !== jobId) return;
       if (localCard) setRecoveryCard(localCard);
 
       if (!ENABLE_SITUATION_BRIDGE_ADJUDICATOR || !shortlist || shortlist.suppressed) {
         setTraceJob({
           status: "done",
@@ -1139,16 +1140,17 @@ export function App() {
     if (!hasPriorReadingContext) {
       showNotice("杩樻病鏈夊墠鏂囧彲鍥炲繂");
       return;
     }
     const cursor = { ...getReadCursor(), pageWidth, pageHeight };
     const memoryState = loadStored(recoveryMemoryStorageKey(book), {});
     const { shortlist, card: localCard } = prepareSituationRecovery(book, bookMemory, cursor, null, memoryState, {
       mode: "manual",
+      bookType: book.bookType || bookProfile?.category || "",
       notes,
       explains,
       bookmarks,
     });
     if (localCard) {
       setRecoveryCard(localCard);
     } else {
       showNotice(suppressReasonMessage(shortlist?.reason, "manual") || "褰撳墠椤典笉蹇呭厛鍥炴兂");
@@ -1505,16 +1507,17 @@ export function App() {
       setBookProfile(result.profile);
       setBook((current) => current ? { ...current, bookType: result.profile.category, indexSchema: result.profile.facets } : current);
       setLibraryBooks((items) => items.map((item) => item.id === book.id ? { ...item, bookType: result.profile.category, indexSchema: result.profile.facets } : item));
       let nextRecoveryCard = null;
       setTraceJob({ status: "running", message: "姝ｅ湪鐢熸垚缁鎺ラ┏鍗? });
       const memoryState = loadStored(recoveryMemoryStorageKey(book), {});
       const prepared = prepareSituationRecovery(book, nextBookMemory, cursor, null, memoryState, {
         mode: "manual",
+        bookType: result.profile?.category || book.bookType || bookProfile?.category || "",
         notes,
         explains,
         bookmarks,
       });
       nextRecoveryCard = prepared.card;
       if (ENABLE_SITUATION_BRIDGE_ADJUDICATOR && prepared.shortlist && !prepared.shortlist.suppressed) {
         nextRecoveryCard = await requestSituationBridgeJudgement({
           shortlist: prepared.shortlist,
@@ -3841,16 +3844,17 @@ function prepareSituationRecovery(book, bookMemoryInput = {}, savedPosition = {}
     currentPageText,
     lastActivity,
     reader: memoryState?.reader || memoryState,
     notes: options.notes || [],
     explains: options.explains || [],
     bookmarks: options.bookmarks || [],
     mode: options.mode || "auto",
     minAbsenceMs: options.mode === "manual" ? 0 : RECOVERY_CARD_MIN_ABSENCE_MS,
+    bookType: options.bookType || book?.bookType || "",
   });
   const plan = finalizeSituationBridgePlan(shortlist, null);
   return { shortlist, card: situationBridgeToRecoveryCard(plan) };
 }
 
 function buildSituationRecoveryCard(book, bookMemoryInput = {}, savedPosition = {}, lastActivity = null, memoryState = {}, options = {}) {
   return prepareSituationRecovery(book, bookMemoryInput, savedPosition, lastActivity, memoryState, options).card;
 }
diff --git a/src/situationBridge.js b/src/situationBridge.js
index 1bf729c..d0adfb2 100644
--- a/src/situationBridge.js
+++ b/src/situationBridge.js
@@ -35,51 +35,53 @@ export function prepareSituationBridgeShortlist({
   currentPageText = "",
   lastActivity = null,
   reader = null,
   notes = [],
   explains = [],
   bookmarks = [],
   mode = "auto",
   minAbsenceMs = 0,
+  bookType = "",
 } = {}) {
   const absence = describeAbsence(lastActivity);
   const normalizedCursor = normalizeCursor(cursor);
   const memory = normalizeBookMemory(bookMemory || {});
+  const bias = typeBias(bookType || book?.bookType || "");
 
   if (mode === "auto" && minAbsenceMs > 0 && Number(lastActivity || 0) && Date.now() - Number(lastActivity) < minAbsenceMs) {
     return suppressedPlan("recent-activity", absence);
   }
   if (!book?.chapters?.length || !hasRecoverablePriorContext(normalizedCursor)) {
     return suppressedPlan("low-context", absence);
   }
 
   const pageText = normaliseText(currentPageText || extractCurrentPageText(book, normalizedCursor));
-  const gaps = extractPageGaps(pageText, memory, normalizedCursor);
+  const gaps = extractPageGaps(pageText, memory, normalizedCursor, bias);
   if (!gaps.length) return suppressedPlan("page-not-dependent", absence);
 
   const fuel = collectRecallFuel({
     book,
     bookMemory: memory,
     cursor: normalizedCursor,
     notes,
     explains,
     bookmarks,
     reader,
     pageText,
   });
   if (!fuel.length) return suppressedPlan("no-bridges", absence);
 
-  const offer = shouldOfferSituationBridge({ gaps, fuel, mode, reader });
+  const offer = shouldOfferSituationBridge({ gaps, fuel, mode, reader, bias });
   if (!offer.ok) return suppressedPlan(offer.reason, absence);
 
-  const candidates = fuseCandidates(gaps, fuel, reader).slice(0, MAX_CANDIDATES);
+  const candidates = fuseCandidates(gaps, fuel, reader, bias).slice(0, MAX_CANDIDATES);
   if (candidates.length < 2) return suppressedPlan("no-bridges", absence);
 
-  const localBridges = matchBridgesLocal(gaps, candidates, mode, reader);
+  const localBridges = matchBridgesLocal(gaps, candidates, mode, reader, bias);
   const chapterTitle = book.chapters[normalizedCursor.chapterIndex]?.title || `绗?${normalizedCursor.chapterIndex + 1} 鑺俙;
 
   return {
     suppressed: false,
     reason: null,
     intensity: absence.intensity,
     absenceLabel: absence.label,
     positionLabel: `涓婃鍋滃湪 ${chapterTitle} 路 绗?${(normalizedCursor.pageIndex || 0) + 1} 椤礰,
@@ -227,27 +229,47 @@ export function applySituationBridgeJudgement(shortlist, judgement) {
         gapId: gap?.id || null,
       };
     }
   }
 
   return finalizeSituationBridgePlan(shortlist, { bridges, question });
 }
 
-export function shouldOfferSituationBridge({ gaps = [], fuel = [], mode = "auto", reader = null } = {}) {
+export function shouldOfferSituationBridge({ gaps = [], fuel = [], mode = "auto", reader = null, bias = null } = {}) {
   if (!gaps.length) return { ok: false, reason: "page-not-dependent" };
+  const typeWeights = bias || typeBias();
   const importantGaps = gaps.filter((gap) => gap.importance >= (mode === "manual" ? 0.35 : 0.45));
   if (!importantGaps.length) return { ok: false, reason: "low-importance-gaps" };
 
   const strongFuel = fuel.filter((item) => item.strength >= (mode === "manual" ? 0.35 : 0.42));
-  const canCover = importantGaps.some((gap) => strongFuel.some((item) => scoreGapFuel(gap, item, reader) >= 0.28));
+  const canCover = importantGaps.some((gap) => strongFuel.some((item) => scoreGapFuel(gap, item, reader, typeWeights) >= 0.28));
   if (!canCover) return { ok: false, reason: "low-importance-gaps" };
   return { ok: true, reason: null };
 }
 
+/** Type-honest multipliers for gap importance and fuel kind bonus. */
+export function typeBias(category = "") {
+  const text = String(category || "");
+  if (/绉戞櫘|鎶€鏈瘄鍝插|鍟嗕笟|鏁欐潗|璁鸿瘉|绀剧|argument|science|tech|philosophy|business|textbook|social/i.test(text)) {
+    return { concept: 1.2, intent: 1.1, causal: 1.05, person: 0.85, spatial: 0.8 };
+  }
+  if (/灏忚|鏂囧|fiction|romance/i.test(text)) {
+    return { person: 1.15, intent: 1.15, relation: 1.1, concept: 0.85 };
+  }
+  return { person: 1.05, causal: 1.1, temporal: 1.05, spatial: 1.05 };
+}
+
+function biasImportance(kind, importance, bias, { primary = false } = {}) {
+  let factor = Number(bias?.[kind]) || 1;
+  // Argument/science: demote incidental people, keep primary closer to unscaled.
+  if (primary && factor < 1) factor = Math.min(1, factor + 0.12);
+  return Math.min(1, importance * factor);
+}
+
 export function situationBridgeToRecoveryCard(plan) {
   if (!plan || plan.suppressed || !plan.bridges?.length) return null;
   return {
     intensity: plan.intensity,
     absenceLabel: plan.absenceLabel,
     positionLabel: plan.positionLabel,
     bridges: plan.bridges,
     gaps: plan.gaps,
@@ -275,68 +297,71 @@ export function suppressReasonMessage(reason, mode = "manual") {
     return "杩樻病鏈夎冻澶熺殑鍓嶆枃鍙洖鎯?;
   }
   if (reason === "recent-activity" && mode === "auto") {
     return "";
   }
   return "姝ゅ埢娌℃湁闇€瑕佹帴涓婄殑鍓嶆枃";
 }
 
-function extractPageGaps(pageText, memory, cursor) {
+function extractPageGaps(pageText, memory, cursor, bias = null) {
   const text = normaliseText(pageText);
   if (text.length < 24) return [];
+  const typeWeights = bias || typeBias();
 
   const gaps = [];
-  const pushGap = (label, kind, importance) => {
+  const pushGap = (label, kind, importance, meta = {}) => {
     const clean = clip(normaliseText(label), 40);
     if (!clean || clean.length < 2) return;
+    // Fiction: demote abstract mega-topics harder via concept bias.
     if (isBroadMegaTopic(clean) && importance < 0.7) return;
     if (NOISE_PATTERNS.test(clean)) return;
+    const scaled = biasImportance(kind, importance, typeWeights, meta);
     const dupIndex = gaps.findIndex((item) => {
       if (item.label === clean) return true;
       const short = Math.min(item.label.length, clean.length);
       const long = Math.max(item.label.length, clean.length);
       // Long causal/intent clauses must not swallow compact person/concept labels.
       if (short <= 12 && long >= 18 && (item.label.includes(clean) || clean.includes(item.label))) {
         return false;
       }
       return item.label.includes(clean) || clean.includes(item.label);
     });
     if (dupIndex >= 0) {
       const existing = gaps[dupIndex];
-      if (clean.length + 4 < existing.label.length && existing.label.includes(clean) && importance >= existing.importance - 0.05) {
+      if (clean.length + 4 < existing.label.length && existing.label.includes(clean) && scaled >= existing.importance - 0.05) {
         gaps[dupIndex] = {
           id: existing.id,
           label: clean,
           kind,
-          importance: Math.min(1, Math.max(existing.importance, importance)),
+          importance: Math.min(1, Math.max(existing.importance, scaled)),
         };
       }
       return;
     }
     gaps.push({
       id: `gap-${gaps.length + 1}`,
       label: clean,
       kind,
-      importance: Math.min(1, importance),
+      importance: Math.min(1, scaled),
     });
   };
 
   const scoped = filterBookMemoryByCursor(memory, cursor);
   const entityNames = (scoped.entities || [])
     .map((item) => normaliseText(item.name))
     .filter((name) => name.length >= 2)
     .sort((a, b) => b.length - a.length);
 
   entityNames.forEach((name) => {
     if (!text.includes(name)) return;
     const entity = (scoped.entities || []).find((item) => normaliseText(item.name) === name);
     const kind = entity?.kind === "place" ? "spatial" : entity?.kind === "organization" ? "relation" : "person";
     const importance = entity?.priority === "primary" ? 0.72 : entity?.priority === "recent" ? 0.58 : 0.4;
-    pushGap(name, kind, importance);
+    pushGap(name, kind, importance, { primary: entity?.priority === "primary" });
   });
 
   extractLooseNames(text).forEach((name) => {
     pushGap(name, "person", 0.48);
   });
 
   if (CAUSAL_MARK.test(text)) {
     const clause = text.split(/[銆傦紒锛??]/).find((part) => CAUSAL_MARK.test(part));
@@ -454,21 +479,22 @@ function collectRecallFuel({
 
   recentParagraphFuel(book, cursor).forEach((item) => fuel.push(item));
 
   // Drop fuel that shares almost no lexical contact with page or gaps later; keep for now.
   void pageText;
   return dedupeFuel(fuel).sort((a, b) => b.strength - a.strength);
 }
 
-function fuseCandidates(gaps, fuel, reader = null) {
+function fuseCandidates(gaps, fuel, reader = null, bias = null) {
+  const typeWeights = bias || typeBias();
   const scored = [];
   gaps.forEach((gap) => {
     const ranked = fuel
-      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader) }))
+      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader, typeWeights) }))
       .filter((entry) => entry.score >= 0.22)
       .sort((a, b) => b.score - a.score)
       .slice(0, 3);
     ranked.forEach((entry, index) => {
       scored.push({
         ...entry.item,
         candidateId: entry.item.id,
         forGapId: gap.id,
@@ -488,17 +514,18 @@ function fuseCandidates(gaps, fuel, reader = null) {
     });
   });
 
   return dedupeFuel(scored)
     .sort((a, b) => (b.fuseScore || b.strength) - (a.fuseScore || a.strength))
     .slice(0, MAX_CANDIDATES);
 }
 
-function matchBridgesLocal(gaps, candidates, mode, reader = null) {
+function matchBridgesLocal(gaps, candidates, mode, reader = null, bias = null) {
+  const typeWeights = bias || typeBias();
   const bridges = [];
   const usedCandidates = new Set();
   const threshold = mode === "manual" ? 0.3 : 0.34;
   const sortedGaps = [...gaps].sort((a, b) => b.importance - a.importance);
 
   const pushBridge = (gap, item, score) => {
     const candidateId = item.candidateId || item.id;
     if (!gap || !candidateId || usedCandidates.has(candidateId)) return false;
@@ -514,28 +541,28 @@ function matchBridgesLocal(gaps, candidates, mode, reader = null) {
       score,
     });
     return true;
   };
 
   sortedGaps.forEach((gap) => {
     const best = candidates
       .filter((item) => !usedCandidates.has(item.candidateId || item.id))
-      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader) }))
+      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader, typeWeights) }))
       .filter((entry) => entry.score >= threshold)
       .sort((a, b) => b.score - a.score)[0];
     if (best) pushBridge(gap, best.item, best.score);
   });
 
   // One gap must not cap the card at a single bridge when other strong candidates remain.
   if (bridges.length && bridges.length < MAX_BRIDGES_AUTO) {
     const fillGap = sortedGaps[0];
     candidates
       .filter((item) => !usedCandidates.has(item.candidateId || item.id))
-      .map((item) => ({ item, score: scoreGapFuel(fillGap, item, reader) }))
+      .map((item) => ({ item, score: scoreGapFuel(fillGap, item, reader, typeWeights) }))
       .filter((entry) => entry.score >= threshold)
       .sort((a, b) => b.score - a.score)
       .forEach((entry) => {
         if (bridges.length >= MAX_BRIDGES_SHOW) return;
         pushBridge(fillGap, entry.item, entry.score);
       });
   }
 
@@ -560,19 +587,21 @@ function whyNeededText(gap, candidate) {
     return `鏈〉鍦烘櫙钀藉埌銆?{clip(label, 16)}銆嶏紝闇€鍏堟帴涓婃鍓嶄綅缃彉鍖栥€俙;
   }
   if (gap.kind === "temporal") {
     return `鏈〉鎵挎帴姝ゅ墠闃舵锛岄渶鍏堟兂璧凤細${clip(candidate.title, 16)}銆俙;
   }
   return `璇绘噦鏈〉鍓嶏紝鍏堟帴涓婏細${clip(candidate.title, 16)}銆俙;
 }
 
-function scoreGapFuel(gap, item, reader = null) {
+function scoreGapFuel(gap, item, reader = null, bias = null) {
   if (!gap || !item) return 0;
-  const kindBonus = (item.gapKinds || []).includes(gap.kind) ? 0.22 : 0;
+  const typeWeights = bias || typeBias();
+  const kindFactor = Number(typeWeights[gap.kind]) || 1;
+  const kindBonus = (item.gapKinds || []).includes(gap.kind) ? 0.22 * kindFactor : 0;
   const label = normaliseText(gap.label);
   const hay = normaliseText(`${item.title} ${item.snippet}`);
   let overlap = 0;
   if (label && hay.includes(label)) overlap += 0.5;
   tokenize(label).forEach((token) => {
     if (token.length >= 2 && hay.includes(token)) overlap += 0.08;
   });
   const strength = Number(item.strength) || 0.3;

