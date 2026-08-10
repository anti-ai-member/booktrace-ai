import {
  collectMemoryAnchors,
  consolidateReaderMemoryAssets,
  filterBookMemoryByCursor,
  hasBookMemoryContent,
  normalizeBookMemory,
  readerForgettingScore,
  updateReaderMemory,
} from "./memoryModels.js";
import {
  hintFromEvidenceExcerpt,
  isBroadMegaTopic,
  isEpisodeWorthyAnchor,
  questionFromEpisodeAnchor,
} from "./recoveryQuality.js";

const NOISE_PATTERNS = /出生|生于|逝世|享年|出版|印刷|译者|版权|ISBN|目录|字数|开本|印张|邮编|新华书店|版本图书馆|CIP数据|http:\/\/|www\./i;
const ACTION_HINT = /决定|命令|出发|抵达|进入|离开|转移|会合|冲突|战斗|失败|胜利|证明|导致|形成|改变|提出|主张|发现|背叛|结盟|突破|撤退|起义|谈判|部署|会议|包围|突围|进攻|防守|会师|定义|反驳|cause|decide|order|attack|retreat|define|prove|claim/i;
const CAUSAL_MARK = /因此|于是|所以|导致|因为|由于|使得|造成|结果|随后|接着|为了|却|但是|然而/;
const INTENT_MARK = /决定|命令|主张|计划|目标|反对|要求|下令|部署|企图|想要/;
const TEMPORAL_MARK = /此前|之后|当时|此刻|翌日|次日|同年|那年|阶段|之前|后来/;
const SPATIAL_MARK = /抵达|离开|进入|驻|进驻|退往|向|在.{1,8}(城|镇|县|省|山|河|江|湖|村|市)/;
const IRRELEVANCE_MARK = /(?:与|和|同).{0,12}(?:无关|不相关)|题外|顺带一提|unrelated|aside/i;
const LINK_STOP_TERMS = new Set([
  "一个", "一些", "这个", "那个", "这些", "那些", "他们", "她们", "我们", "本页", "当前",
  "此前", "此刻", "之后", "后来", "因此", "于是", "所以", "因为", "由于", "但是", "然而",
  "决定", "需要", "可以", "已经", "仍然", "继续", "相关", "事情", "内容", "阶段", "如何",
  "进行", "形成", "发生", "出现", "提到", "说明", "问题", "关系", "重要", "主要",
  "the", "and", "that", "this", "with", "from", "into", "because", "therefore",
]);

const MAX_GAPS = 6;
const MAX_CANDIDATES = 12;
const MAX_BRIDGES_AUTO = 2;
const MAX_BRIDGES_SHOW = 3;

/**
 * A recovery card is a tiny recall budget, so it must not spend two slots on
 * the same displayed memory anchor even when upstream candidate IDs differ.
 */
export function dedupeSituationBridges(items = []) {
  const unique = [];
  items.filter(Boolean).forEach((item) => {
    const key = situationBridgeAnchorKey(item);
    if (!key) return;
    const title = normaliseAnchorTitle(item);
    const duplicateIndex = unique.findIndex((entry) => {
      if (entry.key === key) return true;
      const existingTitle = entry.title;
      const shorter = Math.min(title.length, existingTitle.length);
      return shorter >= 4 && (title.includes(existingTitle) || existingTitle.includes(title));
    });
    if (duplicateIndex < 0) {
      unique.push({ item, key, title });
    } else if (situationBridgeQuality(item) > situationBridgeQuality(unique[duplicateIndex].item)) {
      unique[duplicateIndex] = { item, key, title };
    }
  });
  return unique.map((entry) => entry.item);
}

function situationBridgeAnchorKey(item = {}) {
  const title = normaliseAnchorTitle(item);
  return title ? `title:${title}` : (item.candidateId || item.memoryKey || item.id ? `id:${item.candidateId || item.memoryKey || item.id}` : "");
}

function normaliseAnchorTitle(item = {}) {
  return normaliseText(item.title || item.name || item.label)
    .toLocaleLowerCase()
    .replace(/[\s·・，,。.!！?？:：;；'"“”‘’（）()【】\[\]_-]/g, "");
}

function situationBridgeQuality(item = {}) {
  const confidence = item.confidence === "high" ? 1 : item.confidence === "low" ? -1 : 0;
  return confidence * 10 + Number(item.score || 0) + Number(item.fuseScore || 0);
}

/**
 * Phase A+B: local shortlist + optional LLM adjudicator input.
 * Never dumps prior chapters — only gaps and ≤12 short candidates.
 */
export function prepareSituationBridgeShortlist({
  book = null,
  bookMemory = null,
  cursor = null,
  currentPageText = "",
  focusText = "",
  lastActivity = null,
  reader = null,
  notes = [],
  explains = [],
  bookmarks = [],
  mode = "auto",
  minAbsenceMs = 0,
  bookType = "",
} = {}) {
  const absence = describeAbsence(lastActivity);
  const normalizedCursor = normalizeCursor(cursor);
  const memory = normalizeBookMemory(bookMemory || {});
  const readerState = consolidateReaderMemoryAssets(updateReaderMemory(memory.reader, reader || {}), {
    notes,
    explains,
    bookmarks,
    cursor: normalizedCursor,
  });
  const bias = typeBias(bookType || book?.bookType || "");

  if (mode === "auto" && minAbsenceMs > 0 && Number(lastActivity || 0) && Date.now() - Number(lastActivity) < minAbsenceMs) {
    return suppressedPlan("recent-activity", absence);
  }
  if (!book?.chapters?.length || !hasRecoverablePriorContext(normalizedCursor)) {
    return suppressedPlan("low-context", absence);
  }

  const pageText = normaliseText(currentPageText || extractCurrentPageText(book, normalizedCursor));
  const extractedGaps = extractPageGaps(pageText, memory, normalizedCursor, bias);
  const gaps = focusText ? filterSituationGapsByFocus(extractedGaps, focusText) : extractedGaps;
  if (!gaps.length) return suppressedPlan("page-not-dependent", absence);

  const fuel = collectRecallFuel({
    book,
    bookMemory: memory,
    cursor: normalizedCursor,
    notes,
    explains,
    bookmarks,
    reader: readerState,
    pageText,
  });
  if (!fuel.length) return suppressedPlan("no-bridges", absence);

  const offer = shouldOfferSituationBridge({ gaps, fuel, mode, reader: readerState, bias });
  if (!offer.ok) return suppressedPlan(offer.reason, absence);

  const candidates = fuseCandidates(gaps, fuel, readerState, bias).slice(0, MAX_CANDIDATES);
  const minimumCandidates = mode === "manual" ? 1 : MAX_BRIDGES_AUTO;
  if (candidates.length < minimumCandidates) return suppressedPlan("no-bridges", absence);

  const localBridges = matchBridgesLocal(gaps, candidates, mode, readerState, bias);
  const chapterTitle = book.chapters[normalizedCursor.chapterIndex]?.title || `第 ${normalizedCursor.chapterIndex + 1} 节`;

  return {
    suppressed: false,
    reason: null,
    intensity: absence.intensity,
    absenceLabel: absence.label,
    positionLabel: `上次停在 ${chapterTitle} · 第 ${(normalizedCursor.pageIndex || 0) + 1} 页`,
    chapterTitle,
    gaps: gaps.map((gap) => ({
      id: gap.id,
      label: clip(gap.label, 40),
      kind: gap.kind,
      importance: gap.importance,
      context: clip(gap.context || gap.label, 100),
    })),
    candidates: candidates.map((item) => ({
      id: item.candidateId || item.id,
      title: clip(item.title, 24),
      snippet: clip(item.snippet, 80),
      channel: item.channel,
      forGapId: item.forGapId || null,
      linkReason: item.linkReason || null,
      evidence: item.evidence,
    })),
    localBridges,
    currentPageBrief: clip(pageText, 400),
    mode,
  };
}

export function finalizeSituationBridgePlan(shortlist, judgement = null) {
  if (!shortlist || shortlist.suppressed) {
    return shortlist || suppressedPlan("no-bridges");
  }

  // A manual recall request may have one real prerequisite. Returning that one
  // is more useful than padding the card; automatic interruption stays stricter.
  const minBridges = shortlist.mode === "manual" ? 1 : MAX_BRIDGES_AUTO;
  const judgedBridges = Array.isArray(judgement?.bridges) ? judgement.bridges : null;
  const usedJudged = Boolean(judgedBridges && judgedBridges.length >= minBridges);
  const preferredBridges = usedJudged ? judgedBridges : shortlist.localBridges || [];
  // Model and local extractors may use different candidate IDs for the same person
  // or concept. Preserve the adjudicated order, then use distinct local anchors to fill.
  const bridges = dedupeSituationBridges([
    ...preferredBridges,
    ...(usedJudged ? shortlist.localBridges || [] : []),
  ]).slice(0, MAX_BRIDGES_SHOW);
  if (bridges.length < minBridges) {
    return suppressedPlan(judgedBridges ? "low-confidence" : "no-bridges", {
      intensity: shortlist.intensity,
      label: shortlist.absenceLabel,
    });
  }

  const chapterTitle = shortlist.chapterTitle || "";
  const questionFromJudge = usedJudged && judgement?.question?.candidateId
    && bridges.some((item) => item.candidateId === judgement.question.candidateId)
    ? judgement.question
    : null;
  const questionBridge = bridges.find((item) => isEpisodeWorthyAnchor({
    kind: item.gapKind === "concept" ? "concept" : "event",
    name: item.title,
    summary: item.whyNeeded,
    priority: "primary",
  }));
  const question = questionFromJudge || (questionBridge
    ? {
      memoryKey: questionBridge.candidateId,
      prompt: questionFromEpisodeAnchor({
        kind: questionBridge.gapKind === "concept" ? "concept" : "event",
        name: questionBridge.title,
        summary: questionBridge.whyNeeded,
        priority: "primary",
      }, chapterTitle),
      hint: hintFromEvidenceExcerpt(questionBridge.evidence?.excerpt || ""),
      answer: clip(questionBridge.whyNeeded || questionBridge.evidence?.excerpt || "", 120),
      evidence: questionBridge.evidence,
    }
    : null);

  return {
    suppressed: false,
    reason: null,
    intensity: shortlist.intensity,
    absenceLabel: shortlist.absenceLabel,
    positionLabel: shortlist.positionLabel,
    gaps: shortlist.gaps,
    bridges,
    question,
    evidence: uniqueEvidence(bridges.map((item) => item.evidence)).slice(0, 6),
    candidates: shortlist.candidates,
    source: usedJudged ? "adjudicator" : "local",
  };
}

/**
 * Local-only plan (Phase A / fallback). Prefer prepare + finalize when adjudicating.
 */
export function buildSituationBridgePlan(options = {}) {
  const shortlist = prepareSituationBridgeShortlist(options);
  return finalizeSituationBridgePlan(shortlist, null);
}

export function adjudicatorPayloadFromShortlist(shortlist) {
  if (!shortlist || shortlist.suppressed) return null;
  return {
    gaps: (shortlist.gaps || []).slice(0, MAX_GAPS).map((gap) => ({
      id: gap.id,
      label: gap.label,
      kind: gap.kind,
      context: clip(gap.context || gap.label, 100),
    })),
    candidates: (shortlist.candidates || []).slice(0, MAX_CANDIDATES).map((item) => ({
      id: item.id,
      title: item.title,
      snippet: item.snippet,
      channel: item.channel || "",
      forGapId: item.forGapId || null,
      linkReason: item.linkReason || null,
    })),
    currentPageBrief: clip(shortlist.currentPageBrief || "", 400),
  };
}

export function applySituationBridgeJudgement(shortlist, judgement) {
  if (!shortlist || shortlist.suppressed) return shortlist;
  const byId = new Map((shortlist.candidates || []).map((item) => [item.id, item]));
  const gapById = new Map((shortlist.gaps || []).map((item) => [item.id, item]));
  const bridges = (Array.isArray(judgement?.bridges) ? judgement.bridges : [])
    .map((item, index) => {
      const candidate = byId.get(item.candidateId);
      const gap = gapById.get(item.gapId);
      if (!candidate || !gap) return null;
      // IDs being valid is not enough: the local precision gate authorized
      // this candidate for one specific dependency. The judge may rank or
      // reject that pair, but cannot invent a new cross-pairing.
      if (!candidate.linkReason || candidate.forGapId !== gap.id) return null;
      const whyNeeded = clip(item.whyNeeded || whyNeededText(gap, candidate), 72);
      // The candidate title is source-bounded. Do not let a model rename it into
      // another already-visible anchor.
      const title = clip(candidate.title, 16);
      if (!title || !whyNeeded) return null;
      return {
        id: `bridge-judge-${index + 1}`,
        gapId: gap.id,
        candidateId: candidate.id,
        title,
        whyNeeded,
        gapKind: gap.kind,
        evidence: candidate.evidence,
        confidence: item.confidence === "low" ? "low" : "high",
      };
    })
    .filter((item) => item && item.confidence !== "low");

  let question = null;
  if (judgement?.question?.candidateId && judgement?.question?.prompt) {
    const candidate = byId.get(judgement.question.candidateId);
    const gap = gapById.get(judgement.question.gapId) || shortlist.gaps?.[0];
    if (candidate) {
      question = {
        memoryKey: candidate.id,
        prompt: clip(judgement.question.prompt, 80),
        hint: clip(judgement.question.hint || "", 60),
        answer: clip(judgement.question.answer || whyNeededText(gap || { label: candidate.title, kind: "state" }, candidate), 120),
        evidence: candidate.evidence,
        candidateId: candidate.id,
        gapId: gap?.id || null,
      };
    }
  }

  return finalizeSituationBridgePlan(shortlist, { bridges, question });
}

export function shouldOfferSituationBridge({ gaps = [], fuel = [], mode = "auto", reader = null, bias = null } = {}) {
  if (!gaps.length) return { ok: false, reason: "page-not-dependent" };
  const typeWeights = bias || typeBias();
  const importantGaps = gaps.filter((gap) => gap.importance >= (mode === "manual" ? 0.35 : 0.45));
  if (!importantGaps.length) return { ok: false, reason: "low-importance-gaps" };

  const strongFuel = fuel.filter((item) => item.strength >= (mode === "manual" ? 0.35 : 0.42));
  const canCover = importantGaps.some((gap) => strongFuel.some((item) => scoreGapFuel(gap, item, reader, typeWeights) >= 0.28));
  if (!canCover) return { ok: false, reason: "low-importance-gaps" };
  return { ok: true, reason: null };
}

/** Type-honest multipliers for gap importance and fuel kind bonus. */
export function typeBias(category = "") {
  const text = String(category || "");
  if (/科普|技术|哲学|商业|教材|论证|社科|argument|science|tech|philosophy|business|textbook|social/i.test(text)) {
    return { concept: 1.2, intent: 1.1, causal: 1.05, person: 0.85, spatial: 0.8 };
  }
  if (/小说|文学|fiction|romance/i.test(text)) {
    return { person: 1.15, intent: 1.15, relation: 1.1, concept: 0.85 };
  }
  return { person: 1.05, causal: 1.1, temporal: 1.05, spatial: 1.05 };
}

function biasImportance(kind, importance, bias, { primary = false } = {}) {
  let factor = Number(bias?.[kind]) || 1;
  // Argument/science: demote incidental people, keep primary closer to unscaled.
  if (primary && factor < 1) factor = Math.min(1, factor + 0.12);
  return Math.min(1, importance * factor);
}

export function situationBridgeToRecoveryCard(plan) {
  if (!plan || plan.suppressed || !plan.bridges?.length) return null;
  const bridges = dedupeSituationBridges(plan.bridges).slice(0, MAX_BRIDGES_SHOW);
  if (!bridges.length) return null;
  return {
    intensity: plan.intensity,
    absenceLabel: plan.absenceLabel,
    positionLabel: plan.positionLabel,
    bridges,
    gaps: plan.gaps,
    keyPoints: bridges.map((item, index) => ({
      id: item.id || `bridge-point-${index}`,
      memoryKey: item.candidateId,
      title: item.title,
      detail: item.whyNeeded,
      evidence: item.evidence,
    })),
    prerequisites: [],
    question: plan.question,
    evidence: plan.evidence,
  };
}

export function suppressReasonMessage(reason, mode = "manual") {
  if (reason === "page-not-dependent" || reason === "low-importance-gaps") {
    return "这一页不必先回想";
  }
  if (reason === "no-bridges" || reason === "low-confidence") {
    return "暂时接不上可靠前文";
  }
  if (reason === "low-context") {
    return "还没有足够的前文可回想";
  }
  if (reason === "recent-activity" && mode === "auto") {
    return "";
  }
  return "此刻没有需要接上的前文";
}

function extractPageGaps(pageText, memory, cursor, bias = null) {
  const text = normaliseText(pageText);
  if (text.length < 24) return [];
  const typeWeights = bias || typeBias();

  const gaps = [];
  const pushGap = (label, kind, importance, meta = {}) => {
    const clean = clip(normaliseText(label), 40);
    if (!clean || clean.length < 2) return;
    // Fiction: demote abstract mega-topics harder via concept bias.
    if (isBroadMegaTopic(clean) && importance < 0.7) return;
    if (NOISE_PATTERNS.test(clean)) return;
    const scaled = biasImportance(kind, importance, typeWeights, meta);
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
      if (clean.length + 4 < existing.label.length && existing.label.includes(clean) && scaled >= existing.importance - 0.05) {
        gaps[dupIndex] = {
          id: existing.id,
          label: clean,
          kind,
          importance: Math.min(1, Math.max(existing.importance, scaled)),
          context: clip(meta.context || existing.context || clean, 120),
        };
      }
      return;
    }
    gaps.push({
      id: `gap-${gaps.length + 1}`,
      label: clean,
      kind,
      importance: Math.min(1, scaled),
      context: clip(meta.context || clean, 120),
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
    pushGap(name, kind, importance, { primary: entity?.priority === "primary", context: sentenceContaining(text, name) });
  });

  if (CAUSAL_MARK.test(text)) {
    const clause = text.split(/[。！？!?]/).find((part) => CAUSAL_MARK.test(part));
    if (clause) pushGap(clip(clause, 36), "causal", 0.7, { context: clause });
  }
  if (INTENT_MARK.test(text)) {
    const clause = text.split(/[。！？!?]/).find((part) => INTENT_MARK.test(part));
    if (clause) pushGap(clip(clause, 36), "intent", 0.62, { context: clause });
  }
  if (TEMPORAL_MARK.test(text)) {
    pushGap("此前阶段如何接到此刻", "temporal", 0.5, { context: text });
  }
  if (SPATIAL_MARK.test(text)) {
    const placeHit = entityNames.find((name) => text.includes(name) && (scoped.entities || []).some((item) => item.kind === "place" && normaliseText(item.name) === name));
    if (placeHit) pushGap(placeHit, "spatial", 0.55, { context: sentenceContaining(text, placeHit) });
  }

  const conceptHints = (scoped.topics || []).concat(scoped.arguments || [])
    .map((item) => normaliseText(item.name || item.title))
    .filter((name) => name.length >= 2 && text.includes(name));
  conceptHints.slice(0, 3).forEach((name) => pushGap(name, "concept", 0.6, { context: sentenceContaining(text, name) }));

  // Low-information descriptive page: only weak gaps → caller suppresses via importance.
  if (!ACTION_HINT.test(text) && !CAUSAL_MARK.test(text) && gaps.every((gap) => gap.importance < 0.5)) {
    return gaps.filter((gap) => gap.importance >= 0.55);
  }

  return gaps
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_GAPS);
}

function collectRecallFuel({
  book,
  bookMemory,
  cursor,
  notes,
  explains,
  bookmarks,
  reader,
  pageText,
}) {
  const scoped = filterBookMemoryByCursor(bookMemory, cursor);
  const fuel = [];

  collectMemoryAnchors(scoped, cursor, reader).forEach((item) => {
    if (!item?.name || !item?.summary) return;
    if (NOISE_PATTERNS.test(`${item.name} ${item.summary}`)) return;
    if (isBroadMegaTopic(item.name) && !isEpisodeWorthyAnchor(item)) return;
    const channel = channelForMemoryItem(item);
    const evidence = toEvidence(item);
    if (!hasUsableBridgeEvidence(evidence)) return;
    if (!isEvidenceBeforeCursor(evidence, cursor)) return;
    fuel.push({
      id: `mem:${item.id}`,
      channel,
      title: clip(item.name, 24),
      snippet: clip(item.summary, 80),
      strength: memoryStrength(item, reader),
      gapKinds: kindsForChannel(channel),
      evidence,
      priority: item.priority || "secondary",
    });
  });

  (notes || []).forEach((note, index) => {
    if (!isBeforeCursor(note, cursor)) return;
    const title = clip(note.selection || note.content || note.body || "", 24);
    const snippet = clip(note.content || note.body || note.selection || "", 80);
    if (!title || !snippet) return;
    fuel.push({
      id: `note:${note.id || index}`,
      channel: "readerTrace",
      title,
      snippet,
      strength: 0.78,
      gapKinds: ["person", "relation", "causal", "concept", "state"],
      evidence: evidenceFromAnchor(book, note, snippet),
      priority: "recent",
    });
  });

  (explains || []).forEach((item, index) => {
    if (!isBeforeCursor(item, cursor)) return;
    const title = clip(item.title || item.selection || "", 24);
    const snippet = clip(item.answer || item.selection || "", 80);
    if (!title || !snippet) return;
    const gapKinds = item.mode === "concept" ? ["concept"]
      : item.mode === "context" ? ["causal", "intent"]
        : item.mode === "entity" ? ["person", "relation"]
          : ["concept", "person", "causal"];
    fuel.push({
      id: `explain:${item.id || index}`,
      channel: "readerTrace",
      title,
      snippet,
      strength: 0.82,
      gapKinds,
      evidence: evidenceFromAnchor(book, item, snippet),
      priority: "recent",
    });
  });

  (bookmarks || []).forEach((item, index) => {
    if (!isBeforeCursor(item, cursor)) return;
    const snippet = nearParagraphSnippet(book, item) || clip(item.label || item.title || "书签位置", 80);
    fuel.push({
      id: `bookmark:${item.id || index}`,
      channel: "readerTrace",
      title: clip(item.label || item.title || "书签", 24),
      snippet: clip(snippet, 80),
      strength: 0.55,
      gapKinds: ["state", "temporal", "causal"],
      evidence: evidenceFromAnchor(book, item, snippet),
      priority: "secondary",
    });
  });

  recentParagraphFuel(book, cursor).forEach((item) => fuel.push(item));

  // Pair linkage is applied after gaps are known. Keeping the full bounded fuel
  // pool here lets one Memory anchor explain more than one explicit dependency.
  void pageText;
  return dedupeFuel(fuel).sort((a, b) => b.strength - a.strength);
}

export function filterSituationGapsByFocus(gaps = [], focusText = "") {
  const focus = normaliseText(focusText);
  if (!focus) return gaps;
  const compactFocus = compactForLink(focus);
  const focusTerms = significantTerms(focus);
  return (gaps || []).filter((gap) => {
    const label = compactForLink(gap?.label);
    const context = compactForLink(gap?.context || gap?.label);
    if (label.length >= 2 && (compactFocus.includes(label) || label.includes(compactFocus))) return true;
    if (compactFocus.length >= 4 && context.includes(compactFocus)) return true;
    const gapTerms = significantTerms(`${gap?.label || ""} ${gap?.context || ""}`);
    const shared = [...focusTerms].filter((term) => gapTerms.has(term));
    return shared.length >= (focus.length >= 12 ? 2 : 1);
  });
}

function fuseCandidates(gaps, fuel, reader = null, bias = null) {
  const typeWeights = bias || typeBias();
  const scored = [];
  gaps.forEach((gap) => {
    const ranked = fuel
      .map((item) => {
        const link = scorePairLink(gap, item);
        return { item, link, score: scoreGapFuel(gap, item, reader, typeWeights, link) };
      })
      .filter((entry) => entry.score >= 0.22)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    ranked.forEach((entry, index) => {
      scored.push({
        ...entry.item,
        candidateId: entry.item.id,
        forGapId: gap.id,
        linkReason: entry.link.reason,
        linkScore: entry.link.score,
        fuseScore: entry.score + (1 / (index + 1)) * 0.05,
      });
    });
  });

  return dedupeFuel(scored)
    .sort((a, b) => (b.fuseScore || b.strength) - (a.fuseScore || a.strength))
    .slice(0, MAX_CANDIDATES);
}

function matchBridgesLocal(gaps, candidates, mode, reader = null, bias = null) {
  const typeWeights = bias || typeBias();
  const bridges = [];
  const usedCandidates = new Set();
  const threshold = mode === "manual" ? 0.3 : 0.34;
  const sortedGaps = [...gaps].sort((a, b) => b.importance - a.importance);

  const pushBridge = (gap, item, score) => {
    const candidateId = item.candidateId || item.id;
    if (!gap || !candidateId || usedCandidates.has(candidateId)) return false;
    usedCandidates.add(candidateId);
    bridges.push({
      id: `bridge-${bridges.length + 1}`,
      gapId: gap.id,
      candidateId,
      title: clip(item.title, 16),
      whyNeeded: whyNeededText(gap, item),
      gapKind: gap.kind,
      evidence: item.evidence,
      linkReason: item.linkReason || scorePairLink(gap, item).reason,
      score,
    });
    return true;
  };

  sortedGaps.forEach((gap) => {
    const best = candidates
      .filter((item) => !usedCandidates.has(item.candidateId || item.id))
      .map((item) => ({ item, score: scoreGapFuel(gap, item, reader, typeWeights) }))
      .filter((entry) => entry.score >= threshold)
      .sort((a, b) => b.score - a.score)[0];
    if (best) pushBridge(gap, best.item, best.score);
  });

  return bridges;
}

function whyNeededText(gap, candidate) {
  const label = gap.label;
  if (gap.kind === "person" || gap.kind === "relation") {
    return `本页提到「${clip(label, 16)}」，需先接上其身份或关系。`;
  }
  if (gap.kind === "causal") {
    return `本页因果未明，需先想起：${clip(candidate.title, 16)}。`;
  }
  if (gap.kind === "intent") {
    return `本页涉及意图/决定，需先接上：${clip(candidate.title, 16)}。`;
  }
  if (gap.kind === "concept") {
    return `本页用到「${clip(label, 16)}」，需先想起其含义。`;
  }
  if (gap.kind === "spatial") {
    return `本页场景落到「${clip(label, 16)}」，需先接上此前位置变化。`;
  }
  if (gap.kind === "temporal") {
    return `本页承接此前阶段，需先想起：${clip(candidate.title, 16)}。`;
  }
  return `读懂本页前，先接上：${clip(candidate.title, 16)}。`;
}

function scoreGapFuel(gap, item, reader = null, bias = null, knownLink = null) {
  if (!gap || !item) return 0;
  const link = knownLink || scorePairLink(gap, item);
  if (!link.ok) return 0;
  const typeWeights = bias || typeBias();
  const kindFactor = Number(typeWeights[gap.kind]) || 1;
  const kindBonus = (item.gapKinds || []).includes(gap.kind) ? 0.14 * kindFactor : 0;
  const strength = Number(item.strength) || 0.3;
  const traceBonus = item.channel === "readerTrace" ? 0.08 : 0;
  const explanatoryBonus = explanatoryChannelBonus(gap.kind, item.channel);
  const readerDelta = readerSignalDelta(item.id || item.candidateId, reader);
  const assetDelta = readerAssetSignalDelta(item.id || item.candidateId, reader);
  return Math.min(1.4, link.score + kindBonus + strength * 0.22 + traceBonus + explanatoryBonus + readerDelta + assetDelta);
}

/**
 * A strong Memory is not automatically a useful bridge. This gate proves that
 * the candidate and the current-page dependency share an evidenced anchor.
 */
function scorePairLink(gap, item) {
  if (!gap || !item || !hasUsableBridgeEvidence(item.evidence)) return { ok: false, score: 0, reason: null };
  const label = compactForLink(gap.label);
  const context = compactForLink(`${gap.context || ""} ${gap.label || ""}`);
  const title = compactForLink(item.title);
  const candidateSource = `${item.title || ""} ${item.snippet || ""} ${item.evidence?.quote || item.evidence?.excerpt || ""}`;
  if (IRRELEVANCE_MARK.test(candidateSource)) return { ok: false, score: 0, reason: null };
  const candidate = compactForLink(candidateSource);
  if (!title || !candidate || !context) return { ok: false, score: 0, reason: null };

  if ((title.length >= 2 && context.includes(title)) || (label.length >= 2 && candidate.includes(label))) {
    return { ok: true, score: 0.58, reason: "direct-anchor" };
  }

  const contextTerms = significantTerms(context);
  const titleTerms = significantTerms(title);
  const candidateTerms = significantTerms(candidate);
  const titleHits = [...titleTerms].filter((term) => contextTerms.has(term));
  if (titleHits.length >= 1) {
    return { ok: true, score: Math.min(0.54, 0.42 + titleHits.length * 0.04), reason: "title-overlap" };
  }

  const shared = [...contextTerms].filter((term) => candidateTerms.has(term));
  if (shared.length >= 2) {
    return { ok: true, score: Math.min(0.5, 0.32 + shared.length * 0.035), reason: "context-overlap" };
  }
  return { ok: false, score: 0, reason: null };
}

function explanatoryChannelBonus(gapKind, channel) {
  if (["causal", "intent", "temporal", "state"].includes(gapKind) && ["causal", "intent", "proximity"].includes(channel)) return 0.08;
  if (gapKind === "concept" && channel === "concept") return 0.08;
  if (gapKind === "spatial" && channel === "spatial") return 0.06;
  if (["person", "relation"].includes(gapKind) && ["entity", "causal"].includes(channel)) return 0.05;
  return 0;
}

function hasUsableBridgeEvidence(evidence) {
  if (!evidence) return false;
  const quote = normaliseText(evidence.quote || evidence.excerpt || evidence.cite?.quote || "");
  return quote.length >= 4;
}

function significantTerms(value) {
  const text = normaliseText(value).toLowerCase();
  const terms = new Set(tokenize(text).filter((term) => !LINK_STOP_TERMS.has(term)));
  const runs = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  runs.forEach((run) => {
    const maxSize = Math.min(4, run.length);
    for (let size = 2; size <= maxSize; size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        const term = run.slice(index, index + size);
        if (!LINK_STOP_TERMS.has(term)) terms.add(term);
      }
    }
  });
  return terms;
}

function compactForLink(value) {
  return normaliseText(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "");
}

function sentenceContaining(text, needle) {
  const sentence = normaliseText(text).split(/[。！？!?]/).find((part) => part.includes(needle));
  return sentence || normaliseText(text);
}

/** Secondary Reader Memory signal only; never replaces gap fit. */
function readerSignalDelta(key, reader) {
  return readerSignalDeltaForKeys([key], reader);
}

function readerSignalDeltaForKeys(keys, reader) {
  if (!reader || !keys?.length) return 0;
  let missed = 0;
  let remembered = 0;
  for (const key of keys) {
    if (!key) continue;
    if (reader?.missedKeys?.includes(key)) missed = 0.12;
    if (reader?.rememberedKeys?.includes(key)) remembered = -0.06;
  }
  return Math.max(-0.08, Math.min(0.15, missed + remembered));
}

function channelForMemoryItem(item) {
  if (item.kind === "place") return "spatial";
  if (item.kind === "person" || item.kind === "organization") return "entity";
  if (item.kind === "event" || item.kind === "scene" || item.kind === "timepoint") return "causal";
  if (item.kind === "claim" || item.kind === "conclusion" || item.kind === "reason") return "intent";
  if (item.kind === "concept" || item.kind === "definition" || item.kind === "mechanism" || item.kind === "framework") return "concept";
  return "entity";
}

function kindsForChannel(channel) {
  return {
    entity: ["person", "relation"],
    causal: ["causal", "temporal", "state"],
    intent: ["intent", "causal"],
    concept: ["concept"],
    spatial: ["spatial"],
    readerTrace: ["person", "relation", "causal", "concept", "state", "intent"],
    proximity: ["causal", "state", "temporal", "person"],
  }[channel] || ["state"];
}

function memoryStrength(item, reader) {
  const priority = item.priority === "primary" ? 0.7 : item.priority === "recent" ? 0.55 : 0.4;
  const mainline = ACTION_HINT.test(item.summary || "") ? 0.15 : 0;
  const forgetting = readerForgettingScore({ memoryKey: item.id, reader }) * 0.12;
  // Fuel ids are `mem:${id}`; feedback keys from cards use the same form.
  const readerDelta = readerSignalDeltaForKeys([`mem:${item.id}`, item.id], reader);
  return Math.min(1, Math.max(0, priority + mainline + forgetting + readerDelta));
}

function recentParagraphFuel(book, cursor) {
  const items = [];
  const chapters = book?.chapters || [];
  let remaining = 8;
  for (let chapterIndex = cursor.chapterIndex; chapterIndex >= 0 && remaining > 0; chapterIndex -= 1) {
    const paragraphs = chapters[chapterIndex]?.paragraphs || [];
    const end = chapterIndex === cursor.chapterIndex
      ? Number(cursor.paragraphIndex || 0) - 1
      : paragraphs.length - 1;
    for (let paragraphIndex = end; paragraphIndex >= 0 && remaining > 0; paragraphIndex -= 1) {
      const raw = paragraphs[paragraphIndex];
      const text = normaliseText(typeof raw === "object" ? raw.text : raw);
      if (!text || text.length < 18) continue;
      if (!ACTION_HINT.test(text) && !CAUSAL_MARK.test(text) && !INTENT_MARK.test(text)) continue;
      items.push({
        id: `para:${chapterIndex}:${paragraphIndex}`,
        channel: "proximity",
        title: clip(text, 24),
        snippet: clip(text, 80),
        strength: 0.42,
        gapKinds: kindsForChannel("proximity"),
        evidence: {
          id: `para-${chapterIndex}-${paragraphIndex}`,
          memoryKey: `para:${chapterIndex}:${paragraphIndex}`,
          chapterIndex,
          paragraphIndex,
          chapterTitle: chapters[chapterIndex]?.title || "",
          excerpt: clip(text, 160),
          quote: clip(text, 160),
          cite: { label: "[P]", quote: clip(text, 160) },
          matchSources: ["situation-bridge"],
        },
        priority: "secondary",
      });
      remaining -= 1;
    }
  }
  return items;
}

function evidenceFromAnchor(book, anchor, snippet) {
  const chapterIndex = Math.max(0, Number(anchor.chapterIndex) || 0);
  const paragraphIndex = Math.max(0, Number(anchor.paragraphIndex) || 0);
  const quote = clip(snippet || anchor.selection || anchor.body || "", 160);
  return {
    id: `anchor-${chapterIndex}-${paragraphIndex}-${quote.slice(0, 12)}`,
    memoryKey: `anchor:${chapterIndex}:${paragraphIndex}`,
    chapterIndex,
    paragraphIndex,
    chapterTitle: book?.chapters?.[chapterIndex]?.title || "",
    excerpt: quote,
    quote,
    cite: { label: "[R]", quote },
    matchSources: ["situation-bridge"],
  };
}

function nearParagraphSnippet(book, anchor) {
  const chapter = book?.chapters?.[anchor.chapterIndex];
  const paragraph = chapter?.paragraphs?.[anchor.paragraphIndex];
  return normaliseText(typeof paragraph === "object" ? paragraph?.text : paragraph);
}

function isBeforeCursor(item, cursor) {
  const hasChapter = item.chapterIndex !== null && item.chapterIndex !== undefined && item.chapterIndex !== "";
  const chapterIndex = hasChapter ? Number(item.chapterIndex) : Number.NaN;
  const hasParagraph = item.paragraphIndex !== null && item.paragraphIndex !== undefined && item.paragraphIndex !== "";
  const paragraphIndex = hasParagraph ? Number(item.paragraphIndex) : Number.NaN;
  if (!Number.isInteger(chapterIndex)) return false;
  if (chapterIndex < cursor.chapterIndex) return true;
  if (chapterIndex > cursor.chapterIndex) return false;
  if (Number.isInteger(paragraphIndex)) return paragraphIndex < Number(cursor.paragraphIndex || 0);
  const hasPage = item.pageIndex !== null && item.pageIndex !== undefined && item.pageIndex !== "";
  const pageIndex = hasPage ? Number(item.pageIndex) : Number.NaN;
  if (Number.isInteger(pageIndex)) return pageIndex < Number(cursor.pageIndex || 0);
  return false;
}

function readerAssetSignalDelta(key, reader) {
  if (!key || !reader) return 0;
  if (String(key).startsWith("note:") && reader.noteRefs?.includes(key)) return 0.06;
  if (String(key).startsWith("explain:") && reader.explainRefs?.includes(key)) return 0.06;
  if (String(key).startsWith("bookmark:") && reader.bookmarkRefs?.includes(key)) return 0.035;
  return 0;
}

function isEvidenceBeforeCursor(evidence, cursor) {
  if (!evidence) return false;
  return isBeforeCursor({
    chapterIndex: evidence.chapterIndex,
    paragraphIndex: evidence.paragraphIndex,
    pageIndex: evidence.pageIndex,
  }, cursor);
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
    cite: evidence.cite || { label: "[M]", quote },
    matchSources: ["situation-bridge"],
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

function dedupeFuel(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.id || `${item.title}:${item.snippet}`;
    const prev = map.get(key);
    if (!prev || (item.fuseScore || item.strength) > (prev.fuseScore || prev.strength)) map.set(key, item);
  });
  return [...map.values()];
}

function hasRecoverablePriorContext(cursor) {
  if (!cursor) return false;
  if (Number(cursor.chapterIndex) > 0 || Number(cursor.pageIndex) > 0) return true;
  return Number(cursor.paragraphIndex || 0) >= 2;
}

function describeAbsence(lastActivity) {
  if (!lastActivity) {
    return { intensity: "fresh", label: "继续阅读前" };
  }
  const elapsed = Date.now() - Number(lastActivity);
  if (elapsed < 24 * 60 * 60 * 1000) return { intensity: "light", label: "不久前读到这里" };
  if (elapsed < 3 * 24 * 60 * 60 * 1000) return { intensity: "medium", label: "离开一段时间了" };
  return { intensity: "deep", label: "很久没读了" };
}

function normalizeCursor(cursor = {}) {
  return {
    chapterIndex: Math.max(0, Number(cursor.chapterIndex) || 0),
    pageIndex: Math.max(0, Number(cursor.pageIndex) || 0),
    paragraphIndex: Math.max(0, Number(cursor.paragraphIndex) || 0),
  };
}

function suppressedPlan(reason, absence) {
  return {
    suppressed: true,
    reason,
    intensity: absence?.intensity || "fresh",
    absenceLabel: absence?.label || "继续阅读前",
    positionLabel: "",
    gaps: [],
    bridges: [],
    question: null,
    evidence: [],
    candidates: [],
  };
}

function tokenize(text) {
  return normaliseText(text)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2)
    .slice(0, 40);
}

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clip(value, max) {
  const text = normaliseText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
