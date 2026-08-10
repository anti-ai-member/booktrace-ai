import assert from "node:assert/strict";
import { buildLocalContextView } from "../src/localContextView.js";

const ev = (chapterIndex, paragraphIndex, quote) => ({ chapterIndex, paragraphIndex, quote });
const cursor = { chapterIndex: 2, paragraphIndex: 5, pageIndex: 1 };

const relationshipMemory = {
  version: 3,
  entities: [
    { kind: "person", name: "刘备", summary: "蜀汉主公", priority: "primary", evidence: ev(0, 1, "刘备率军抵达。") },
    { kind: "person", name: "关羽", summary: "刘备部将", priority: "primary", evidence: ev(0, 2, "关羽随军同行。") },
    { kind: "person", name: "张飞", summary: "刘备部将", priority: "secondary", evidence: ev(0, 3, "张飞随后赶到。") },
  ],
  relationships: [
    { source: "刘备", target: "关羽", relation: "结义", importance: "primary", evidence: ev(0, 4, "刘备与关羽结义。") },
    { source: "刘备", target: "张飞", relation: "结义", importance: "primary", evidence: ev(0, 5, "刘备与张飞结义。") },
    { source: "关羽", target: "张飞", relation: "同袍", evidence: ev(0, 6, "关羽与张飞互为同袍。") },
  ],
  topics: [], timeline: [], arguments: [], episodic: [],
};
const relationView = buildLocalContextView({ bookMemory: relationshipMemory, cursor, focusText: "刘备是谁？" });
assert.equal(relationView?.mode, "relationship");
assert.equal(relationView?.title, "上下文关系");
assert(relationView.edges.length === 2, "only one-hop edges around the selected person are included");
assert(relationView.edges.every((edge) => edge.sourceName === "刘备" || edge.targetName === "刘备"));
assert.equal(buildLocalContextView({ bookMemory: relationshipMemory, cursor, focusText: "曹操" }), null, "unrelated selection suppresses the view");
assert.equal(buildLocalContextView({ bookMemory: relationshipMemory, cursor, focusText: "刘" }), null, "single-character fragments never match a longer entity");
const multiEntityView = buildLocalContextView({ bookMemory: relationshipMemory, cursor, focusText: "刘备与关羽如何相识" });
assert.equal(multiEntityView.focusLabel, "刘备", "multi-entity selections resolve to one primary focus");
assert(multiEntityView.edges.every((edge) => edge.sourceName === "刘备" || edge.targetName === "刘备"));

const crowdedEntities = Array.from({ length: 12 }, (_, index) => ({
  kind: "person",
  name: `同伴${index + 1}`,
  evidence: ev(0, index + 2, `刘备与同伴${index + 1}同行。`),
}));
const crowdedView = buildLocalContextView({
  bookMemory: {
    version: 3,
    entities: [relationshipMemory.entities[0], ...crowdedEntities],
    relationships: crowdedEntities.map((item, index) => ({
      source: "刘备",
      target: item.name,
      relation: "同行",
      evidence: ev(0, index + 20, `刘备与${item.name}同行。`),
    })),
  },
  cursor: { chapterIndex: 0, paragraphIndex: 50 },
  focusText: "刘备",
});
assert(crowdedView.nodes.length <= 7, "node count remains bounded");
assert(crowdedView.edges.length <= 8, "edge count remains bounded");

const conceptMemory = {
  version: 3,
  entities: [], relationships: [], timeline: [], arguments: [], episodic: [],
  topics: [
    { kind: "concept", name: "Attention", summary: "计算相关性权重", priority: "primary", evidence: ev(0, 1, "Attention 计算相关性权重。") },
    { kind: "mechanism", name: "KV Cache", summary: "复用历史键值", priority: "primary", prerequisites: ["Attention"], evidence: ev(1, 2, "KV Cache 复用历史键值。") },
    { kind: "concept", name: "未来概念", summary: "尚未读到", relatedTo: ["KV Cache"], evidence: ev(3, 0, "未来概念尚未读到。") },
  ],
};
const conceptView = buildLocalContextView({ bookMemory: conceptMemory, cursor, focusText: "KV Cache 为什么依赖 Attention" });
assert.equal(conceptView?.mode, "concept");
assert(conceptView.edges.some((edge) => edge.sourceName === "Attention" && edge.targetName === "KV Cache" && edge.relation === "前置于"));
assert(!conceptView.nodes.some((node) => node.name === "未来概念"), "future nodes are excluded");

const futureRelationshipMemory = {
  ...relationshipMemory,
  relationships: [{ source: "刘备", target: "关羽", relation: "未来会合", evidence: ev(4, 1, "刘备与关羽后来会合。") }],
};
assert.equal(buildLocalContextView({ bookMemory: futureRelationshipMemory, cursor, focusText: "刘备" }), null, "future relationship evidence is excluded");

const causalMemory = {
  version: 3,
  entities: [], relationships: [], topics: [], arguments: [], episodic: [],
  timeline: [
    { name: "封锁渡口", summary: "渡口被封锁", priority: "primary", causes: ["改变行军路线"], evidence: ev(0, 2, "敌军封锁了渡口。") },
    { name: "改变行军路线", summary: "部队改走山路", priority: "primary", causedBy: ["封锁渡口"], evidence: ev(0, 3, "部队因此改走山路。") },
  ],
};
const causalView = buildLocalContextView({ bookMemory: causalMemory, cursor, focusText: "改变行军路线" });
assert.equal(causalView?.mode, "causal");
assert(causalView.edges.some((edge) => edge.relation === "导致"));

const argumentMemory = {
  version: 3,
  entities: [], relationships: [], topics: [], timeline: [], episodic: [],
  arguments: [
    { kind: "reason", name: "观察结果", summary: "实验中反复出现", supports: ["核心结论"], evidence: ev(0, 1, "多次实验得到相同观察结果。") },
    { kind: "conclusion", name: "核心结论", summary: "机制成立", priority: "primary", evidence: ev(0, 2, "由此可见该机制成立。") },
  ],
};
const argumentView = buildLocalContextView({ bookMemory: argumentMemory, cursor, focusText: "核心结论" });
assert.equal(argumentView?.mode, "argument");
assert(argumentView.edges.some((edge) => edge.relation === "支持"));
assert(argumentView.edges.every((edge) => edge.evidence?.quote?.length >= 4), "every edge remains evidence-backed");
assert(argumentView.edges.every((edge) => Number.isInteger(edge.evidence.chapterIndex) && Number.isInteger(edge.evidence.paragraphIndex)), "every edge exposes a source jump anchor");

const orphanMemory = {
  version: 3,
  entities: [], relationships: [], timeline: [], arguments: [], episodic: [],
  topics: [{ kind: "concept", name: "孤立概念", summary: "没有显式边", evidence: ev(0, 1, "孤立概念没有显式关联。") }],
};
assert.equal(buildLocalContextView({ bookMemory: orphanMemory, cursor, focusText: "孤立概念" }), null, "orphan nodes do not invent edges");

console.log("local context view verification passed", {
  relationshipNodes: relationView.nodes.length,
  conceptEdges: conceptView.edges.length,
  causalEdges: causalView.edges.length,
  argumentEdges: argumentView.edges.length,
});
