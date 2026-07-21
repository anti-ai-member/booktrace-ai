const MEMORY_VERSION = 2;
const PRIORITY_RANK = { primary: 3, recent: 2, secondary: 1 };
const BUCKETS = ["entities", "timeline", "topics", "arguments", "episodic", "relationships"];
const BUCKET_CAPS = {
  entities: 80,
  timeline: 48,
  topics: 48,
  arguments: 36,
  episodic: 36,
  relationships: 48,
  discarded: 24,
  supportingEvidence: 16,
};

export function createEmptyBookMemory({
  bookId = "book",
  cursor = null,
  profile = null,
  traceProfile = null,
  reader = null,
} = {}) {
  return {
    version: MEMORY_VERSION,
    bookId,
    cursor,
    profile,
    traceProfile,
    updatedAt: new Date().toISOString(),
    entities: [],
    timeline: [],
    topics: [],
    arguments: [],
    episodic: [],
    relationships: [],
    reader: normalizeReaderMemory(reader),
    discarded: [],
    supportingEvidence: [],
  };
}

export function normalizeBookMemory(raw = {}, options = {}) {
  const base = createEmptyBookMemory({
    bookId: raw.bookId || options.bookId || "book",
    cursor: raw.cursor || options.cursor || null,
    profile: raw.profile || options.profile || null,
    traceProfile: raw.traceProfile || options.traceProfile || null,
    reader: raw.reader,
  });

  if (!raw || typeof raw !== "object") return base;

  // Already canonical.
  if (Number(raw.version) >= MEMORY_VERSION || hasCanonicalBuckets(raw)) {
    return {
      ...base,
      version: MEMORY_VERSION,
      entities: normalizeItemList(raw.entities, "entity", normalizeEntityItem),
      timeline: normalizeItemList(raw.timeline, "timeline", normalizeTimelineItem),
      topics: normalizeItemList(raw.topics, "topic", normalizeTopicItem),
      arguments: normalizeItemList(raw.arguments, "argument", normalizeArgumentItem),
      episodic: normalizeItemList(raw.episodic, "episodic", normalizeEpisodicItem),
      relationships: normalizeRelationshipList(raw.relationships),
      discarded: normalizeDiscarded(raw.discarded),
      supportingEvidence: normalizeSupportingEvidence(raw.supportingEvidence || raw.evidence),
      updatedAt: raw.updatedAt || base.updatedAt,
      cursor: raw.cursor || base.cursor,
      profile: raw.profile || base.profile,
      traceProfile: raw.traceProfile || base.traceProfile,
      reader: normalizeReaderMemory(raw.reader),
    };
  }

  // Model payload shaped as { memory: {...} }.
  if (raw.memory && typeof raw.memory === "object") {
    return normalizeBookMemory({ ...raw, ...raw.memory, version: MEMORY_VERSION }, options);
  }

  return bookMemoryFromLegacy(raw, options);
}

export function bookMemoryFromLegacy(legacy = {}, options = {}) {
  const index = legacy.index || legacy;
  const traceMemory = legacy.traceMemory || legacy;
  const anchors = Array.isArray(traceMemory?.anchors) ? traceMemory.anchors : [];
  const memory = createEmptyBookMemory({
    bookId: options.bookId || legacy.bookId || "book",
    cursor: legacy.cursor || traceMemory?.cursor || options.cursor || null,
    profile: legacy.profile || traceMemory?.profile || options.profile || null,
    traceProfile: legacy.traceProfile || traceMemory?.traceProfile || options.traceProfile || null,
    reader: legacy.reader,
  });

  memory.entities = [
    ...normalizeItemList(index.people, "person", (item, i) => normalizeEntityItem({ ...item, kind: "person" }, i)),
    ...normalizeItemList(index.organizations, "organization", (item, i) => normalizeEntityItem({ ...item, kind: "organization" }, i)),
    ...normalizeItemList(index.places, "place", (item, i) => normalizeEntityItem({ ...item, kind: "place" }, i)),
  ];
  memory.timeline = normalizeItemList(index.timeline, "timeline", normalizeTimelineItem);
  memory.relationships = normalizeRelationshipList(index.relationships);

  anchors.forEach((anchor) => {
    const bucket = bucketForAnchorId(anchor?.id);
    const items = Array.isArray(anchor?.items) ? anchor.items : [];
    items.forEach((item, index) => {
      const normalized = normalizeAnchorItem(item, anchor, index);
      if (!normalized) return;
      memory[bucket].push(normalized);
    });
  });

  memory.discarded = normalizeDiscarded(legacy.discarded || traceMemory?.discarded);
  memory.supportingEvidence = normalizeSupportingEvidence(legacy.supportingEvidence || traceMemory?.evidence || options.supportingEvidence);
  memory.entities = dedupeById(memory.entities).slice(0, BUCKET_CAPS.entities);
  memory.timeline = dedupeById(memory.timeline).slice(0, BUCKET_CAPS.timeline);
  memory.topics = dedupeById(memory.topics).slice(0, BUCKET_CAPS.topics);
  memory.arguments = dedupeById(memory.arguments).slice(0, BUCKET_CAPS.arguments);
  memory.episodic = dedupeById(memory.episodic).slice(0, BUCKET_CAPS.episodic);
  memory.relationships = dedupeById(memory.relationships).slice(0, BUCKET_CAPS.relationships);
  return memory;
}

export function mergeBookMemory(previous = null, incoming = null, cursor = null) {
  const left = normalizeBookMemory(previous || {});
  const right = normalizeBookMemory(incoming || {}, {
    bookId: left.bookId,
    cursor: cursor || incoming?.cursor || left.cursor,
    profile: incoming?.profile || left.profile,
    traceProfile: incoming?.traceProfile || left.traceProfile,
  });
  const merged = createEmptyBookMemory({
    bookId: right.bookId || left.bookId,
    cursor: cursor || right.cursor || left.cursor,
    profile: right.profile || left.profile,
    traceProfile: right.traceProfile || left.traceProfile,
    reader: mergeReaderMemory(left.reader, right.reader),
  });

  BUCKETS.forEach((bucket) => {
    const map = new Map();
    [...(left[bucket] || []), ...(right[bucket] || [])].forEach((item) => {
      if (!item?.id) return;
      const existing = map.get(item.id);
      map.set(item.id, existing ? mergeMemoryItem(existing, item) : item);
    });
    merged[bucket] = [...map.values()]
      .sort(comparePriorityThenRecency)
      .slice(0, BUCKET_CAPS[bucket] || 40);
  });

  merged.discarded = dedupeById([...(left.discarded || []), ...(right.discarded || [])]).slice(0, BUCKET_CAPS.discarded);
  merged.supportingEvidence = normalizeSupportingEvidence(right.supportingEvidence?.length ? right.supportingEvidence : left.supportingEvidence);
  return filterBookMemoryByCursor(merged, merged.cursor);
}

export function filterBookMemoryByCursor(memory, cursor = null) {
  const normalized = normalizeBookMemory(memory || {});
  if (!cursor || !Number.isInteger(Number(cursor.chapterIndex))) return normalized;
  const bound = {
    chapterIndex: Number(cursor.chapterIndex),
    paragraphIndex: Number.isInteger(Number(cursor.paragraphIndex)) ? Number(cursor.paragraphIndex) : Number.MAX_SAFE_INTEGER,
  };
  const next = { ...normalized, cursor: bound };
  BUCKETS.forEach((bucket) => {
    next[bucket] = (normalized[bucket] || []).filter((item) => isItemWithinCursor(item, bound));
  });
  next.supportingEvidence = (normalized.supportingEvidence || []).filter((item) => isEvidenceWithinCursor(item, bound));
  return next;
}

export function readingIndexFromBookMemory(memory = null) {
  const normalized = normalizeBookMemory(memory || {});
  const entities = normalized.entities || [];
  return {
    people: entities.filter((item) => item.kind === "person").map(toIndexEntity),
    organizations: entities.filter((item) => item.kind === "organization").map(toIndexEntity),
    places: entities.filter((item) => item.kind === "place" || item.kind === "term").map(toIndexEntity),
    timeline: (normalized.timeline || []).map(toIndexTimeline),
    relationships: (normalized.relationships || []).map(toIndexRelationship),
  };
}

export function compatibilityTraceMemory(memory = null) {
  const normalized = normalizeBookMemory(memory || {});
  const groups = new Map();
  const push = (id, label, item) => {
    if (!groups.has(id)) groups.set(id, { id, label, items: [] });
    groups.get(id).items.push({
      title: item.name,
      name: item.name,
      summary: item.summary,
      evidence: item.evidence,
      priority: item.priority,
    });
  };

  (normalized.entities || []).forEach((item) => push(item.kind === "place" ? "places" : `${item.kind}s`, item.kind, item));
  (normalized.timeline || []).forEach((item) => push("timeline", "时间线", item));
  (normalized.topics || []).forEach((item) => push(item.kind || "concepts", item.kind || "topics", item));
  (normalized.arguments || []).forEach((item) => push("arguments", "论证", item));
  (normalized.episodic || []).forEach((item) => push("events", "情节 / 事件", item));

  return {
    cursor: normalized.cursor,
    profile: normalized.profile,
    traceProfile: normalized.traceProfile,
    updatedAt: normalized.updatedAt,
    anchors: [...groups.values()].map((group) => ({ ...group, items: group.items.slice(0, 12) })),
    discarded: normalized.discarded,
    evidence: normalized.supportingEvidence,
    compactIndex: {
      people: (normalized.entities || []).filter((item) => item.kind === "person" && item.priority === "primary").slice(0, 12).map((item) => item.name),
      organizations: (normalized.entities || []).filter((item) => item.kind === "organization" && item.priority === "primary").slice(0, 12).map((item) => item.name),
      places: (normalized.entities || []).filter((item) => item.kind === "place" && item.priority === "primary").slice(0, 12).map((item) => item.name),
      timeline: (normalized.timeline || []).filter((item) => item.priority === "primary").slice(0, 12).map((item) => item.name),
    },
  };
}

export function hasBookMemoryContent(memory = null) {
  const normalized = normalizeBookMemory(memory || {});
  return BUCKETS.some((bucket) => Array.isArray(normalized[bucket]) && normalized[bucket].length > 0);
}

export function readerForgettingScore({
  memoryKey,
  reader = null,
  now = Date.now(),
  lastSeenAt = null,
} = {}) {
  const state = normalizeReaderMemory(reader);
  if (!memoryKey) return 0;
  if (state.rememberedKeys.includes(memoryKey)) return 0.15;
  if (state.missedKeys.includes(memoryKey)) return 0.85;
  if (Object.prototype.hasOwnProperty.call(state.forgettingScores, memoryKey)) {
    return clamp01(state.forgettingScores[memoryKey]);
  }
  const absenceMs = Number(state.absenceMs || 0) || Math.max(0, now - Number(state.lastActivityAt || lastSeenAt || now));
  const days = absenceMs / (24 * 60 * 60 * 1000);
  if (days < 1) return 0.2;
  if (days < 3) return 0.45;
  if (days < 7) return 0.65;
  return 0.8;
}

export function updateReaderMemory(reader = null, patch = {}) {
  const current = normalizeReaderMemory(reader);
  return normalizeReaderMemory({
    ...current,
    ...patch,
    rememberedKeys: uniqueStrings([...(current.rememberedKeys || []), ...(patch.rememberedKeys || [])]),
    missedKeys: uniqueStrings([...(current.missedKeys || []), ...(patch.missedKeys || [])]),
    noteRefs: uniqueStrings([...(current.noteRefs || []), ...(patch.noteRefs || [])]),
    bookmarkRefs: uniqueStrings([...(current.bookmarkRefs || []), ...(patch.bookmarkRefs || [])]),
    forgettingScores: { ...current.forgettingScores, ...(patch.forgettingScores || {}) },
  });
}

export function collectMemoryAnchors(memory = null, cursor = null, reader = null) {
  const scoped = filterBookMemoryByCursor(memory, cursor);
  const readerState = normalizeReaderMemory(reader || scoped.reader);
  const items = [
    ...(scoped.episodic || []),
    ...(scoped.timeline || []),
    ...(scoped.arguments || []),
    ...(scoped.topics || []),
    ...(scoped.entities || []),
  ];
  return items
    .filter((item) => item?.name && item?.summary && item?.evidence)
    .map((item) => ({
      ...item,
      memoryKey: item.id,
      score: (PRIORITY_RANK[item.priority] || 1)
        + readerForgettingScore({ memoryKey: item.id, reader: readerState }) * 0.35
        + (item.kind === "event" || item.kind === "scene" ? 0.2 : 0),
    }))
    .sort((left, right) => right.score - left.score || comparePriorityThenRecency(left, right))
    .slice(0, 8);
}

function normalizeEntityItem(item = {}, index = 0) {
  const kind = ["person", "organization", "place", "term"].includes(item.kind)
    ? item.kind
    : inferEntityKind(item);
  const name = cleanText(item.name || item.title);
  const evidence = normalizeEvidence(item.evidence || item.occurrence || item.occurrences?.[0], item);
  if (!name || !evidence) return null;
  return {
    id: stableId(item.id, kind, name, evidence),
    kind,
    name,
    summary: cleanText(item.summary || item.detail || item.subtitle || evidence.quote) || name,
    priority: normalizePriority(item.priority),
    attributes: asStringArray(item.attributes || item.roles).slice(0, 2),
    roles: asStringArray(item.roles || item.attributes).slice(0, 2),
    status: cleanText(item.status) || "",
    latestChange: cleanText(item.latestChange) || "",
    evidence,
    occurrences: normalizeOccurrences(item.occurrences, evidence),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function normalizeTimelineItem(item = {}, index = 0) {
  const name = cleanText(item.name || item.date || item.title);
  const evidence = normalizeEvidence(item.evidence || item.occurrence || item.occurrences?.[0], item);
  if (!name || !evidence) return null;
  return {
    id: stableId(item.id, "timeline", name, evidence),
    kind: item.kind === "timepoint" ? "timepoint" : "event",
    name,
    summary: cleanText(item.summary || item.detail || item.subtitle || item.title) || name,
    priority: normalizePriority(item.priority),
    causes: asStringArray(item.causes),
    causedBy: asStringArray(item.causedBy),
    evidence,
    occurrences: normalizeOccurrences(item.occurrences, evidence),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function normalizeTopicItem(item = {}, index = 0) {
  const kind = ["concept", "definition", "mechanism", "framework", "example"].includes(item.kind) ? item.kind : "concept";
  const name = cleanText(item.name || item.title);
  const evidence = normalizeEvidence(item.evidence || item.occurrence || item.occurrences?.[0], item);
  if (!name || !evidence) return null;
  return {
    id: stableId(item.id, kind, name, evidence),
    kind,
    name,
    summary: cleanText(item.summary || item.detail || item.definition) || name,
    priority: normalizePriority(item.priority),
    evidence,
    occurrences: normalizeOccurrences(item.occurrences, evidence),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function normalizeArgumentItem(item = {}, index = 0) {
  const kind = ["claim", "reason", "evidence", "example", "conclusion", "objection"].includes(item.kind) ? item.kind : "claim";
  const name = cleanText(item.name || item.title || item.claim);
  const evidence = normalizeEvidence(item.evidence || item.occurrence || item.occurrences?.[0], item);
  if (!name || !evidence) return null;
  return {
    id: stableId(item.id, kind, name, evidence),
    kind,
    name,
    summary: cleanText(item.summary || item.detail || item.reason || item.conclusion) || name,
    priority: normalizePriority(item.priority),
    claim: cleanText(item.claim) || "",
    reason: cleanText(item.reason) || "",
    example: cleanText(item.example) || "",
    conclusion: cleanText(item.conclusion) || "",
    evidence,
    occurrences: normalizeOccurrences(item.occurrences, evidence),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function normalizeEpisodicItem(item = {}, index = 0) {
  const name = cleanText(item.name || item.title || item.event);
  const evidence = normalizeEvidence(item.evidence || item.occurrence || item.occurrences?.[0], item);
  if (!name || !evidence) return null;
  return {
    id: stableId(item.id, "episodic", name, evidence),
    kind: item.kind === "scene" ? "scene" : "event",
    name,
    summary: cleanText(item.summary || item.detail) || name,
    priority: normalizePriority(item.priority),
    chapterTitle: cleanText(item.chapterTitle) || "",
    evidence,
    occurrences: normalizeOccurrences(item.occurrences, evidence),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function normalizeRelationshipList(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const source = cleanText(item?.source);
    const target = cleanText(item?.target);
    const relation = cleanText(item?.relation);
    const evidence = normalizeEvidence(item?.evidence || item?.occurrence, item);
    if (!source || !target || !relation || source === target || !evidence) return null;
    return {
      id: stableId(item.id, "relationship", `${source}->${target}:${relation}`, evidence),
      kind: "relationship",
      name: `${source} ${relation} ${target}`,
      summary: relation,
      source,
      target,
      sourceType: ["person", "organization", "event", "place", "term"].includes(item.sourceType) ? item.sourceType : "person",
      targetType: ["person", "organization", "event", "place", "term"].includes(item.targetType) ? item.targetType : "person",
      relation,
      relationKind: ["command", "belongs", "cooperate", "conflict", "participate", "other"].includes(item.relationKind) ? item.relationKind : "other",
      priority: normalizePriority(item.importance || item.priority),
      evidence,
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeAnchorItem(item, anchor, index) {
  const bucket = bucketForAnchorId(anchor?.id);
  const payload = {
    ...item,
    kind: item.kind || singularAnchorKind(anchor?.id),
    name: item.name || item.title,
    summary: item.summary || item.detail,
    evidence: item.evidence || item,
  };
  if (bucket === "topics") return normalizeTopicItem(payload, index);
  if (bucket === "arguments") return normalizeArgumentItem(payload, index);
  if (bucket === "episodic") return normalizeEpisodicItem(payload, index);
  if (bucket === "timeline") return normalizeTimelineItem(payload, index);
  return normalizeEntityItem(payload, index);
}

function normalizeReaderMemory(reader = null) {
  const value = reader && typeof reader === "object" ? reader : {};
  return {
    position: value.position && typeof value.position === "object"
      ? {
        chapterIndex: Number(value.position.chapterIndex) || 0,
        pageIndex: Number(value.position.pageIndex) || 0,
        paragraphIndex: Number.isInteger(Number(value.position.paragraphIndex)) ? Number(value.position.paragraphIndex) : 0,
      }
      : null,
    lastActivityAt: Number(value.lastActivityAt) || null,
    absenceMs: Math.max(0, Number(value.absenceMs) || 0),
    rememberedKeys: uniqueStrings(value.rememberedKeys),
    missedKeys: uniqueStrings(value.missedKeys),
    noteRefs: uniqueStrings(value.noteRefs || value.noteIds),
    bookmarkRefs: uniqueStrings(value.bookmarkRefs || value.bookmarkIds),
    activeReadingMs: Math.max(0, Number(value.activeReadingMs) || 0),
    forgettingScores: normalizeScoreMap(value.forgettingScores),
  };
}

function mergeReaderMemory(left, right) {
  return updateReaderMemory(left, {
    ...right,
    position: right?.position || left?.position || null,
    lastActivityAt: Math.max(Number(left?.lastActivityAt) || 0, Number(right?.lastActivityAt) || 0) || null,
    absenceMs: Math.max(Number(left?.absenceMs) || 0, Number(right?.absenceMs) || 0),
    activeReadingMs: Math.max(Number(left?.activeReadingMs) || 0, Number(right?.activeReadingMs) || 0),
  });
}

function mergeMemoryItem(left, right) {
  const priority = PRIORITY_RANK[right.priority] >= PRIORITY_RANK[left.priority] ? right.priority : left.priority;
  const evidence = pickBetterEvidence(left.evidence, right.evidence);
  return {
    ...left,
    ...right,
    id: left.id,
    priority,
    summary: preferText(right.summary, left.summary),
    attributes: uniqueStrings([...(left.attributes || []), ...(right.attributes || [])]).slice(0, 2),
    roles: uniqueStrings([...(left.roles || []), ...(right.roles || [])]).slice(0, 2),
    causes: uniqueStrings([...(left.causes || []), ...(right.causes || [])]),
    causedBy: uniqueStrings([...(left.causedBy || []), ...(right.causedBy || [])]),
    evidence,
    occurrences: dedupeOccurrences([...(left.occurrences || []), ...(right.occurrences || []), evidence]).slice(0, 8),
    updatedAt: right.updatedAt || left.updatedAt || new Date().toISOString(),
  };
}

function normalizeEvidence(evidence, fallback = {}) {
  const source = evidence && typeof evidence === "object" ? evidence : {};
  const chapterIndex = Number(source.chapterIndex ?? fallback.chapterIndex);
  const paragraphIndex = Number(source.paragraphIndex ?? fallback.paragraphIndex);
  const quote = cleanText(source.quote || source.excerpt || fallback.evidenceQuote || fallback.quote || "");
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex)) return null;
  if (chapterIndex < 0 || paragraphIndex < 0) return null;
  return {
    chapterIndex,
    paragraphIndex,
    quote: quote.slice(0, 240),
    cite: source.cite || null,
  };
}

function normalizeOccurrences(occurrences, evidence) {
  const list = Array.isArray(occurrences) ? occurrences : [];
  return dedupeOccurrences([...list.map((item) => normalizeEvidence(item)).filter(Boolean), evidence].filter(Boolean)).slice(0, 8);
}

function normalizeSupportingEvidence(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const evidence = normalizeEvidence(item, item);
    if (!evidence) return null;
    return {
      ...evidence,
      chapterTitle: cleanText(item.chapterTitle) || "",
      quote: cleanText(item.quote || evidence.quote),
      score: Number(item.score) || 0,
      matchSources: Array.isArray(item.matchSources) ? item.matchSources : [],
      cite: item.cite || {
        id: `C${index + 1}`,
        label: `[C${index + 1}]`,
        chapterIndex: evidence.chapterIndex,
        paragraphIndex: evidence.paragraphIndex,
        quote: evidence.quote,
      },
    };
  }).filter(Boolean).slice(0, BUCKET_CAPS.supportingEvidence);
}

function normalizeDiscarded(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: cleanText(item?.id) || `discarded-${index}`,
    name: cleanText(item?.name || item?.title) || `discarded-${index}`,
    reason: cleanText(item?.reason || item?.summary) || "",
  })).filter((item) => item.name).slice(0, BUCKET_CAPS.discarded);
}

function normalizeItemList(items, fallbackKind, normalizer) {
  return dedupeById((Array.isArray(items) ? items : []).map((item, index) => normalizer({ kind: item?.kind || fallbackKind, ...item }, index)).filter(Boolean));
}

function toIndexEntity(item) {
  return {
    id: item.id,
    name: item.name,
    subtitle: item.summary,
    detail: item.summary,
    evidenceQuote: item.evidence?.quote || "",
    priority: item.priority === "primary" ? "primary" : "secondary",
    attributes: item.attributes || [],
    occurrence: item.evidence,
    occurrences: item.occurrences || [item.evidence],
    evidence: item.evidence,
  };
}

function toIndexTimeline(item) {
  return {
    ...toIndexEntity(item),
    subtitle: item.name,
    detail: item.summary,
  };
}

function toIndexRelationship(item) {
  return {
    id: item.id,
    source: item.source,
    target: item.target,
    sourceType: item.sourceType,
    targetType: item.targetType,
    relation: item.relation,
    relationKind: item.relationKind,
    importance: item.priority === "primary" ? "primary" : "secondary",
    evidence: item.evidence,
    occurrence: item.evidence,
  };
}

function hasCanonicalBuckets(raw) {
  return BUCKETS.some((bucket) => Array.isArray(raw?.[bucket]));
}

function bucketForAnchorId(id = "") {
  const value = String(id || "").toLowerCase();
  if (/timeline|time/.test(value)) return "timeline";
  if (/argument|proposition|objection|conclusion|decision/.test(value)) return "arguments";
  if (/concept|definition|mechanism|framework|knowledge|formula|api|flow|prerequisite|metric/.test(value)) return "topics";
  if (/event|plot|scene|episode|clue|case|action|pitfall/.test(value)) return "episodic";
  return "entities";
}

function singularAnchorKind(id = "") {
  const value = String(id || "").toLowerCase();
  if (value.endsWith("s") && value.length > 2) return value.slice(0, -1);
  return value || "term";
}

function inferEntityKind(item = {}) {
  if (item.kind) return item.kind;
  const name = cleanText(item.name || item.title);
  if (/(军团|方面军|集团军|红军|部队|纵队|支队|委员会|政府|军委|公司|学校|大学|协会|组织)$/.test(name)) return "organization";
  if (/(省|市|县|镇|村|江|河|山|岭|城|州|关|口|根据地)$/.test(name)) return "place";
  return "person";
}

function isItemWithinCursor(item, cursor) {
  const evidence = item?.evidence || item?.occurrences?.[0];
  if (evidence) return isEvidenceWithinCursor(evidence, cursor);
  if (item?.source && item?.target) return true;
  return false;
}

function isEvidenceWithinCursor(evidence, cursor) {
  if (!evidence || !cursor) return true;
  if (Number(evidence.chapterIndex) < cursor.chapterIndex) return true;
  if (Number(evidence.chapterIndex) > cursor.chapterIndex) return false;
  return Number(evidence.paragraphIndex) <= cursor.paragraphIndex;
}

function pickBetterEvidence(left, right) {
  if (!left) return right;
  if (!right) return left;
  const leftScore = (left.quote || "").length + (left.cite ? 20 : 0);
  const rightScore = (right.quote || "").length + (right.cite ? 20 : 0);
  return rightScore >= leftScore ? right : left;
}

function comparePriorityThenRecency(left, right) {
  const priority = (PRIORITY_RANK[right.priority] || 0) - (PRIORITY_RANK[left.priority] || 0);
  if (priority) return priority;
  return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
}

function stableId(explicit, kind, name, evidence) {
  // Entity-like memories always merge by kind+name; ignore legacy ids like "person-0-毛泽东".
  if (["person", "organization", "place", "term", "concept", "definition", "mechanism", "framework", "example", "claim", "reason", "conclusion", "objection"].includes(kind)) {
    return `${kind}:${normalizeKey(name)}`;
  }
  if (cleanText(explicit)) return cleanText(explicit);
  return `${kind}:${normalizeKey(name)}:${evidence?.chapterIndex ?? 0}:${evidence?.paragraphIndex ?? 0}`;
}

function normalizePriority(value) {
  if (value === "primary" || value === "recent" || value === "secondary") return value;
  if (value === "important" || value === "high") return "primary";
  return "secondary";
}

function normalizeScoreMap(map) {
  if (!map || typeof map !== "object") return {};
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [String(key), clamp01(value)]));
}

function dedupeById(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (!item?.id) return;
    const existing = map.get(item.id);
    map.set(item.id, existing ? mergeMemoryItem(existing, item) : item);
  });
  return [...map.values()];
}

function dedupeOccurrences(items = []) {
  const map = new Map();
  items.filter(Boolean).forEach((item) => {
    const key = `${item.chapterIndex}:${item.paragraphIndex}`;
    const existing = map.get(key);
    map.set(key, existing ? pickBetterEvidence(existing, item) : item);
  });
  return [...map.values()];
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value);
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}

function preferText(primary, fallback) {
  return cleanText(primary) || cleanText(fallback) || "";
}

export function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^(undefined|null|nan)$/i.test(text)) return "";
  return text;
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase();
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
