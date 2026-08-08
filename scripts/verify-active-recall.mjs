import {
  buildSituationBridgePlan,
  filterSituationGapsByFocus,
  prepareSituationBridgeShortlist,
} from "../src/situationBridge.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const focusedGaps = filterSituationGapsByFocus([
  { id: "summer", label: "夏英杰", context: "夏英杰下令继续北上", kind: "person" },
  { id: "professor", label: "张教授", context: "张教授的旧论文被顺带提到", kind: "person" },
  { id: "cause", label: "因此夏英杰下令继续北上", context: "因此夏英杰下令继续北上", kind: "causal" },
], "夏英杰");
assert(focusedGaps.some((item) => item.id === "summer"), "exact selected entity should remain eligible");
assert(focusedGaps.some((item) => item.id === "cause"), "causal clause containing the selection should remain eligible");
assert(!focusedGaps.some((item) => item.id === "professor"), "unrelated same-page entity must be rejected");

const book = {
  id: "active-recall-fixture",
  bookType: "历史纪实 / 传记",
  chapters: [
    {
      title: "第一章",
      paragraphs: [
        "夏英杰命令卫队封锁渡口，确保部队能够安全撤离。",
        "张教授曾发表一篇与本次行动无关的旧论文。",
      ],
    },
    {
      title: "第二章",
      paragraphs: [
        "因此夏英杰下令继续北上。张教授的旧论文同时被提到，但与行动无关。",
      ],
    },
  ],
};

const bookMemory = {
  version: 2,
  entities: [
    { id: "summer", kind: "person", name: "夏英杰", summary: "命令卫队封锁渡口并组织撤离", priority: "primary", evidence: { chapterIndex: 0, paragraphIndex: 0, quote: "夏英杰命令卫队封锁渡口" } },
    { id: "professor", kind: "person", name: "张教授", summary: "发表与行动无关的旧论文", priority: "primary", evidence: { chapterIndex: 0, paragraphIndex: 1, quote: "与本次行动无关的旧论文" } },
    { id: "future", kind: "person", name: "未来人物", summary: "当前段落之后才出现", priority: "primary", evidence: { chapterIndex: 1, paragraphIndex: 0, quote: "未来人物" } },
  ],
  timeline: [],
  topics: [],
  arguments: [],
  episodic: [
    { id: "crossing", kind: "event", name: "封锁渡口", summary: "封锁渡口保障部队撤离", priority: "primary", evidence: { chapterIndex: 0, paragraphIndex: 0, quote: "封锁渡口，确保部队能够安全撤离" } },
  ],
  relationships: [],
};

const cursor = { chapterIndex: 1, pageIndex: 0, paragraphIndex: 0 };
const currentPageText = book.chapters[1].paragraphs[0];
const focused = prepareSituationBridgeShortlist({
  book,
  bookMemory,
  cursor,
  currentPageText,
  focusText: "夏英杰",
  mode: "manual",
});
assert(!focused.suppressed, `selected-person recall should resolve, got ${focused.reason}`);
assert(focused.gaps.every((gap) => !gap.label.includes("张教授")), "focused shortlist must not keep unrelated same-page gaps");
assert(focused.candidates.every((item) => item.title !== "张教授"), "unrelated high-priority Memory must not become a candidate");
assert(focused.candidates.every((item) => item.title !== "未来人物"), "current/future evidence must remain excluded");

const causal = buildSituationBridgePlan({
  book,
  bookMemory,
  cursor,
  currentPageText,
  focusText: "因此夏英杰下令继续北上",
  mode: "manual",
});
assert(!causal.suppressed, `selected causal clause should recall linked prior context, got ${causal.reason}`);
assert(causal.bridges.some((item) => item.title === "夏英杰" || item.title === "封锁渡口"), "causal recall should use a linked prior anchor");

const firstPage = buildSituationBridgePlan({
  book,
  bookMemory,
  cursor: { chapterIndex: 0, pageIndex: 0, paragraphIndex: 0 },
  currentPageText: book.chapters[0].paragraphs[0],
  focusText: "夏英杰",
  mode: "manual",
});
assert(firstPage.suppressed && firstPage.reason === "low-context", "first-page selection recall must stay suppressed");

const generic = prepareSituationBridgeShortlist({
  book,
  bookMemory,
  cursor,
  currentPageText,
  mode: "manual",
});
assert(!generic.suppressed, "topbar current-page recall should remain unchanged without focusText");
assert(generic.gaps.some((gap) => gap.label.includes("张教授")), "generic page recall should still consider the whole page");

console.log("contextual active-recall verification passed");
