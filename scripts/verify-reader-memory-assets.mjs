import assert from "node:assert/strict";
import { consolidateReaderMemoryAssets } from "../src/memoryModels.js";
import { prepareSituationBridgeShortlist } from "../src/situationBridge.js";

const cursor = { chapterIndex: 1, pageIndex: 2, paragraphIndex: 3 };
const reader = {
  rememberedKeys: ["mem:known"],
  missedKeys: ["mem:fragile"],
  noteRefs: ["note:deleted"],
  explainRefs: ["explain:deleted"],
};
const notes = [
  { id: "prior-note", chapterIndex: 0, paragraphIndex: 1, selection: "认知负荷", content: "工作记忆容量有限", createdAt: 100 },
  { id: "current-note", chapterIndex: 1, paragraphIndex: 3, selection: "当前段", content: "不能成为前文", createdAt: 400 },
  { id: "future-note", chapterIndex: 2, paragraphIndex: 0, selection: "未来", content: "不能剧透", createdAt: 500 },
  { id: "legacy-note", selection: "没有位置", content: "不能进入快照", createdAt: 600 },
  { id: "null-position", chapterIndex: 1, paragraphIndex: null, pageIndex: null, selection: "认知负荷", content: "相关但无位置，也不能进入快照或候选。", createdAt: 650 },
  { id: "null-chapter", chapterIndex: null, paragraphIndex: 1, selection: "认知负荷", content: "缺少章节，也不能进入快照或候选。", createdAt: 660 },
  { id: "prior-note", chapterIndex: 0, paragraphIndex: 1, selection: "重复", content: "同一引用去重", createdAt: 200 },
];
const bookmarks = [
  { id: "prior-bookmark", chapterIndex: 1, pageIndex: 1, createdAt: 250 },
  { id: "current-bookmark", chapterIndex: 1, pageIndex: 2, createdAt: 350 },
];
const explains = [
  { id: "prior-explain", chapterIndex: 0, paragraphIndex: 2, selection: "认知负荷", mode: "concept", answer: "任务会占用有限工作记忆。", createdAt: 300 },
  { id: "future-explain", chapterIndex: 1, paragraphIndex: 4, selection: "未来解释", mode: "concept", answer: "不能进入。", createdAt: 700 },
];

const snapshot = consolidateReaderMemoryAssets(reader, { notes, bookmarks, explains, cursor });
assert.deepEqual(snapshot.noteRefs, ["note:prior-note"], "notes are read-bounded and deduplicated");
assert.deepEqual(snapshot.bookmarkRefs, ["bookmark:prior-bookmark"], "bookmarks use page fallback and exclude current page");
assert.deepEqual(snapshot.explainRefs, ["explain:prior-explain"], "explains are read-bounded");
assert.equal(snapshot.assetCounts.notes, 1, "counts describe deduplicated source references");
assert.equal(snapshot.assetCounts.bookmarks, 1);
assert.equal(snapshot.assetCounts.explains, 1);
assert.equal(snapshot.latestAssetAt, 300, "latest activity ignores current/future assets");
assert(snapshot.rememberedKeys.includes("mem:known") && snapshot.missedKeys.includes("mem:fragile"), "recovery feedback survives consolidation");
assert(!snapshot.noteRefs.includes("note:deleted") && !snapshot.explainRefs.includes("explain:deleted"), "deleted source refs disappear on rebuild");

const book = {
  id: "reader-memory-assets",
  bookType: "科普 / 奇幻",
  chapters: [
    { title: "容量限制", paragraphs: ["工作记忆容量有限。", "认知负荷过高会挤占处理空间。", "任务会占用有限工作记忆。"] },
    { title: "学习设计", paragraphs: ["材料先介绍例子。", "随后给出练习。", "前面保持平静。", "因此认知负荷会持续占用有限工作记忆，并直接影响这一页的学习效果。"] },
  ],
};
const bookMemory = {
  version: 3,
  entities: [], timeline: [], arguments: [], episodic: [], relationships: [],
  topics: [{
    id: "topic-load",
    kind: "concept",
    name: "认知负荷",
    summary: "任务会占用有限工作记忆。",
    priority: "primary",
    evidence: { chapterIndex: 0, paragraphIndex: 2, quote: "任务会占用有限工作记忆。" },
  }],
  reader,
};
const plan = prepareSituationBridgeShortlist({
  book,
  bookMemory,
  cursor,
  currentPageText: book.chapters[1].paragraphs[3],
  notes: [...notes, { id: "unrelated", chapterIndex: 0, paragraphIndex: 0, selection: "海岸地貌", content: "海浪侵蚀形成海蚀崖。", createdAt: 50 }],
  bookmarks,
  explains,
  mode: "manual",
});
assert.equal(plan.suppressed, false, "a linked prior concept produces a recovery plan");
assert(plan.candidates.some((item) => item.id === "note:prior-note" || item.id === "explain:prior-explain"), "reader traces are reusable candidates");
assert(!plan.candidates.some((item) => item.id === "note:unrelated"), "unrelated reader trace cannot bypass page-gap linkage");
assert(!plan.candidates.some((item) => item.id === "note:current-note" || item.id === "note:future-note"), "current and future traces remain excluded");
assert(!plan.candidates.some((item) => item.id === "note:null-position"), "explicit null positions cannot enter the candidate pool");
assert(!plan.candidates.some((item) => item.id === "note:null-chapter"), "an explicit null chapter cannot become chapter zero");

console.log("reader-memory asset verification passed", {
  refs: snapshot.noteRefs.length + snapshot.bookmarkRefs.length + snapshot.explainRefs.length,
  candidates: plan.candidates.map((item) => item.id),
});
