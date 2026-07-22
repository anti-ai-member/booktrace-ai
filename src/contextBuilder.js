import {
  collectMemoryAnchors,
  filterBookMemoryByCursor,
  hasBookMemoryContent,
  normalizeBookMemory,
  readerForgettingScore,
} from "./memoryModels.js";
import {
  hintFromEvidenceExcerpt,
  isBroadMegaTopic,
  isEpisodeWorthyAnchor,
  preferQuestionAnchor,
  questionFromEpisodeAnchor,
} from "./recoveryQuality.js";

const NOISE_PATTERNS = /出生|生于|逝世|享年|出版|印刷|译者|版权|ISBN|目录|字数|开本|印张|邮编|新华书店|版本图书馆|CIP数据|http:\/\/|www\./i;
const WEAK_SUMMARY_PATTERNS = /^(undefined|null|详见|同上|略|无)$/i;
const ACTION_HINT = /决定|命令|出发|抵达|进入|离开|转移|会合|冲突|战斗|失败|胜利|证明|导致|形成|改变|提出|主张|发现|背叛|结盟|突破|撤退/;

/**
 * Build a one-screen continued-reading recovery plan from Book Memory.
 * Forgetting score is a secondary factor only.
 */
export function buildRecoveryPlan({
  book = null,
  bookMemory = null,
  cursor = null,
  currentPageText = "",
  lastActivity = null,
  reader = null,
  minAbsenceMs = 0,
} = {}) {
  const memory = normalizeBookMemory(bookMemory || {});
  const absence = describeAbsence(lastActivity);
  const normalizedCursor = normalizeCursor(cursor);

  if (minAbsenceMs > 0 && Number(lastActivity || 0) && Date.now() - Number(lastActivity) < minAbsenceMs) {
    return suppressedPlan("recent-activity", absence);
  }
  if (!shouldOfferRecovery({ book, cursor: normalizedCursor, bookMemory: memory })) {
    return suppressedPlan("low-context", absence);
  }

  const pageText = normaliseText(currentPageText || extractCurrentPageText(book, normalizedCursor));
  const ranked = rankRecallCandidates({
    bookMemory: memory,
    cursor: normalizedCursor,
    currentPageText: pageText,
    reader,
  });
  if (ranked.length < 2) return suppressedPlan("insufficient-anchors", absence);

  const keyAnchors = ranked.slice(0, 3);
  const prerequisiteAnchors = selectPrerequisites(ranked, pageText).slice(0, 2);
  const questionAnchor = preferQuestionAnchor(ranked) || preferQuestionAnchor(keyAnchors) || keyAnchors[0];
  const chapterTitle = book?.chapters?.[normalizedCursor.chapterIndex]?.title || `第 ${normalizedCursor.chapterIndex + 1} 节`;

  const keyPoints = keyAnchors.map((item, index) => ({
    id: `ctx-point-${index}`,
    memoryKey: item.memoryKey || item.id,
    title: clip(item.name || item.title, 18),
    detail: clip(item.summary || item.detail, 96),
    evidence: toEvidence(item),
  }));
  const prerequisites = prerequisiteAnchors.map((item, index) => ({
    id: `ctx-prereq-${index}`,
    text: prerequisiteText(item, chapterTitle),
    evidence: toEvidence(item),
  }));
  const questionEvidence = toEvidence(questionAnchor);
  const questionHint = hintFromEvidenceExcerpt(questionEvidence?.excerpt || questionAnchor?.summary || "");

  return {
    suppressed: false,
    reason: null,
    intensity: absence.intensity,
    absenceLabel: absence.label,
    positionLabel: `上次停在 ${chapterTitle} · 第 ${(normalizedCursor.pageIndex || 0) + 1} 页`,
    keyPoints,
    prerequisites,
    question: {
      memoryKey: questionAnchor.memoryKey || questionAnchor.id,
      prompt: questionFromEpisodeAnchor(questionAnchor, chapterTitle),
      hint: questionHint,
      answer: clip(questionAnchor.summary || questionAnchor.detail, 120),
      evidence: questionEvidence,
    },
    evidence: uniqueEvidence([...keyAnchors, ...prerequisiteAnchors].map(toEvidence)).slice(0, 6),
  };
}

export function shouldOfferRecovery({ book = null, cursor = null, bookMemory = null } = {}) {
  const normalizedCursor = normalizeCursor(cursor);
  if (!book?.chapters?.length) return false;
  if (!hasRecoverablePriorContext(normalizedCursor)) return false;
  const memory = normalizeBookMemory(bookMemory || {});
  return hasBookMemoryContent(memory) || hasRecoverablePriorContext(normalizedCursor);
}

export function rankRecallCandidates({
  bookMemory = null,
  cursor = null,
  currentPageText = "",
  reader = null,
} = {}) {
  const normalizedCursor = normalizeCursor(cursor);
  const scoped = filterBookMemoryByCursor(bookMemory, normalizedCursor);
  const pageTokens = tokenize(currentPageText);
  const pageEntityHints = extractLooseEntities(currentPageText);

  return collectMemoryAnchors(scoped, normalizedCursor, reader)
    .filter((item) => !isNoiseMemoryItem(item))
    .map((item) => {
      const overlap = scoreCurrentPageOverlap(item, pageTokens, pageEntityHints);
      const proximity = scoreProximity(item.evidence, normalizedCursor);
      const mainline = scoreMainline(item);
      const priority = item.priority === "primary" ? 1.2 : item.priority === "recent" ? 0.9 : 0.55;
      const forgetting = readerForgettingScore({ memoryKey: item.id, reader }) * 0.25; // secondary only
      const score = (0.34 * mainline) + (0.3 * overlap) + (0.2 * proximity) + (0.16 * priority) + forgetting;
      return {
        ...item,
        memoryKey: item.id,
        title: item.name,
        detail: item.summary,
        scores: { mainline, overlap, proximity, priority, forgetting },
        score,
      };
    })
    .filter((item) => item.score > 0.35)
    .sort((left, right) => right.score - left.score || String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 8);
}

export function selectPrerequisites(rankedCandidates = [], currentPageText = "") {
  const pageTokens = new Set(tokenize(currentPageText));
  const pageEntities = new Set(extractLooseEntities(currentPageText).map((item) => item.toLowerCase()));
  return [...rankedCandidates]
    .map((item) => {
      const nameHit = pageEntities.has(String(item.name || "").toLowerCase()) ? 1 : 0;
      const tokenHits = tokenize(`${item.name || ""} ${item.summary || ""}`).filter((token) => pageTokens.has(token)).length;
      const causal = /cause|caused|导致|因为|因此|承接|继续|前置|依赖|为了/.test(`${item.kind} ${item.summary || ""}`) ? 0.4 : 0;
      return { ...item, prerequisiteScore: nameHit * 1.2 + Math.min(1.2, tokenHits * 0.25) + causal + (item.kind === "event" || item.kind === "scene" ? 0.2 : 0) };
    })
    .filter((item) => item.prerequisiteScore >= 0.35 || item.priority === "primary")
    .sort((left, right) => right.prerequisiteScore - left.prerequisiteScore || right.score - left.score)
    .slice(0, 2);
}

function hasRecoverablePriorContext(cursor) {
  if (!cursor) return false;
  if (Number(cursor.chapterIndex) > 0 || Number(cursor.pageIndex) > 0) return true;
  return Number(cursor.paragraphIndex || 0) >= 2;
}

function isNoiseMemoryItem(item) {
  const blob = `${item?.name || ""} ${item?.summary || ""} ${item?.evidence?.quote || ""}`;
  if (!normaliseText(item?.name) || !normaliseText(item?.summary)) return true;
  if (WEAK_SUMMARY_PATTERNS.test(item.summary)) return true;
  if (NOISE_PATTERNS.test(blob)) return true;
  if (/^\d{2,4}年\d{1,2}月\d{1,2}日$/.test(item.name) && !ACTION_HINT.test(item.summary || "")) return true;
  if ((item.kind === "place" || item.kind === "person") && (item.summary || "").length < 8 && item.priority === "secondary") return true;
  if (isBroadMegaTopic(item.name) && !isEpisodeWorthyAnchor(item) && item.priority === "secondary") return true;
  return false;
}

function scoreCurrentPageOverlap(item, pageTokens, pageEntities) {
  if (!pageTokens.length && !pageEntities.length) return 0.35;
  const itemTokens = new Set(tokenize(`${item.name || ""} ${item.summary || ""} ${item.evidence?.quote || ""}`));
  let hits = 0;
  pageTokens.forEach((token) => { if (itemTokens.has(token)) hits += 1; });
  const entityHit = pageEntities.some((entity) => normaliseText(item.name).includes(entity) || entity.includes(normaliseText(item.name)));
  const tokenScore = pageTokens.length ? Math.min(1, hits / Math.max(3, Math.min(pageTokens.length, 12))) : 0;
  return Math.min(1, tokenScore + (entityHit ? 0.45 : 0));
}

function scoreProximity(evidence, cursor) {
  if (!evidence || !cursor) return 0.4;
  const distance = Math.abs((Number(evidence.chapterIndex) - Number(cursor.chapterIndex)) * 80 + (Number(evidence.paragraphIndex) - Number(cursor.paragraphIndex || 0)));
  return 1 / (1 + distance / 50);
}

function scoreMainline(item) {
  const kindBoost = {
    event: 1,
    scene: 0.95,
    claim: 0.9,
    conclusion: 0.9,
    mechanism: 0.85,
    concept: 0.8,
    timepoint: 0.75,
    person: 0.7,
    organization: 0.7,
    place: 0.55,
    term: 0.5,
  }[item.kind] || 0.6;
  const actionBoost = ACTION_HINT.test(item.summary || "") ? 0.15 : 0;
  const broadPenalty = isBroadMegaTopic(item.name) && !isEpisodeWorthyAnchor(item) ? -0.45 : 0;
  return Math.min(1, Math.max(0, kindBoost + actionBoost + broadPenalty));
}

function prerequisiteText(item, chapterTitle) {
  if (item.kind === "event" || item.kind === "scene" || item.kind === "timepoint") {
    return `继续读《${chapterTitle}》前，先接上事件：${clip(item.name, 18)}。`;
  }
  if (item.kind === "claim" || item.kind === "conclusion" || item.kind === "reason") {
    return `继续读《${chapterTitle}》前，先想起这条判断：${clip(item.name, 18)}。`;
  }
  if (item.kind === "concept" || item.kind === "definition" || item.kind === "mechanism" || item.kind === "framework") {
    return `继续读《${chapterTitle}》前，先想起概念：${clip(item.name, 18)}。`;
  }
  if (item.kind === "person" || item.kind === "organization") {
    return `继续读《${chapterTitle}》前，先记起${clip(item.name, 12)}在主线中的作用。`;
  }
  return `继续读《${chapterTitle}》前，先接上：${clip(item.name, 18)}。`;
}

function extractCurrentPageText(book, cursor) {
  const chapter = book?.chapters?.[cursor?.chapterIndex];
  if (!chapter) return "";
  const paragraphs = chapter.paragraphs || [];
  const end = Math.min(paragraphs.length - 1, Number(cursor.paragraphIndex ?? paragraphs.length - 1));
  const start = Math.max(0, end - 2);
  return paragraphs.slice(start, end + 1).map((item) => (typeof item === "object" ? item.text : item)).filter(Boolean).join("\n");
}

function toEvidence(item) {
  const evidence = item?.evidence || {};
  const quote = normaliseText(evidence.quote || item.summary || item.detail || "").slice(0, 180);
  return {
    id: item.memoryKey || item.id,
    memoryKey: item.memoryKey || item.id,
    chapterIndex: evidence.chapterIndex,
    paragraphIndex: evidence.paragraphIndex,
    chapterTitle: item.chapterTitle || evidence.chapterTitle || "",
    excerpt: quote,
    quote,
    cite: evidence.cite || {
      label: "[M]",
      source: `${item.chapterTitle || "原文"} · 第 ${(evidence.paragraphIndex || 0) + 1} 段`,
      quote,
    },
    matchSources: ["context-builder"],
  };
}

function uniqueEvidence(items = []) {
  const map = new Map();
  items.filter(Boolean).forEach((item) => {
    const key = `${item.chapterIndex}:${item.paragraphIndex}:${item.quote || item.excerpt}`;
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function suppressedPlan(reason, absence) {
  return {
    suppressed: true,
    reason,
    intensity: absence.intensity,
    absenceLabel: absence.label,
    positionLabel: "",
    keyPoints: [],
    prerequisites: [],
    question: null,
    evidence: [],
  };
}

function describeAbsence(lastActivity) {
  const lastActivityTime = Number(lastActivity || 0);
  if (!lastActivityTime) return { intensity: "fresh", label: "继续阅读前" };
  const days = (Date.now() - lastActivityTime) / (24 * 60 * 60 * 1000);
  if (days < 1) return { intensity: "light", label: "离开不久，先快速接上" };
  if (days < 3) return { intensity: "medium", label: "隔了一段时间，先恢复主线" };
  if (days < 7) return { intensity: "deep", label: "多日未读，先重建关键上下文" };
  return { intensity: "deep", label: "很久没读，先找回前文脉络" };
}

function normalizeCursor(cursor = null) {
  if (!cursor || typeof cursor !== "object") return { chapterIndex: 0, pageIndex: 0, paragraphIndex: 0 };
  return {
    chapterIndex: Math.max(0, Number(cursor.chapterIndex) || 0),
    pageIndex: Math.max(0, Number(cursor.pageIndex) || 0),
    paragraphIndex: Number.isInteger(Number(cursor.paragraphIndex)) ? Number(cursor.paragraphIndex) : 0,
  };
}

function tokenize(text) {
  const normalised = normaliseText(text);
  const tokens = normalised.match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}/gi) || [];
  const expanded = [];
  tokens.forEach((token) => {
    const value = token.toLowerCase();
    expanded.push(value);
    if (/^[\u4e00-\u9fff]+$/.test(value)) {
      for (let index = 0; index < value.length - 1; index += 1) expanded.push(value.slice(index, index + 2));
    }
  });
  return [...new Set(expanded)].slice(0, 160);
}

function extractLooseEntities(text) {
  const normalised = normaliseText(text);
  const matches = normalised.match(/[\u4e00-\u9fff]{2,8}/g) || [];
  return [...new Set(matches.filter((item) => item.length >= 2 && item.length <= 8))].slice(0, 24);
}

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clip(value, max = 80) {
  const text = normaliseText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
