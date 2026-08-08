import { buildTypeAdaptiveMemoryAid, resolveMemoryAidProfile } from "../src/memoryAid.js";
import { mergeBookMemory } from "../src/memoryModels.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const evidence = (chapterIndex, paragraphIndex, quote) => ({ chapterIndex, paragraphIndex, quote });
const base = { version: 2, entities: [], timeline: [], topics: [], arguments: [], episodic: [], relationships: [] };

assert(resolveMemoryAidProfile("历史纪实 / 传记").id === "timeline", "canonical history category should choose timeline");

const history = buildTypeAdaptiveMemoryAid({
  bookType: "历史纪实 / 军事",
  cursor: { chapterIndex: 1, paragraphIndex: 1 },
  currentPageText: "渡过乌江后，部队继续西进。",
  bridges: [{ title: "突破乌江", whyNeeded: "这是继续西进的前提" }],
  bookMemory: {
    ...base,
    timeline: [
      { id: "h1", kind: "event", name: "封锁渡口", summary: "先遣部队封锁渡口，为渡江创造条件", priority: "recent", causes: ["突破乌江"], evidence: evidence(0, 1, "先遣部队封锁渡口") },
      { id: "h2", kind: "event", name: "突破乌江", summary: "主力突破乌江并打开西进通道", priority: "primary", causedBy: ["封锁渡口"], evidence: evidence(0, 3, "主力突破乌江") },
      { id: "noise", kind: "event", name: "某学者出生", summary: "与本次行军无关的履历", priority: "primary", evidence: evidence(0, 0, "某学者出生") },
    ],
  },
});
assert(history?.kind === "timeline", "history should choose timeline");
assert(history.items.length === 2, "history should keep the connected pair only");
assert(!history.items.some((item) => item.id === "noise"), "history should reject unrelated primary noise");

const science = buildTypeAdaptiveMemoryAid({
  bookType: "科普 / 技术",
  cursor: { chapterIndex: 2, paragraphIndex: 2 },
  currentPageText: "KV Cache 为什么能减少重复计算？",
  bookMemory: {
    ...base,
    topics: [
      { id: "s1", kind: "concept", name: "Attention", summary: "根据查询与键值计算注意力输出", priority: "primary", relatedTo: ["KV Cache"], evidence: evidence(1, 1, "Attention 使用查询、键和值") },
      { id: "s2", kind: "mechanism", name: "KV Cache", summary: "缓存历史键值以避免自回归生成时重复计算", priority: "primary", prerequisites: ["Attention"], evidence: evidence(2, 0, "缓存此前 token 的键和值") },
    ],
  },
});
assert(science?.kind === "concept", "science should choose concept chain");
assert(science.items.some((item) => item.title === "Attention"), "concept chain should include prerequisite");

const argument = buildTypeAdaptiveMemoryAid({
  bookType: "哲学 / 社会科学",
  cursor: { chapterIndex: 1, paragraphIndex: 2 },
  currentPageText: "因此作者得出制度塑造选择的结论。",
  bookMemory: {
    ...base,
    arguments: [
      { id: "a1", kind: "claim", name: "制度约束选择", summary: "制度会改变个体可采用的行动范围", priority: "primary", supports: ["制度塑造选择"], evidence: evidence(0, 1, "制度限定行动范围") },
      { id: "a2", kind: "reason", name: "激励改变行为", summary: "不同激励使同一主体作出不同选择", priority: "primary", supports: ["制度塑造选择"], evidence: evidence(0, 3, "激励结构改变行为") },
      { id: "a3", kind: "conclusion", name: "制度塑造选择", summary: "作者据此前提得出制度塑造选择的结论", priority: "primary", respondsTo: ["制度约束选择", "激励改变行为"], evidence: evidence(1, 0, "制度塑造选择") },
    ],
  },
});
assert(argument?.kind === "argument", "social science should choose argument chain");
assert(argument.items.length >= 2, "argument chain should retain connected roles");

const fiction = buildTypeAdaptiveMemoryAid({
  bookType: "小说 / 文学",
  cursor: { chapterIndex: 2, paragraphIndex: 1 },
  currentPageText: "罗辑再次见到史强时，想起叶文洁的嘱托。",
  bookMemory: {
    ...base,
    relationships: [
      { id: "r1", source: "叶文洁", target: "罗辑", relation: "托付线索", importance: "primary", evidence: evidence(0, 2, "叶文洁向罗辑托付线索") },
      { id: "r2", source: "罗辑", target: "史强", relation: "受保护", importance: "primary", evidence: evidence(1, 4, "史强负责保护罗辑") },
      { id: "r3", source: "无关甲", target: "无关乙", relation: "相识", importance: "primary", evidence: evidence(0, 0, "两人相识") },
    ],
  },
});
assert(fiction?.kind === "relationship", "fiction should choose connected relationships");
assert(fiction.items.length === 2, "fiction should exclude disconnected relationship");

const futureOnly = buildTypeAdaptiveMemoryAid({
  bookType: "科普 / 技术",
  cursor: { chapterIndex: 0, paragraphIndex: 1 },
  currentPageText: "理解缓存机制。",
  bookMemory: {
    ...base,
    topics: [
      { id: "f1", kind: "concept", name: "缓存", summary: "当前段才出现", priority: "primary", relatedTo: ["命中率"], evidence: evidence(0, 1, "缓存") },
      { id: "f2", kind: "concept", name: "命中率", summary: "未来段才解释", priority: "primary", relatedTo: ["缓存"], evidence: evidence(0, 2, "命中率") },
    ],
  },
});
assert(futureOnly === null, "current/future evidence must not create an aid");

const insufficient = buildTypeAdaptiveMemoryAid({
  bookType: "历史纪实",
  cursor: { chapterIndex: 1, paragraphIndex: 1 },
  currentPageText: "部队继续前进。",
  bookMemory: { ...base, timeline: [{ id: "one", kind: "event", name: "继续前进", summary: "部队继续前进", priority: "primary", evidence: evidence(0, 1, "部队继续前进") }] },
});
assert(insufficient === null, "single item must not become a pseudo-chain");

const merged = mergeBookMemory(
  { ...base, topics: [{ id: "merge-topic", kind: "concept", name: "Attention", summary: "注意力机制", prerequisites: ["向量表示"], relatedTo: ["KV Cache"], evidence: evidence(0, 1, "注意力机制") }] },
  { ...base, topics: [{ id: "merge-topic", kind: "concept", name: "Attention", summary: "查询键值关系", prerequisites: ["查询与键"], relatedTo: ["Transformer"], evidence: evidence(0, 2, "查询键值关系") }] },
  { chapterIndex: 0, paragraphIndex: 2 },
);
assert(merged.topics[0].prerequisites.includes("向量表示") && merged.topics[0].prerequisites.includes("查询与键"), "incremental merge should retain concept prerequisites");
assert(merged.topics[0].relatedTo.includes("KV Cache") && merged.topics[0].relatedTo.includes("Transformer"), "incremental merge should retain concept links");

console.log("memory-aid verification passed");
