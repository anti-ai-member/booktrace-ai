import { filterBookMemoryByCursor, normalizeBookMemory } from "./memoryModels.js";

const NOISE = /出生|生于|逝世|享年|出版|印刷|译者|版权|ISBN|目录|字数|开本|CIP|http|www\./i;
const STOP = new Set([
  "一个", "一些", "这个", "那个", "这些", "那些", "他们", "我们", "已经", "可以", "因此", "因为",
  "但是", "然而", "其中", "进行", "形成", "发生", "出现", "内容", "问题", "关系", "主要", "当前",
  "the", "and", "that", "this", "with", "from", "into", "because", "therefore",
]);
const KIND_ORDER = { claim: 0, reason: 1, evidence: 2, example: 3, objection: 4, conclusion: 5 };

export function resolveMemoryAidProfile(bookType = "") {
  const value = String(bookType || "");
  if (/哲学|社科|社会|商业|管理|经济|philosophy|social|business|econom/i.test(value)) {
    return { id: "argument", title: "论证链", titleKey: "reader.memoryAid.argument", subtitle: "从前提、理由到结论", subtitleKey: "reader.memoryAid.argumentHint" };
  }
  if (/科普|技术|教材|计算机|科学|science|technical|textbook|technology/i.test(value)) {
    return { id: "concept", title: "概念链", titleKey: "reader.memoryAid.concept", subtitle: "理解当前内容所需的概念与机制", subtitleKey: "reader.memoryAid.conceptHint" };
  }
  // The canonical taxonomy category is "历史纪实 / 传记". Resolve that
  // combined category as history before the standalone biography fallback.
  if (/历史|军事|战争|纪实|history|military|war/i.test(value)) {
    return { id: "timeline", title: "时间脉络", titleKey: "reader.memoryAid.timeline", subtitle: "当前局面之前的关键推进", subtitleKey: "reader.memoryAid.timelineHint" };
  }
  if (/小说|文学|传记|fiction|novel|literature|biograph/i.test(value)) {
    return { id: "narrative", title: "人物与情节", titleKey: "reader.memoryAid.narrative", subtitle: "影响当前段落的关系和变化", subtitleKey: "reader.memoryAid.narrativeHint" };
  }
  return { id: "general", title: "前文脉络", titleKey: "reader.memoryAid.general", subtitle: "理解当前页所需的关键联系", subtitleKey: "reader.memoryAid.generalHint" };
}

export function buildTypeAdaptiveMemoryAid({
  bookType = "",
  bookMemory = null,
  cursor = null,
  currentPageText = "",
  bridges = [],
} = {}) {
  if (!cursor || !Number.isInteger(Number(cursor.chapterIndex))) return null;
  const profile = resolveMemoryAidProfile(bookType);
  const memory = filterBookMemoryByCursor(normalizeBookMemory(bookMemory || {}), strictPriorCursor(cursor));
  const context = clean(`${currentPageText} ${(bridges || []).map((item) => `${item.title || ""} ${item.whyNeeded || ""}`).join(" ")}`);
  const contextTerms = terms(context);

  if (profile.id === "concept") {
    return buildItemChain(profile, memory.topics || [], context, contextTerms, "concept");
  }
  if (profile.id === "argument") {
    return buildArgumentChain(profile, memory.arguments || [], context, contextTerms);
  }
  if (profile.id === "narrative") {
    return buildRelationshipChain(profile, memory.relationships || [], context, contextTerms)
      || buildItemChain({ ...profile, title: "情节脉络", titleKey: "reader.memoryAid.episodic" }, memory.episodic || [], context, contextTerms, "episode");
  }
  if (profile.id === "timeline") {
    return buildItemChain(profile, [...(memory.timeline || []), ...(memory.episodic || [])], context, contextTerms, "timeline");
  }

  return buildItemChain(profile, [
    ...(memory.episodic || []),
    ...(memory.topics || []),
    ...(memory.arguments || []),
  ], context, contextTerms, "general");
}

function buildItemChain(profile, source, context, contextTerms, kind) {
  const items = dedupeItems(source).filter(validItem).map((item) => ({
    raw: item,
    score: relevance(item, context, contextTerms),
  }));
  const seeds = items.filter((item) => item.score >= 2.4).sort((a, b) => b.score - a.score);
  if (!seeds.length) return null;

  const selected = [seeds[0]];
  items
    .filter((candidate) => candidate.raw.id !== seeds[0].raw.id)
    .map((candidate) => ({ ...candidate, link: itemLink(seeds[0].raw, candidate.raw, kind, candidate.score >= 1.5) }))
    .filter((candidate) => candidate.link)
    .sort((a, b) => b.score - a.score || comparePosition(a.raw.evidence, b.raw.evidence))
    .slice(0, 4)
    .forEach((item) => selected.push(item));

  if (selected.length < 2) return null;
  selected.sort((a, b) => comparePosition(a.raw.evidence, b.raw.evidence));
  return finishAid(profile, kind, selected.map((entry, index) => toAidItem(entry.raw, index ? entry.link || sequenceLabel(kind) : "起点")));
}

function buildArgumentChain(profile, source, context, contextTerms) {
  const ranked = dedupeItems(source).filter(validItem).map((item) => ({ raw: item, score: relevance(item, context, contextTerms) }));
  const seed = ranked.filter((item) => item.score >= 2.4).sort((a, b) => b.score - a.score)[0];
  if (!seed) return null;
  const connected = ranked
    .filter((entry) => entry.raw.id !== seed.raw.id && argumentLink(seed.raw, entry.raw))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (!connected.length) return null;
  const ordered = [seed, ...connected].sort((a, b) => (KIND_ORDER[a.raw.kind] ?? 9) - (KIND_ORDER[b.raw.kind] ?? 9) || comparePosition(a.raw.evidence, b.raw.evidence));
  return finishAid(profile, "argument", ordered.map((entry) => toAidItem(entry.raw, argumentRole(entry.raw.kind))));
}

function buildRelationshipChain(profile, source, context, contextTerms) {
  const edges = (source || []).filter((item) => validEvidence(item?.evidence) && item.source && item.target && item.relation && !NOISE.test(`${item.source} ${item.target} ${item.relation}`));
  const scored = edges.map((item) => ({ raw: item, score: relationshipRelevance(item, context, contextTerms) }));
  const seed = scored.filter((item) => item.score >= 2.7).sort((a, b) => b.score - a.score)[0];
  if (!seed) return null;
  const names = new Set([seed.raw.source, seed.raw.target]);
  const connected = scored
    .filter((entry) => entry.raw.id !== seed.raw.id && (names.has(entry.raw.source) || names.has(entry.raw.target)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (!connected.length) return null;
  const ordered = [seed, ...connected].sort((a, b) => comparePosition(a.raw.evidence, b.raw.evidence));
  return finishAid({ ...profile, title: "关系脉络", titleKey: "reader.memoryAid.relationship" }, "relationship", ordered.map((entry) => ({
    id: entry.raw.id,
    title: `${entry.raw.source} · ${entry.raw.target}`,
    summary: entry.raw.relation,
    relation: entry.raw.relation,
    evidence: entry.raw.evidence,
  })));
}

function finishAid(profile, kind, items) {
  const unique = dedupeItems(items).slice(0, 5);
  if (unique.length < 2 || unique.some((item) => !validEvidence(item.evidence))) return null;
  return { kind, title: profile.title, subtitle: profile.subtitle, items: unique };
}

function toAidItem(item, relation) {
  return {
    id: item.id,
    title: clean(item.name || item.title).slice(0, 40),
    summary: clean(item.summary || item.detail || item.claim || item.reason || item.conclusion).slice(0, 120),
    relation,
    evidence: item.evidence,
  };
}

function relevance(item, context, contextTerms) {
  const title = clean(item.name || item.title);
  const body = clean(`${title} ${item.summary || ""} ${item.claim || ""} ${item.reason || ""} ${item.conclusion || ""}`);
  let score = item.priority === "primary" ? 1 : item.priority === "recent" ? 0.7 : 0.25;
  if (title.length >= 2 && context.includes(title)) score += 3.2;
  score += overlap(terms(body), contextTerms) * 1.3;
  if (explicitRefs(item).some((ref) => context.includes(ref))) score += 2;
  return score;
}

function relationshipRelevance(item, context, contextTerms) {
  let score = item.priority === "primary" || item.importance === "primary" ? 1 : 0.3;
  if (context.includes(item.source)) score += 2.6;
  if (context.includes(item.target)) score += 2.6;
  score += overlap(terms(`${item.source} ${item.target} ${item.relation}`), contextTerms) * 1.2;
  return score;
}

function itemLink(left, right, kind, allowSequence = false) {
  const leftRefs = new Set(explicitRefs(left));
  const rightRefs = new Set(explicitRefs(right));
  const leftName = clean(left.name || left.title);
  const rightName = clean(right.name || right.title);
  if (leftRefs.has(rightName) || rightRefs.has(leftName)) return explicitLabel(kind);
  if ([...leftRefs].some((value) => rightRefs.has(value))) return explicitLabel(kind);
  if (overlap(terms(`${leftName} ${left.summary || ""}`), terms(`${rightName} ${right.summary || ""}`)) >= 2) return sharedLabel(kind);
  if (allowSequence && (kind === "timeline" || kind === "episode") && distinctPosition(left.evidence, right.evidence)) return "随后";
  return "";
}

function argumentLink(left, right) {
  const leftText = clean(`${left.name || ""} ${left.summary || ""} ${left.claim || ""} ${left.reason || ""} ${left.conclusion || ""}`);
  const rightText = clean(`${right.name || ""} ${right.summary || ""} ${right.claim || ""} ${right.reason || ""} ${right.conclusion || ""}`);
  return overlap(terms(leftText), terms(rightText)) >= 2 || explicitRefs(left).includes(clean(right.name)) || explicitRefs(right).includes(clean(left.name));
}

function explicitRefs(item) {
  return [
    ...(item.causes || []),
    ...(item.causedBy || []),
    ...(item.prerequisites || []),
    ...(item.relatedTo || []),
    ...(item.supports || []),
    ...(item.respondsTo || []),
  ].map(clean).filter((value) => value.length >= 2);
}

function terms(value) {
  const text = clean(value).toLocaleLowerCase();
  const tokens = text.match(/[\u3400-\u9fff]{2,8}|[a-z][a-z0-9-]{2,}/gi) || [];
  const result = new Set();
  tokens.forEach((token) => {
    if (STOP.has(token)) return;
    result.add(token);
    if (/^[\u3400-\u9fff]+$/.test(token) && token.length > 3) {
      for (let size = 2; size <= Math.min(4, token.length); size += 1) {
        for (let index = 0; index <= token.length - size; index += 1) result.add(token.slice(index, index + size));
      }
    }
  });
  return result;
}

function overlap(left, right) {
  let count = 0;
  left.forEach((value) => { if (right.has(value)) count += 1; });
  return count;
}

function strictPriorCursor(cursor) {
  const chapterIndex = Number(cursor.chapterIndex);
  const paragraphIndex = Number.isInteger(Number(cursor.paragraphIndex)) ? Number(cursor.paragraphIndex) : 0;
  if (paragraphIndex > 0) return { chapterIndex, paragraphIndex: paragraphIndex - 1 };
  if (chapterIndex > 0) return { chapterIndex: chapterIndex - 1, paragraphIndex: Number.MAX_SAFE_INTEGER };
  return { chapterIndex: 0, paragraphIndex: -1 };
}

function validItem(item) {
  const title = clean(item?.name || item?.title);
  const summary = clean(item?.summary || item?.detail || item?.claim || item?.reason || item?.conclusion);
  return title.length >= 2 && summary.length >= 4 && !NOISE.test(`${title} ${summary}`) && validEvidence(item?.evidence);
}

function validEvidence(evidence) {
  return Number.isInteger(Number(evidence?.chapterIndex)) && Number.isInteger(Number(evidence?.paragraphIndex)) && Number(evidence.chapterIndex) >= 0 && Number(evidence.paragraphIndex) >= 0;
}

function distinctPosition(left, right) {
  return comparePosition(left, right) !== 0;
}

function comparePosition(left, right) {
  return (Number(left?.chapterIndex) - Number(right?.chapterIndex)) || (Number(left?.paragraphIndex) - Number(right?.paragraphIndex));
}

function argumentRole(kind) {
  return ({ claim: "观点", reason: "理由", evidence: "论据", example: "例证", objection: "质疑", conclusion: "结论" })[kind] || "承接";
}

function sequenceLabel(kind) {
  return kind === "concept" ? "关联" : kind === "argument" ? "承接" : "随后";
}

function explicitLabel(kind) {
  return kind === "concept" ? "前置" : kind === "timeline" ? "因果" : "承接";
}

function sharedLabel(kind) {
  return kind === "concept" ? "关联" : kind === "timeline" ? "同一进程" : "同一线索";
}

function dedupeItems(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item?.id || `${clean(item?.name || item?.title)}:${item?.evidence?.chapterIndex}:${item?.evidence?.paragraphIndex}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
