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
  questionFromEpisodeAnchor,
} from "./recoveryQuality.js";

const NOISE_PATTERNS = /出生|生于|逝世|享年|出版|印刷|译者|版权|ISBN|目录|字数|开本|印张|邮编|新华书店|版本图书馆|CIP数据|http:\/\/|www\./i;
const ACTION_HINT = /决定|命令|出发|抵达|进入|离开|转移|会合|冲突|战斗|失败|胜利|证明|导致|形成|改变|提出|主张|发现|背叛|结盟|突破|撤退|起义|谈判|部署|会议|包围|突围|进攻|防守|会师|定义|反驳|cause|decide|order|attack|retreat|define|prove|claim/i;
const CAUSAL_MARK = /因此|于是|所以|导致|因为|由于|使得|造成|结果|随后|接着|为了|却|但是|然而/;
const INTENT_MARK = /决定|命令|主张|计划|目标|反对|要求|下令|部署|企图|想要/;
const TEMPORAL_MARK = /此前|之后|当时|此刻|翌日|次日|同年|那年|阶段|之前|后来/;
const SPATIAL_MARK = /抵达|离开|进入|驻|进驻|退往|向|在.{1,8}(城|镇|县|省|山|河|江|湖|村|市)/;

const MAX_GAPS = 6;
const MAX_CANDIDATES = 12;
const MAX_BRIDGES_AUTO = 2;
const MAX_BRIDGES_SHOW = 3;

/**
 * Phase A+B: local shortlist + optional LLM adjudicator input.
 * Never dumps prior chapters — only gaps and ≤12 short candidates.
 */
export function prepareSituationBridgeShortlist({
  book = null,
  bookMemory = null,
  cursor = null,
  currentPageText = "",
  lastActivity = null,
  reader = null,
  notes = [],
  explains = [],
  bookmarks = [],
  mode = "auto",
  minAbsenceMs = 0,
} = {}) {
  const absence = describeAbsence(lastActivity);
  const normalizedCursor = normalizeCursor(cursor);
  const memory = normalizeBookMemory(bookMemory || {});

  if (mode === "auto" && minAbsenceMs > 0 && Number(lastActivity || 0) && Date.now() - Number(lastActivity) < minAbsenceMs) {
    return suppressedPlan("recent-activity", absence);
  }
  if (!book?.chapters?.length || !hasRecoverablePriorContext(normalizedCursor)) {
    return suppressedPlan("low-context", absence);
  }

  const pageText = normaliseText(currentPageText || extractCurrentPageText(book, normalizedCursor));
  const gaps = extractPageGaps(pageText, memory, normalizedCursor);
  if (!gaps.length) return suppressedPlan("page-not-dependent", absence);

  const fuel = collectRecallFuel({
    book,
    bookMemory: memory,
    cursor: normalizedCursor,
    notes,
    explains,
    bookmarks,
    reader,
    pageText,
  });
  if (!fuel.length) return suppressedPlan("no-bridges", absence);

  const offer = shouldOfferSituationBridge({ gaps, fuel, mode });
  if (!offer.ok) return suppressedPlan(offer.reason, absence);

  const candidates = fuseCandidates(gaps, fuel).slice(0, MAX_CANDIDATES);
  if (candidates.length < 2) return suppressedPlan("no-bridges", absence);

  const localBridges = matchBridgesLocal(gaps, candidates, mode);
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
    })),
    candidates: candidates.map((item) => ({
      id: item.candidateId || item.id,
      title: clip(item.title, 24),
      snippet: clip(item.snippet, 80),
      channel: item.channel,
      forGapId: item.forGapId || null,
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

  const minBridges = shortlist.mode === "manual" ? 2 : MAX_BRIDGES_AUTO;
  const judgedBridges = Array.isArray(judgement?.bridges) ? judgement.bridges : null;
  const usedJudged = Boolean(judgedBridges && judgedBridges.length >= minBridges);
  const bridges = (usedJudged ? judgedBridges : shortlist.localBridges || [])
    .slice(0, MAX_BRIDGES_SHOW);
  if (bridges.length < minBridges) {
    return suppressedPlan(judgedBridges ? "low-confidence" : "no-bridges", {
      intensity: shortlist.intensity,
      label: shortlist.absenceLabel,
    });
  }

  const chapterTitle = shortlist.chapterTitle || "";
  const questionFromJudge = usedJudged && judgement?.question?.candidateId
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
    })),
    candidates: (shortlist.candidates || []).slice(0, MAX_CANDIDATES).map((item) => ({
      id: item.id,
      title: item.title,
      snippet: item.snippet,
      channel: item.channel || "",
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
      const whyNeeded = clip(item.whyNeeded || whyNeededText(gap, candidate), 72);
      const title = clip(item.title || candidate.title, 16);
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

export function shouldOfferSituationBridge({ gaps = [], fuel = [], mode = "auto" } = {}) {
  if (!gaps.length) return { ok: false, reason: "page-not-dependent" };
  const importantGaps = gaps.filter((gap) => gap.importance >= (mode === "manual" ? 0.35 : 0.45));
  if (!importantGaps.length) return { ok: false, reason: "low-importance-gaps" };

  const strongFuel = fuel.filter((item) => item.strength >= (mode === "manual" ? 0.35 : 0.42));
  const canCover = importantGaps.some((gap) => strongFuel.some((item) => scoreGapFuel(gap, item) >= 0.28));
  if (!canCover) return { ok: false, reason: "low-importance-gaps" };
  return { ok: true, reason: null };
}

export function situationBridgeToRecoveryCard(plan) {
  if (!plan || plan.suppressed || !plan.bridges?.length) return null;
  return {
    intensity: plan.intensity,
    absenceLabel: plan.absenceLabel,
    positionLabel: plan.positionLabel,
    bridges: plan.bridges,
    gaps: plan.gaps,
    keyPoints: plan.bridges.map((item, index) => ({
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

function extractPageGaps(pageText, memory, cursor) {
  const text = normaliseText(pageText);
  if (text.length < 24) return [];

  const gaps = [];
  const pushGap = (label, kind, importance) => {
    const clean = clip(normaliseText(label), 40);
    if (!clean || clean.length < 2) return;
    if (isBroadMegaTopic(clean) && importance < 0.7) return;
    if (NOISE_PATTERNS.test(clean)) return;
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
      if (clean.length + 4 < existing.label.length && existing.label.includes(clean) && importance >= existing.importance - 0.05) {
        gaps[dupIndex] = {
          id: existing.id,
          label: clean,
          kind,
          importance: Math.min(1, Math.max(existing.importance, importance)),
        };
      }
      return;
    }
    gaps.push({
      id: `gap-${gaps.length + 1}`,
      label: clean,
      kind,
      importance: Math.min(1, importance),
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
    pushGap(name, kind, importance);
  });

  extractLooseNames(text).forEach((name) => {
    pushGap(name, "person", 0.48);
  });

  if (CAUSAL_MARK.test(text)) {
    const clause = text.split(/[。！？!?]/).find((part) => CAUSAL_MARK.test(part));
    if (clause) pushGap(clip(clause, 36), "causal", 0.7);
  }
  if (INTENT_MARK.test(text)) {
    const clause = text.split(/[。！？!?]/).find((part) => INTENT_MARK.test(part));
    if (clause) pushGap(clip(clause, 36), "intent", 0.62);
  }
  if (TEMPORAL_MARK.test(text)) {
    pushGap("此前阶段如何接到此刻", "temporal", 0.5);
  }
  if (SPATIAL_MARK.test(text)) {
    const placeHit = entityNames.find((name) => text.includes(name) && (scoped.entities || []).some((item) => item.kind === "place" && normaliseText(item.name) === name));
    if (placeHit) pushGap(placeHit, "spatial", 0.55);
  }

  const conceptHints = (scoped.topics || []).concat(scoped.arguments || [])
    .map((item) => normaliseText(item.name || item.title))
    .filter((name) => name.length >= 2 && text.includes(name));
  conceptHints.slice(0, 3).forEach((name) => pushGap(name, "concept", 0.6));

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
    fuel.push({
      id: `mem:${item.id}`,
      channel,
      title: clip(item.name, 24),
      snippet: clip(item.summary, 80),
      strength: memoryStrength(item, reader),
      gapKinds: kindsForChannel(channel),
      evidence: toEvidence(item),
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

  // Drop fuel that shares almost no lexical contact with page or gaps later; keep for now.
  void pageText;
  return dedupeFuel(fuel).sort((a, b) => b.strength - a.strength);
}

function fuseCandidates(gaps, fuel) {
  const scored = [];
  gaps.forEach((gap) => {
    const ranked = fuel
      .map((item) => ({ item, score: scoreGapFuel(gap, item) }))
      .filter((entry) => entry.score >= 0.22)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    ranked.forEach((entry, index) => {
      scored.push({
        ...entry.item,
        candidateId: entry.item.id,
        forGapId: gap.id,
        fuseScore: entry.score + (1 / (index + 1)) * 0.05,
      });
    });
  });

  // Global top-ups so strong fuel not tied to a gap still can appear (weak).
  fuel.slice(0, 4).forEach((item) => {
    if (scored.some((entry) => entry.id === item.id)) return;
    scored.push({
      ...item,
      candidateId: item.id,
      forGapId: gaps[0]?.id || null,
      fuseScore: item.strength * 0.5,
    });
  });

  return dedupeFuel(scored)
    .sort((a, b) => (b.fuseScore || b.strength) - (a.fuseScore || a.strength))
    .slice(0, MAX_CANDIDATES);
}

function matchBridgesLocal(gaps, candidates, mode) {
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
      score,
    });
    return true;
  };

  sortedGaps.forEach((gap) => {
    const best = candidates
      .filter((item) => !usedCandidates.has(item.candidateId || item.id))
      .map((item) => ({ item, score: scoreGapFuel(gap, item) }))
      .filter((entry) => entry.score >= threshold)
      .sort((a, b) => b.score - a.score)[0];
    if (best) pushBridge(gap, best.item, best.score);
  });

  // One gap must not cap the card at a single bridge when other strong candidates remain.
  if (bridges.length && bridges.length < MAX_BRIDGES_AUTO) {
    const fillGap = sortedGaps[0];
    candidates
      .filter((item) => !usedCandidates.has(item.candidateId || item.id))
      .map((item) => ({ item, score: scoreGapFuel(fillGap, item) }))
      .filter((entry) => entry.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .forEach((entry) => {
        if (bridges.length >= MAX_BRIDGES_SHOW) return;
        pushBridge(fillGap, entry.item, entry.score);
      });
  }

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

function scoreGapFuel(gap, item) {
  if (!gap || !item) return 0;
  const kindBonus = (item.gapKinds || []).includes(gap.kind) ? 0.22 : 0;
  const label = normaliseText(gap.label);
  const hay = normaliseText(`${item.title} ${item.snippet}`);
  let overlap = 0;
  if (label && hay.includes(label)) overlap += 0.5;
  tokenize(label).forEach((token) => {
    if (token.length >= 2 && hay.includes(token)) overlap += 0.08;
  });
  const strength = Number(item.strength) || 0.3;
  const traceBonus = item.channel === "readerTrace" ? 0.12 : 0;
  return Math.min(1.4, overlap + kindBonus + strength * 0.45 + traceBonus);
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
  return Math.min(1, priority + mainline + forgetting);
}

function recentParagraphFuel(book, cursor) {
  const items = [];
  const chapters = book?.chapters || [];
  let remaining = 8;
  for (let chapterIndex = cursor.chapterIndex; chapterIndex >= 0 && remaining > 0; chapterIndex -= 1) {
    const paragraphs = chapters[chapterIndex]?.paragraphs || [];
    const end = chapterIndex === cursor.chapterIndex
      ? Math.max(0, Number(cursor.paragraphIndex || 0) - 1)
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
  const chapterIndex = Number(item.chapterIndex);
  const paragraphIndex = Number(item.paragraphIndex);
  if (!Number.isInteger(chapterIndex)) return true;
  if (chapterIndex < cursor.chapterIndex) return true;
  if (chapterIndex > cursor.chapterIndex) return false;
  if (!Number.isInteger(paragraphIndex)) return true;
  return paragraphIndex <= Number(cursor.paragraphIndex || 0);
}

function extractCurrentPageText(book, cursor) {
  const chapter = book?.chapters?.[cursor?.chapterIndex];
  if (!chapter) return "";
  const paragraphs = chapter.paragraphs || [];
  const end = Math.min(paragraphs.length - 1, Number(cursor.paragraphIndex ?? paragraphs.length - 1));
  const start = Math.max(0, end - 2);
  return paragraphs.slice(start, end + 1).map((item) => (typeof item === "object" ? item.text : item)).filter(Boolean).join("\n");
}

function extractLooseNames(text) {
  const names = [];
  const re = /([一-龥]{2,4})(?:说|道|问|答|命令|决定|率|带|在|向|对)/g;
  let match = re.exec(text);
  while (match) {
    names.push(match[1]);
    match = re.exec(text);
  }
  return [...new Set(names)].slice(0, 4);
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
