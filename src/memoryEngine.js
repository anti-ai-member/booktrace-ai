export function buildMemoryEvidenceStore(book, traceIndex = {}) {
  const chunks = [];
  const entityMap = buildEntityMap(traceIndex);

  (book?.chapters || []).forEach((chapter, chapterIndex) => {
    (chapter.paragraphs || []).forEach((paragraph, paragraphIndex) => {
      if (paragraph && typeof paragraph === "object" && paragraph.type === "image") return;
      const cleanText = normaliseText(typeof paragraph === "object" ? paragraph.text : paragraph);
      if (!cleanText) return;
      const id = `${book.id || "book"}:${chapterIndex}:${paragraphIndex}`;
      const entities = entitiesForPosition(entityMap, chapterIndex, paragraphIndex, cleanText);
      const timeMentions = extractTimeMentions(cleanText);
      const tokens = tokenize(`${chapter.title || ""} ${cleanText} ${entities.join(" ")} ${timeMentions.join(" ")}`);
      chunks.push({
        id,
        bookId: book.id || "book",
        chapterIndex,
        chapterTitle: chapter.title || `Chapter ${chapterIndex + 1}`,
        paragraphIndex,
        text: cleanText,
        entities,
        timeMentions,
        tokens,
      });
    });
  });

  return {
    bookId: book?.id || "book",
    chunks,
    chunkMap: new Map(chunks.map((chunk) => [chunk.id, chunk])),
    keywordIndex: buildKeywordIndex(chunks),
    entityIndex: buildInvertedIndex(chunks, "entities"),
    timeIndex: buildInvertedIndex(chunks, "timeMentions"),
  };
}

export function locateEvidence(store, options = {}) {
  const query = normaliseText([options.query, options.selectedText].filter(Boolean).join(" "));
  if (!store || !query) return [];

  const queryTokens = tokenize(query);
  const queryEntities = extractCandidateEntities(query);
  const scopeCursor = options.scopeCursor || null;
  const requireTextMatch = Boolean(options.requireTextMatch);
  const candidates = new Map();

  addKeywordCandidates(candidates, store, queryTokens);
  addInvertedCandidates(candidates, store, queryEntities);
  if (!requireTextMatch) addNearbyTraceCandidates(candidates, store, options.traceIndex);
  if (requireTextMatch) addLiteralTextCandidates(candidates, store, query);

  const queryTokenSet = new Set(queryTokens);
  const queryEntitySet = new Set(queryEntities);
  return [...candidates.values()]
    .map((candidate) => {
      const chunk = store.chunkMap.get(candidate.id);
      if (!chunk || !isWithinScope(chunk, scopeCursor)) return null;
      if (requireTextMatch && !textIncludesQuery(chunk.text, query)) return null;
      const keywordScore = scoreKeyword(chunk, queryTokenSet, store.keywordIndex.idf);
      const entityScore = scoreEntityOverlap(chunk.entities, queryEntitySet);
      const proximityScore = scoreReadingProximity(chunk, options.currentCursor);
      const traceScore = requireTextMatch ? 0 : scoreTraceImportance(chunk, options.traceIndex);
      const score = (0.48 * keywordScore) + (0.22 * entityScore) + (0.18 * proximityScore) + (0.12 * traceScore);
      return {
        ...chunk,
        score,
        scores: { keyword: keywordScore, entity: entityScore, proximity: proximityScore, trace: traceScore },
        matchSources: matchSources({ keywordScore, entityScore, traceScore }),
        excerpt: excerptForQuery(chunk.text, query),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.chapterIndex - right.chapterIndex || left.paragraphIndex - right.paragraphIndex)
    .slice(0, options.topK || 12)
    .map((result, index) => ({ ...result, cite: createContextCite(result, index + 1) }));
}

export function buildMemoryCandidates(chapters = [], traceProfile = null) {
  const candidates = new Map();
  const add = (type, value, occurrence, context = "") => {
    const name = normaliseText(value);
    if (!name || name.length < 2) return;
    const id = `${type}:${name}`;
    const current = candidates.get(id) || { id, type, name: value, count: 0, occurrences: [], contexts: [] };
    current.count += 1;
    current.occurrences.push(occurrence);
    if (context) current.contexts.push(context.slice(0, 180));
    candidates.set(id, current);
  };

  chapters.forEach((chapter, localChapterIndex) => {
    const chapterIndex = chapter.sourceChapterIndex ?? chapter.chapterIndex ?? localChapterIndex;
    (chapter.paragraphs || []).forEach((item, paragraphIndex) => {
      if (item && typeof item === "object" && item.type === "image") return;
      const text = typeof item === "string" ? item : item?.text;
      if (!text) return;
      const sourceParagraphIndex = typeof item === "object" ? item.paragraphIndex ?? paragraphIndex : paragraphIndex;
      const occurrence = { chapterIndex, paragraphIndex: sourceParagraphIndex, chapterTitle: chapter.title };
      extractCandidateEntities(text).forEach((entity) => add(classifyCandidateType(entity, traceProfile), entity, occurrence, text));
      extractTimeMentions(text).forEach((time) => add("time", time, occurrence, text));
      extractEventCandidates(text).forEach((event) => add("event", event, occurrence, text));
      extractConceptCandidates(text, traceProfile).forEach((concept) => add("concept", concept, occurrence, text));
    });
  });

  return [...candidates.values()]
    .map((item) => ({
      ...item,
      occurrences: item.occurrences.slice(0, 5),
      contexts: item.contexts.slice(0, 3),
      impactHint: scoreCandidateImpact(item, traceProfile),
    }))
    .sort((left, right) => right.impactHint - left.impactHint || right.count - left.count)
    .slice(0, 80);
}

export function createContextCite(chunk, index = 1) {
  return {
    id: `C${index}`,
    label: `[C${index}]`,
    chunkId: chunk.id,
    chapterIndex: chunk.chapterIndex,
    chapterTitle: chunk.chapterTitle,
    paragraphIndex: chunk.paragraphIndex,
    quote: chunk.excerpt || chunk.text.slice(0, 120),
    source: `${chunk.chapterTitle} · 第 ${chunk.paragraphIndex + 1} 段`,
  };
}

function buildEntityMap(index = {}) {
  const byPosition = new Map();
  const add = (item) => {
    if (!item?.name) return;
    (item.occurrences || [item.occurrence]).filter(Boolean).forEach((occurrence) => {
      const key = `${occurrence.chapterIndex}:${occurrence.paragraphIndex}`;
      const values = byPosition.get(key) || [];
      values.push(item.name);
      byPosition.set(key, values);
    });
  };
  ["people", "organizations", "places", "timeline"].forEach((key) => (index[key] || []).forEach(add));
  return byPosition;
}

function entitiesForPosition(entityMap, chapterIndex, paragraphIndex, text) {
  const fromTrace = entityMap.get(`${chapterIndex}:${paragraphIndex}`) || [];
  return unique([...fromTrace, ...extractCandidateEntities(text)]).slice(0, 16);
}

function buildKeywordIndex(chunks) {
  const postings = new Map();
  const documentFrequency = new Map();
  chunks.forEach((chunk) => {
    const counts = new Map();
    chunk.tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    counts.forEach((count, token) => {
      if (!postings.has(token)) postings.set(token, new Map());
      postings.get(token).set(chunk.id, count);
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    });
  });
  const idf = new Map([...documentFrequency.entries()].map(([token, count]) => [token, Math.log(1 + chunks.length / (1 + count))]));
  return { postings, idf };
}

function buildInvertedIndex(chunks, field) {
  const index = new Map();
  chunks.forEach((chunk) => {
    (chunk[field] || []).forEach((value) => {
      const key = normaliseText(value);
      if (!key) return;
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(chunk.id);
    });
  });
  return index;
}

function addKeywordCandidates(candidates, store, queryTokens) {
  queryTokens.forEach((token) => {
    const postings = store.keywordIndex.postings.get(token);
    if (!postings) return;
    postings.forEach((_count, id) => addCandidate(candidates, id, "keyword"));
  });
}

function addInvertedCandidates(candidates, store, queryEntities) {
  queryEntities.forEach((entity) => {
    const ids = store.entityIndex.get(normaliseText(entity)) || store.timeIndex.get(normaliseText(entity));
    ids?.forEach((id) => addCandidate(candidates, id, "entity"));
  });
}

function addNearbyTraceCandidates(candidates, store, index = {}) {
  ["people", "organizations", "places", "timeline", "relationships"].flatMap((key) => index?.[key] || [])
    .flatMap((item) => item.occurrences || [item.occurrence || item.evidence])
    .filter(Boolean)
    .slice(0, 40)
    .forEach((occurrence) => addCandidate(candidates, `${store.bookId}:${occurrence.chapterIndex}:${occurrence.paragraphIndex}`, "trace"));
}

function addLiteralTextCandidates(candidates, store, query) {
  const needle = normaliseText(query);
  if (!needle) return;
  store.chunks.forEach((chunk) => {
    if (textIncludesQuery(chunk.text, needle)) addCandidate(candidates, chunk.id, "keyword");
  });
}

function textIncludesQuery(text, query) {
  const needle = normaliseText(query);
  if (!needle) return false;
  return normaliseText(text).includes(needle);
}

function addCandidate(candidates, id, source) {
  const current = candidates.get(id) || { id, sources: new Set() };
  current.sources.add(source);
  candidates.set(id, current);
}

function scoreKeyword(chunk, queryTokenSet, idf) {
  if (!queryTokenSet.size) return 0;
  let score = 0;
  let max = 0;
  queryTokenSet.forEach((token) => {
    const weight = idf.get(token) || 0.2;
    max += weight;
    if (chunk.tokens.includes(token)) score += weight;
  });
  return max ? Math.min(1, score / max) : 0;
}

function scoreEntityOverlap(entities, queryEntitySet) {
  if (!queryEntitySet.size) return 0;
  const entitySet = new Set((entities || []).map(normaliseText));
  let hits = 0;
  queryEntitySet.forEach((entity) => { if (entitySet.has(normaliseText(entity))) hits += 1; });
  return Math.min(1, hits / Math.max(1, queryEntitySet.size));
}

function scoreReadingProximity(chunk, cursor) {
  if (!cursor) return 0.4;
  const distance = Math.abs((chunk.chapterIndex - cursor.chapterIndex) * 80 + (chunk.paragraphIndex - (cursor.paragraphIndex || 0)));
  return 1 / (1 + distance / 40);
}

function scoreTraceImportance(chunk, index = {}) {
  const allItems = ["people", "organizations", "places", "timeline", "relationships"].flatMap((key) => index?.[key] || []);
  const hasPrimaryEvidence = allItems.some((item) => {
    const occurrence = item.occurrence || item.evidence;
    return item.priority === "primary" && occurrence?.chapterIndex === chunk.chapterIndex && occurrence?.paragraphIndex === chunk.paragraphIndex;
  });
  return hasPrimaryEvidence ? 1 : 0;
}

function matchSources(scores) {
  return [
    scores.keywordScore > 0.1 ? "keyword" : "",
    scores.entityScore > 0 ? "entity" : "",
    scores.traceScore > 0 ? "trace-memory" : "",
  ].filter(Boolean);
}

function isWithinScope(chunk, cursor) {
  if (!cursor) return true;
  if (chunk.chapterIndex < cursor.chapterIndex) return true;
  if (chunk.chapterIndex > cursor.chapterIndex) return false;
  return chunk.paragraphIndex <= (cursor.paragraphIndex ?? Number.MAX_SAFE_INTEGER);
}

function excerptForQuery(text, query) {
  const cleanQuery = normaliseText(query);
  const exactIndex = cleanQuery ? normaliseText(text).indexOf(cleanQuery) : -1;
  const firstToken = tokenize(query).find((token) => token.length > 1);
  const tokenIndex = firstToken ? normaliseText(text).indexOf(firstToken) : -1;
  const index = exactIndex >= 0 ? exactIndex : tokenIndex;
  if (index < 0) return text.slice(0, 132);
  const start = Math.max(0, index - 42);
  const end = Math.min(text.length, index + cleanQuery.length + 86);
  return `${start ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function tokenize(text) {
  const normalised = normaliseText(text);
  const tokens = normalised.match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}/g) || [];
  const expanded = [];
  tokens.forEach((token) => {
    expanded.push(token);
    if (/^[\u4e00-\u9fff]+$/.test(token)) {
      for (let index = 0; index < token.length - 1; index += 1) expanded.push(token.slice(index, index + 2));
      for (let index = 0; index < token.length - 2; index += 1) expanded.push(token.slice(index, index + 3));
    }
  });
  return unique(expanded).slice(0, 260);
}

function extractCandidateEntities(text) {
  const candidates = new Set();
  const patterns = [
    /[\u4e00-\u9fff]{2,8}(?:军团|方面军|集团军|军委|委员会|政府|师|旅|团|营|部队|纵队|支队|红军|桂军|黔军|湘军|国民党|共产党)/g,
    /(?:[\u4e00-\u9fff]{2,8})(?:省|市|县|镇|村|江|河|山|岭|坳|圩|城|州|关|口|根据地)/g,
    /(?:[\u4e00-\u9fff]{2,3})(?=(?:说|问|答|曰|道|认为|指出|回忆|命令|率|带领|担任|任|为|与|和))/g,
  ];
  patterns.forEach((pattern) => [...String(text || "").matchAll(pattern)].forEach((match) => candidates.add(match[0])));
  return [...candidates].filter(isUsefulEntityCandidate).slice(0, 24);
}

function extractEventCandidates(text) {
  return (String(text || "").match(/[^。！？；]{0,28}(?:命令|决定|出发|抵达|进入|离开|会合|发现|遭遇|战斗|冲突|失败|胜利|转移|撤退|开始|结束|提出|证明|解释|导致|形成)[^。！？；]{0,38}/g) || [])
    .map((item) => item.trim())
    .filter((item) => item.length >= 10)
    .slice(0, 6);
}

function extractConceptCandidates(text, traceProfile = null) {
  const shouldExtractConcepts = (traceProfile?.anchors || []).some((anchor) => /concept|definition|mechanism|framework|knowledge|formula|api|flow|argument/.test(anchor.id));
  if (!shouldExtractConcepts) return [];
  return unique([
    ...(String(text || "").match(/(?:“[^”]{2,18}”|[\u4e00-\u9fffA-Za-z0-9-]{2,24})(?=(?:是指|指的是|定义为|意味着|可以理解为|称为|叫做|包括|由.+组成|用于|用来))/g) || []),
    ...(String(text || "").match(/[\u4e00-\u9fffA-Za-z0-9-]{2,18}(?:原理|原则|机制|模型|框架|策略|队列|检查点|指标|比率|效率|公式|定理|概念|定义|流程|方法|模式|链|系统)/g) || []),
  ])
    .map((item) => item.replace(/[“”]/g, "").trim())
    .filter(isUsefulEntityCandidate)
    .slice(0, 8);
}

function classifyCandidateType(entity, traceProfile = null) {
  const anchorIds = (traceProfile?.anchors || []).map((anchor) => anchor.id).join(" ");
  const conceptLed = /concept|knowledge|definition|mechanism|framework|api|flow|metric|formula|argument/.test(anchorIds)
    && !/people|relationships/.test(anchorIds);
  if (conceptLed) return "concept";
  if (/(军团|方面军|集团军|军委|委员会|政府|师|旅|团|营|部队|纵队|支队|红军|桂军|黔军|湘军|国民党|共产党)$/.test(entity)) return "organization";
  if (/(省|市|县|镇|村|江|河|山|岭|坳|圩|城|州|关|口|根据地)$/.test(entity)) return "place";
  if (/concept|knowledge|definition|mechanism|framework|api/.test(anchorIds) && entity.length > 4) return "concept";
  return "person";
}

function scoreCandidateImpact(item, traceProfile = null) {
  const anchorIds = (traceProfile?.anchors || []).map((anchor) => anchor.id);
  let score = Math.min(5, item.count);
  if (anchorIds.includes(`${item.type}s`) || anchorIds.includes(item.type)) score += 2;
  if (item.type === "event" || item.type === "time") score += 1;
  if (item.contexts.some((context) => /(关键|核心|导致|决定|命令|转折|发现|证明|解释|会合|战斗|失败|胜利)/.test(context))) score += 2;
  return score;
}

function extractTimeMentions(text) {
  return unique([
    ...(String(text || "").match(/(?:[12]\d{3}|[零〇一二两三四五六七八九]{4})年(?:[一二三四五六七八九十\d]{1,3}月)?(?:[一二三四五六七八九十\d]{1,3}[日号])?(?:上午|下午|凌晨|傍晚|黄昏|夜间)?/g) || []),
    ...(String(text || "").match(/(?:上午|下午|凌晨|傍晚|黄昏|夜间)[一二三四五六七八九十\d]{1,3}时/g) || []),
  ]);
}

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function isUsefulEntityCandidate(value) {
  const item = String(value || "").trim();
  if (item.length < 2 || STOP_ENTITIES.has(item)) return false;
  if (/^(他|她|它|这|那|也|就|都|并|但|而|或|和|与|为|在|从|被|把|将|才|又|还|已|未|不|无|其|每|各)/.test(item)) return false;
  if (/(解释了|成为|提高|转化|记录|投入|继续|失败|成功|恢复|处理|保持|判断|增加|证明|启动|决定|形成|导致)/.test(item)) return false;
  if (/^(邻|断|避|转向|温度成|后台$|请求$)/.test(item)) return false;
  if (/(时间$|渠道$|效率$|信$)/.test(item) && item.length <= 4) return false;
  if (/(知道|就是|报告|原文|证据|内容|地方|时候|方面|情况|问题|他们|我们|你们|自己|这里|那里|这个|那个|一种|一个|可以|没有|进行|成为|由于|因为|所以|但是|如果|后来|同时|已经|正在|需要)$/.test(item)) return false;
  return true;
}

const STOP_ENTITIES = new Set(["他们", "我们", "你们", "自己", "这里", "那里", "这个", "那个", "一种", "一个", "他们知", "他知", "也就是", "报告", "原文", "证据", "内容", "地方", "情况", "问题"]);
