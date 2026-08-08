import {
  markReaderBridgeFeedback,
  recoveryBridgeFeedbackKeys,
} from "../src/memoryModels.js";
import {
  adjudicatorPayloadFromShortlist,
  applySituationBridgeJudgement,
  buildSituationBridgePlan,
  dedupeSituationBridges,
  prepareSituationBridgeShortlist,
  situationBridgeToRecoveryCard,
  shouldOfferSituationBridge,
} from "../src/situationBridge.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const book = {
  id: "fixture",
  chapters: [
    {
      id: "c0",
      title: "第一章",
      paragraphs: [
        "夏英杰决定率部先行转移，并命令卫队封锁渡口。",
        "此后数日，部队在山谷中休整，等待会合信号。",
        "雨停之后，斥候回报对岸已无追兵。",
      ],
    },
    {
      id: "c1",
      title: "第二章",
      paragraphs: [
        "因此夏英杰下令继续北上，渡口一事仍压在众人心头。",
        "山谷里只剩风声，并无新的命令。",
      ],
    },
  ],
};

const bookMemory = {
  version: 2,
  entities: [
    {
      id: "e1",
      kind: "person",
      name: "夏英杰",
      summary: "率部转移并封锁渡口的主事者",
      priority: "primary",
      evidence: { chapterIndex: 0, paragraphIndex: 0, quote: "夏英杰决定率部先行转移" },
    },
  ],
  episodic: [
    {
      id: "ep1",
      kind: "event",
      name: "封锁渡口",
      summary: "夏英杰命令卫队封锁渡口以便转移",
      priority: "primary",
      evidence: { chapterIndex: 0, paragraphIndex: 0, quote: "命令卫队封锁渡口" },
    },
  ],
  timeline: [],
  topics: [],
  arguments: [],
  relationships: [],
};

const dependent = buildSituationBridgePlan({
  book,
  bookMemory,
  cursor: { chapterIndex: 1, pageIndex: 0, paragraphIndex: 0 },
  currentPageText: book.chapters[1].paragraphs[0],
  mode: "manual",
  minAbsenceMs: 0,
});
assert(!dependent.suppressed, `expected bridges, got ${dependent.reason}`);
assert(dependent.bridges.length >= 2, "expected >=2 bridges");
assert(dependent.bridges.every((item) => item.whyNeeded && item.evidence), "bridges need whyNeeded+evidence");
assert(dependent.bridges.every((item) => item.linkReason), "local bridges need a pair-link reason");
const card = situationBridgeToRecoveryCard(dependent);
assert(card?.bridges?.length >= 2, "card mapping failed");

const duplicateTitleBridges = dedupeSituationBridges([
  { id: "legacy-person", candidateId: "entity:1", title: "肖亚文", score: 0.4 },
  { id: "current-person", candidateId: "entity:99", title: " 肖 亚 文 ", score: 0.8 },
  { id: "company", candidateId: "organization:1", title: "索林特博彩公司", score: 0.5 },
]);
assert(duplicateTitleBridges.length === 2, "same displayed anchor must use one recall slot");
assert(duplicateTitleBridges[0].id === "current-person", "stronger duplicate anchor should win");

const scenic = buildSituationBridgePlan({
  book,
  bookMemory,
  cursor: { chapterIndex: 1, pageIndex: 1, paragraphIndex: 1 },
  currentPageText: book.chapters[1].paragraphs[1],
  mode: "manual",
  minAbsenceMs: 0,
});
assert(scenic.suppressed, "scenic page should suppress");
assert(
  ["page-not-dependent", "low-importance-gaps", "no-bridges", "low-confidence"].includes(scenic.reason),
  `unexpected scenic reason ${scenic.reason}`,
);

const offer = shouldOfferSituationBridge({
  gaps: [{ id: "g1", label: "夏英杰", context: "夏英杰下令北上", kind: "person", importance: 0.7 }],
  fuel: [{
    id: "f1",
    title: "夏英杰",
    snippet: "率部转移",
    strength: 0.7,
    gapKinds: ["person"],
    evidence: { quote: "夏英杰率部转移" },
  }],
  mode: "auto",
});
assert(offer.ok, "offer should pass with strong gap/fuel");

const shortlist = prepareSituationBridgeShortlist({
  book,
  bookMemory,
  cursor: { chapterIndex: 1, pageIndex: 0, paragraphIndex: 0 },
  currentPageText: book.chapters[1].paragraphs[0],
  mode: "manual",
  minAbsenceMs: 0,
});
assert(!shortlist.suppressed, "shortlist should be ready for adjudicator");
assert(shortlist.candidates.length >= 2, "need candidates for adjudicator");
const payload = adjudicatorPayloadFromShortlist(shortlist);
assert(payload.gaps.length <= 6 && payload.candidates.length <= 12, "budget caps");
assert(payload.candidates.every((item) => item.snippet.length <= 80), "snippet budget");

const fakeGap = shortlist.gaps[0];
const fakeA = shortlist.candidates[0];
const fakeB = shortlist.candidates[1];
const fakeAGap = shortlist.gaps.find((gap) => gap.id === fakeA.forGapId) || fakeGap;
const fakeBGap = shortlist.gaps.find((gap) => gap.id === fakeB.forGapId) || fakeGap;
const judged = applySituationBridgeJudgement(shortlist, {
  bridges: [
    {
      gapId: fakeAGap.id,
      candidateId: fakeA.id,
      title: fakeA.title,
      whyNeeded: "本页还在沿用此事",
      confidence: "high",
    },
    {
      gapId: fakeBGap.id,
      candidateId: fakeB.id,
      title: fakeB.title,
      whyNeeded: "接上前文才读得通",
      confidence: "high",
    },
  ],
  question: {
    gapId: fakeAGap.id,
    candidateId: fakeA.id,
    prompt: "当时为何封锁渡口？",
    hint: "想一想转移",
    answer: "为率部转移",
  },
});
assert(!judged.suppressed, "judged plan should show");
assert(judged.source === "adjudicator", "source adjudicator");
assert(
  judged.bridges.every((item) => shortlist.candidates.some((c) => c.id === item.candidateId)),
  "ids must match shortlist",
);

const rejected = applySituationBridgeJudgement(shortlist, {
  bridges: [
    {
      gapId: "invented-gap",
      candidateId: "invented-cand",
      title: "伪造",
      whyNeeded: "不应出现",
      confidence: "high",
    },
  ],
});
assert(
  rejected.source === "local" || rejected.suppressed
    || rejected.bridges.every((item) => item.candidateId !== "invented-cand"),
  "invented ids rejected",
);

const wrongGap = shortlist.gaps.find((gap) => gap.id !== fakeA.forGapId);
if (wrongGap) {
  const mismatched = applySituationBridgeJudgement(shortlist, {
    bridges: [{
      gapId: wrongGap.id,
      candidateId: fakeA.id,
      whyNeeded: "合法 ID 不能跨缺口错配",
      confidence: "high",
    }],
  });
  assert(
    mismatched.suppressed || mismatched.bridges.every(
      (item) => item.candidateId !== fakeA.id || item.gapId !== wrongGap.id,
    ),
    "candidate must not be adjudicated onto an unauthorized gap",
  );
}

const strictPriorBook = {
  id: "strict-prior",
  chapters: [
    { id: "p0", title: "前章", paragraphs: ["窗外落着安静的雨。"] },
    { id: "p1", title: "当前章", paragraphs: ["因为封锁渡口的决定没有执行，后续计划被迫全部改变。"] },
  ],
};
const strictPriorOptions = {
  book: strictPriorBook,
  bookMemory: { version: 2, entities: [], episodic: [], timeline: [], topics: [], arguments: [], relationships: [] },
  cursor: { chapterIndex: 1, pageIndex: 0, paragraphIndex: 0 },
  currentPageText: strictPriorBook.chapters[1].paragraphs[0],
  mode: "manual",
  minAbsenceMs: 0,
};
const noCurrentEcho = buildSituationBridgePlan(strictPriorOptions);
assert(noCurrentEcho.suppressed, "current paragraph must not become prior-context fuel");
const noUnpositionedAsset = buildSituationBridgePlan({
  ...strictPriorOptions,
  notes: [{ id: "legacy-note", selection: "封锁渡口", content: "封锁渡口改变计划" }],
});
assert(noUnpositionedAsset.suppressed, "unpositioned reader assets must not be treated as prior evidence");

// Reader Memory bridge feedback (Task 2)
const remembered = markReaderBridgeFeedback(null, { action: "remembered", keys: ["cand:a", "cand:b"] });
assert(remembered.rememberedKeys.includes("cand:a") && remembered.rememberedKeys.includes("cand:b"), "remembered keys persist");
const missed = markReaderBridgeFeedback(remembered, { action: "missed", keys: ["cand:c"] });
assert(missed.missedKeys.includes("cand:c") && missed.rememberedKeys.includes("cand:a"), "missed merges without clearing remembered");
const ignored = markReaderBridgeFeedback(missed, { action: "shown", keys: ["cand:d"] });
assert(!ignored.rememberedKeys.includes("cand:d") && !ignored.missedKeys.includes("cand:d"), "non-feedback actions skip key updates");
const knew = markReaderBridgeFeedback(null, { action: "knew", keys: ["cand:e"] });
assert(knew.rememberedKeys.includes("cand:e"), "knew maps to remembered");

const feedbackKeys = recoveryBridgeFeedbackKeys({
  bridges: [{ candidateId: "cand:bridge" }],
  keyPoints: [{ memoryKey: "kp:1" }],
  question: { memoryKey: "q:should-not-feedback" },
  prerequisites: [{ memoryKey: "prereq:skip" }],
  evidence: [{ memoryKey: "ev:skip" }],
});
assert(feedbackKeys.includes("cand:bridge") && feedbackKeys.includes("kp:1"), "feedback keys from bridges/keyPoints");
assert(!feedbackKeys.includes("q:should-not-feedback"), "question memoryKey excluded from feedback keys");
assert(!feedbackKeys.includes("prereq:skip") && !feedbackKeys.includes("ev:skip"), "prereq/evidence excluded from feedback keys");

console.log("situation-bridge smoke ok", {
  bridges: dependent.bridges.map((item) => item.title),
  scenicReason: scenic.reason,
  judgedSource: judged.source,
  readerFeedback: { remembered: remembered.rememberedKeys.length, missed: missed.missedKeys.length },
});
