import "dotenv/config";
import express from "express";
import { ChatOpenAI } from "@langchain/openai";
import { BOOK_TYPES } from "./src/bookTaxonomy.js";
import { resolveTraceProfile, traceProfileForPrompt } from "./src/traceProfiles.js";
import {
  bookMemoryFromLegacy,
  compatibilityTraceMemory,
  mergeBookMemory,
  normalizeBookMemory,
  readingIndexFromBookMemory,
} from "./src/memoryModels.js";
import {
  hasConcreteEpisodeCue,
  isBroadMegaTopic,
  isWeakRecoveryHint,
  preferQuestionAnchor,
  questionFromEpisodeAnchor,
  sanitizeModelRecoveryQuestion,
  sortEvidenceByCursorProximity,
} from "./src/recoveryQuality.js";

const app = express();
app.use(express.json({ limit: "12mb" }));
const TRACE_ACTION_WORDS = /出发|抵达|进入|离开|命令|决定|转移|撤退|突围|会合|指挥|率领|带领|阻击|战斗|冲突|失败|胜利|发现|看见|证明|导致|形成|改变|抛弃|召开|警觉|迂回|接敌|掩护|杀开|翻译|移动|通过|追赶|牺牲/;

const PROVIDERS = {
  deepseek: {
    apiKey: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    recoveryModel: "deepseek-v4-pro",
  },
  openai: {
    apiKey: "OPENAI_API_KEY",
    baseURL: undefined,
    defaultModel: "gpt-4.1-mini",
    recoveryModel: "gpt-4.1-mini",
  },
};

/** Default model for continued-reading recovery cards (DeepSeek Pro + thinking). */
const DEFAULT_RECOVERY_MODEL = "deepseek-v4-pro";

function createModelClient({ provider, model, thinking = false }) {
  const config = PROVIDERS[provider];
  const resolvedModel = model || config.defaultModel;
  const modelKwargs = thinking && provider === "deepseek"
    ? { thinking: { type: "enabled" }, reasoning_effort: "high" }
    : undefined;
  return {
    model: resolvedModel,
    client: new ChatOpenAI({
      apiKey: process.env[config.apiKey],
      model: resolvedModel,
      // Thinking mode ignores sampling params; omit temperature when enabled.
      ...(thinking ? {} : { temperature: 0 }),
      maxTokens: thinking ? 8192 : undefined,
      timeout: thinking ? 180_000 : 60_000,
      configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
      modelKwargs,
    }),
  };
}

function resolveRecoveryModel(provider, model) {
  const config = PROVIDERS[provider];
  if (model && String(model).trim()) return String(model).trim();
  return config?.recoveryModel || DEFAULT_RECOVERY_MODEL;
}

app.get("/api/health", (_request, response) => response.json({ ok: true }));

app.post("/api/classify-book", async (request, response) => {
  const { provider = "deepseek", model, book } = request.body || {};
  const config = PROVIDERS[provider];
  if (!config) return response.status(400).json({ error: "Unsupported model provider" });
  if (!book?.title) return response.status(400).json({ error: "Missing book metadata" });

  const apiKey = process.env[config.apiKey];
  if (!apiKey) return response.status(400).json({ error: `Please configure ${config.apiKey} in .env first` });

  try {
    const { client: modelClient, model: resolvedModel } = createModelClient({ provider, model });
    const result = await modelClient.invoke([
      ["system", "You classify books for a quiet AI reading app. Return compact JSON only, with no Markdown."],
      ["human", buildClassificationPrompt(book)],
    ]);
    const parsed = parseJson(messageContent(result));
    const profile = normaliseProfile(parsed, { strict: true });
    if (!profile) {
      return response.status(422).json({ error: "Model returned no usable book type" });
    }
    response.json({ provider, model: resolvedModel, profile, reason: displayText(parsed.reason).slice(0, 140) });
  } catch (error) {
    response.status(502).json({ error: error.message || "Book classification failed" });
  }
});

app.post("/api/recovery-card", async (request, response) => {
  const {
    provider = "deepseek",
    model,
    thinking = true,
    book,
    cursor,
    traceProfile,
    bookMemory,
    traceMemory,
    evidence = [],
    currentText = [],
  } = request.body || {};
  const config = PROVIDERS[provider];
  if (!config) return response.status(400).json({ error: "Unsupported model provider" });
  if (!book?.title) return response.status(400).json({ error: "Missing book metadata" });
  if (!Array.isArray(evidence) || !evidence.length) return response.status(400).json({ error: "Missing ContextCite evidence" });

  const apiKey = process.env[config.apiKey];
  if (!apiKey) return response.status(400).json({ error: `Please configure ${config.apiKey} in .env first` });

  const useThinking = provider === "deepseek" && thinking !== false;
  const recoveryModel = resolveRecoveryModel(provider, model);

  try {
    const { client: modelClient, model: resolvedModel } = createModelClient({
      provider,
      model: recoveryModel,
      thinking: useThinking,
    });
    const memory = normalizeBookMemory(bookMemory || traceMemory || {}, { bookId: book.id || book.title, cursor, traceProfile });
    const result = await modelClient.invoke([
      ["system", "You create concise, evidence-backed continued-reading memory cards. Use only supplied ContextCite evidence. Prefer concrete near-checkpoint episodes over mega-topics. Return JSON only, no Markdown."],
      ["human", buildRecoveryCardPrompt({ book, cursor, traceProfile, bookMemory: memory, evidence, currentText })],
    ]);
    const parsed = parseJson(messageContent(result));
    const card = normaliseRecoveryCard(parsed, evidence, book, cursor);
    if (!card || card.keyPoints.length < 2) {
      return response.status(422).json({
        error: "Recovery card failed evidence contract",
        fallback: true,
        model: resolvedModel,
        thinking: useThinking,
      });
    }
    response.json({
      provider,
      model: resolvedModel,
      thinking: useThinking,
      card,
    });
  } catch (error) {
    response.status(502).json({ error: error.message || "Recovery card generation failed" });
  }
});

app.post("/api/explain-selection", async (request, response) => {
  const {
    provider = "deepseek",
    model,
    thinking = false,
    mode = "meaning",
    selection = "",
    book,
    cursor,
    bookMemory,
    evidence = [],
  } = request.body || {};
  const allowed = new Set(["entity", "meaning", "concept", "context"]);
  if (!allowed.has(mode)) return response.status(400).json({ error: "Unsupported explain mode" });
  const config = PROVIDERS[provider];
  if (!config) return response.status(400).json({ error: "Unsupported model provider" });
  const text = String(selection || "").trim();
  if (!text) return response.status(400).json({ error: "Missing selection text" });
  if (!book?.title) return response.status(400).json({ error: "Missing book metadata" });
  if (!Array.isArray(evidence) || !evidence.length) return response.status(400).json({ error: "Missing ContextCite evidence" });

  const apiKey = process.env[config.apiKey];
  if (!apiKey) return response.status(400).json({ error: `Please configure ${config.apiKey} in .env first` });

  const useThinking = provider === "deepseek" && thinking === true;
  const resolvedRequestModel = model
    || (useThinking ? (config.recoveryModel || DEFAULT_RECOVERY_MODEL) : config.defaultModel);

  try {
    const { client: modelClient, model: resolvedModel } = createModelClient({
      provider,
      model: resolvedRequestModel,
      thinking: useThinking,
    });
    const memory = normalizeBookMemory(bookMemory || {}, { bookId: book.id || book.title, cursor });
    const result = await modelClient.invoke([
      ["system", "You are a quiet reading assistant for Shumai. Explain only from the selection, supplied evidence, and read-bounded memory. Return JSON only, no Markdown."],
      ["human", buildSelectionExplainPrompt({ mode, selection: text, book, cursor, bookMemory: memory, evidence })],
    ]);
    const parsed = parseJson(messageContent(result));
    const explanation = normaliseSelectionExplanation(parsed, mode, evidence);
    if (!explanation?.answer) {
      return response.status(422).json({
        error: "Explain selection failed contract",
        fallback: true,
        model: resolvedModel,
        thinking: useThinking,
      });
    }
    response.json({ provider, model: resolvedModel, thinking: useThinking, explanation });
  } catch (error) {
    response.status(502).json({ error: error.message || "Explain selection failed" });
  }
});

app.post("/api/analyze", async (request, response) => {
  const {
    provider = "deepseek",
    model,
    book,
    previousBookMemory,
    previousIndex,
    previousTraceMemory,
    cursor,
    scope = "read",
    traceProfile,
    candidates = [],
    supportingEvidence = [],
  } = request.body || {};
  const evidence = Array.isArray(supportingEvidence) ? supportingEvidence : [];
  const config = PROVIDERS[provider];
  if (!config) return response.status(400).json({ error: "Unsupported model provider" });
  if (!book?.chapters?.length) return response.status(400).json({ error: "Missing readable book content" });

  const apiKey = process.env[config.apiKey];
  if (!apiKey) return response.status(400).json({ error: `Please configure ${config.apiKey} in .env first` });

  try {
    const { client: modelClient, model: resolvedModel } = createModelClient({ provider, model });
    const activeTraceProfile = traceProfile || traceProfileForPrompt(resolveTraceProfile(book.bookType, book.indexSchema || []));
    const priorMemory = resolvePreviousBookMemory({
      previousBookMemory,
      previousIndex,
      previousTraceMemory,
      book,
      traceProfile: activeTraceProfile,
    });
    const result = await modelClient.invoke([
      ["system", "You are a rigorous AI Trace reading analyzer. Use only the supplied original text, candidates, and ContextCite evidence. Do not invent or guess. Return JSON only, no Markdown."],
      ["human", buildTraceAnalysisPrompt(book, priorMemory, cursor, scope, activeTraceProfile, candidates, evidence)],
    ]);
    const parsed = parseJson(messageContent(result));
    const index = normaliseIndex(parsed, book.chapters);
    const profile = normaliseProfile(parsed.bookProfile);
    const bookMemory = buildBookMemoryFromAnalysis({
      parsed,
      index,
      profile,
      cursor,
      traceProfile: activeTraceProfile,
      supportingEvidence: evidence,
      previousBookMemory: priorMemory,
      bookId: book.id || book.title || "book",
    });
    const projectedIndex = readingIndexFromBookMemory(bookMemory);
    response.json({
      provider,
      model: resolvedModel,
      bookMemory,
      index: projectedIndex,
      profile,
      traceProfile: activeTraceProfile,
      traceMemory: compatibilityTraceMemory(bookMemory),
      summary: buildSummary(projectedIndex, cursor),
    });
  } catch (error) {
    response.status(502).json({ error: error.message || "AI Trace analysis failed" });
  }
});

function buildSelectionExplainPrompt({ mode, selection, book, cursor, bookMemory, evidence }) {
  const cites = evidence.slice(0, 12).map((item, index) => ({
    ref: item.cite?.label || item.ref || `[C${index + 1}]`,
    id: item.cite?.id || item.id || `C${index + 1}`,
    chapterIndex: item.chapterIndex,
    paragraphIndex: item.paragraphIndex,
    chapterTitle: item.chapterTitle,
    quote: item.quote || item.cite?.quote || item.excerpt,
  }));
  const modeGuide = {
    entity:
      "Mode entity: give a short introduction for the selected person/place/organization/term as it appears in THIS book. Prefer role, affiliation, and narrative function over encyclopedic biography.",
    meaning:
      "Mode meaning: explain the deeper meaning, implication, or philosophical/thematic force of the selected passage. Stay faithful to the text; do not invent doctrines not grounded in evidence.",
    concept:
      "Mode concept: define the selected concept or term as used in this book. Distinguish book-local usage from general dictionary sense when evidence supports it.",
    context:
      "Mode context: explain the immediate causal frame around the selection — what led here and what it sets up within the read range. Do not spoil unread content.",
  };
  return `Explain a reader selection for the reading app "Shumai".

${modeGuide[mode] || modeGuide.meaning}

Rules:
- Use only the selection, Book Memory, and ContextCite evidence. Do not invent unread spoilers.
- Every factual claim should prefer citing a supplied evidenceRef such as "C1".
- Keep the answer quiet and reading-native: clear prose, not a report dashboard.
- Never output the literal strings undefined, null, or nan.

Return JSON exactly:
{
  "mode":"${mode}",
  "title":"short title <= 12 Chinese chars",
  "answer":"main explanation, 2-5 short sentences",
  "highlights":["optional short bullet <= 24 Chinese chars"],
  "evidenceRefs":["C1","C2"]
}

Constraints:
- highlights: 0-3 items only when they add scan value (roles, definitions, causal steps).
- evidenceRefs: subset of supplied refs that support the answer.
- answer must be non-empty and grounded.

Book:
${JSON.stringify(book)}

Checkpoint:
${JSON.stringify(cursor)}

Book Memory:
${JSON.stringify(bookMemory || null)}

Selection:
${JSON.stringify(selection)}

ContextCite evidence:
${JSON.stringify(cites)}`;
}

function normaliseSelectionExplanation(raw, mode, evidence) {
  const evidenceList = (evidence || []).slice(0, 12).map((item, index) => {
    const ref = item.cite?.label || item.ref || `[C${index + 1}]`;
    const id = item.cite?.id || item.id || `C${index + 1}`;
    return {
      ...item,
      ref,
      id,
      cite: item.cite || { id, label: ref, quote: item.quote || item.excerpt || "" },
    };
  });
  const byRef = new Map();
  evidenceList.forEach((item) => {
    [item.ref, item.ref?.replace(/[\[\]]/g, ""), item.id, item.cite?.id, item.cite?.label]
      .filter(Boolean)
      .forEach((key) => byRef.set(String(key), item));
  });
  const resolveRefs = (refs) =>
    (Array.isArray(refs) ? refs : [])
      .map((ref) => byRef.get(String(ref)) || byRef.get(String(ref).replace(/[\[\]]/g, "")))
      .filter(Boolean);
  const answer = displayText(raw?.answer || "");
  if (!answer) return null;
  const highlights = (Array.isArray(raw?.highlights) ? raw.highlights : [])
    .map((item) => displayText(item))
    .filter(Boolean)
    .slice(0, 3);
  const resolved = resolveRefs(raw?.evidenceRefs);
  return {
    mode: mode || raw?.mode || "meaning",
    title: displayText(raw?.title || "") || null,
    answer,
    highlights,
    evidence: resolved.length ? resolved : evidenceList.slice(0, 3),
  };
}

function buildRecoveryCardPrompt({ book, cursor, traceProfile, bookMemory, traceMemory, evidence, currentText }) {
  const ordered = sortEvidenceByCursorProximity(evidence.slice(0, 16), cursor);
  const cites = ordered.map((item, index) => ({
    ref: item.cite?.label || `[C${index + 1}]`,
    id: item.cite?.id || `C${index + 1}`,
    chapterIndex: item.chapterIndex,
    paragraphIndex: item.paragraphIndex,
    chapterTitle: item.chapterTitle,
    quote: item.quote || item.cite?.quote || item.excerpt,
    matchSources: item.matchSources || [],
    nearCheckpoint: index < 6,
  }));
  return `Create a continued-reading recovery card for the reading app "Shumai".

Goal:
- Help the reader quickly restore the MAIN THREAD needed to understand the current checkpoint.
- The output is not an entity index. It should answer: what prior mainline context matters now, what the current page depends on, and one active-recall question.
- Be book-type adaptive via the Trace profile. For science/textbook books, prefer concepts, mechanisms, definitions, unresolved questions, examples, and argument structure. For history/military/fiction/biography, prefer central actors, organizations, decisions, conflicts, places, timeline turns, and causal links.
- Keep only the top 80% high-value memory anchors. Omit minor names, birth/death dates, publication metadata, incidental historical mentions, and place names that do not change understanding of the current page.
- Do not spoil unread content. Use only the supplied ContextCite evidence and the checkpoint.
- Every claim must cite one supplied evidenceRef such as "C1". If evidence is weak, omit the claim.
- BOOK-AGNOSTIC: never invent book-specific templates, fixed entity lists, or year ranges. Ground every field in the supplied evidence and Memory only.

Return JSON exactly:
{
  "absenceLabel":"继续阅读前",
  "intensity":"light|medium|deep|fresh",
  "positionLabel":"上次读到 ...",
  "keyPoints":[{"title":"","detail":"","evidenceRef":"C1"}],
  "prerequisites":[{"text":"","evidenceRef":"C2"}],
  "question":{"prompt":"","hint":"","answer":"","evidenceRef":"C3"},
  "evidenceRefs":["C1","C2","C3"]
}

Constraints:
- keyPoints: 2-3 items, each title <= 12 Chinese chars or 5 English words, detail <= 48 Chinese chars or 24 English words. Titles must name a concrete episode, decision, person-action, place-beat, concept, or causal link from evidence — not a bare mega-institution.
- prerequisites: 1-2 items, focused on what must be recalled to understand the current page.
- question: ONE active-recall question the reader could answer ONLY after reading the cited evidence near the checkpoint. Prefer Memory primary/recent anchors and cites marked nearCheckpoint.
- question MUST target a concrete recall object: named person action, turning decision, place/battle beat, causal link, definition/mechanism, or unresolved problem — with a specific evidenceRef.
- FORBIDDEN question centers: mega-topics alone such as 党 / 国家 / 人民 / 历史 / 中国共产党 / 政府 / 军队 / 战争 / 革命 (or English equivalents) unless the SAME prompt also names a concrete evidenced episode.
- FORBIDDEN templates / slogans: 「X 为什么会影响后面的内容」「关键决策如何形成」「对后续有什么影响」「在历史中的意义」and any encyclopedic prompt answerable without reading this book.
- hint rules: write one complete Chinese clause or short sentence (or equivalent English) that nudges toward the SAME concrete episode (who/where/what happened). Never hard-cut mid-word or mid-clause. Do not end on fragments such as 「其余的是清」「是湖」「人外，」. Do NOT use abstract process slogans. If evidence is too weak for a clean hint, omit "hint" or set it to "".
- Every keyPoint, prerequisite, and the question MUST use a real evidenceRef from the supplied list (for example "C1"). Never invent refs. If a claim has no matching cite, omit it.
- If a quote only mentions incidental names/dates/places, do not turn them into key points.
- Prefer causal summaries, decisions, conflicts, concepts, unresolved problems, and turning points over raw entity mentions.
- Never output the literal strings undefined, null, or nan in any field.

Book:
${JSON.stringify(book)}

Checkpoint:
${JSON.stringify(cursor)}

Trace profile:
${JSON.stringify(traceProfile || null)}

Book Memory:
${JSON.stringify(bookMemory || traceMemory || null)}

Current newly-read text near checkpoint:
${JSON.stringify((currentText || []).slice(-10))}

ContextCite evidence (ordered near checkpoint first):
${JSON.stringify(cites)}`;
}

function normaliseRecoveryCard(raw, evidence, book, cursor) {
  const orderedEvidence = sortEvidenceByCursorProximity(evidence.slice(0, 16), cursor);
  const evidenceList = orderedEvidence.map((item, index) => normaliseRecoveryEvidence(item, index, book)).filter(Boolean);
  const byRef = new Map();
  evidenceList.forEach((item) => {
    [item.ref, item.ref?.replace(/[\[\]]/g, ""), item.id, item.cite?.id, item.cite?.label]
      .filter(Boolean)
      .forEach((key) => byRef.set(String(key), item));
  });
  const resolveEvidence = (ref) => {
    const rawRef = String(ref || "").trim();
    if (!rawRef) return null;
    const key = rawRef.replace(/^\[/, "").replace(/\]$/, "");
    return byRef.get(rawRef) || byRef.get(key) || byRef.get(`[${key}]`) || null;
  };
  const keyPoints = (Array.isArray(raw?.keyPoints) ? raw.keyPoints : [])
    .map((item, index) => ({
      id: `ai-point-${index}`,
      title: displayText(item?.title, `重点 ${index + 1}`).slice(0, 32),
      detail: displayText(item?.detail).slice(0, 120),
      evidence: resolveEvidence(item?.evidenceRef),
    }))
    .filter((item) => item.detail && item.evidence && !isWeakRecoveryKeyPoint(item))
    .slice(0, 3);
  const prerequisites = (Array.isArray(raw?.prerequisites) ? raw.prerequisites : [])
    .map((item, index) => ({
      id: `ai-prereq-${index}`,
      text: displayText(item?.text).slice(0, 120),
      evidence: resolveEvidence(item?.evidenceRef),
    }))
    .filter((item) => item.text && item.evidence)
    .slice(0, 2);
  let questionEvidence = resolveEvidence(raw?.question?.evidenceRef);
  if (!questionEvidence) {
    questionEvidence = keyPoints[0]?.evidence || evidenceList[0] || null;
  }
  const chapterTitle = questionEvidence?.chapterTitle
    || evidenceList[0]?.chapterTitle
    || `第 ${Number(cursor?.chapterIndex || 0) + 1} 节`;
  const fallbackAnchor = preferQuestionAnchor(
    keyPoints.map((item) => ({
      name: item.title,
      title: item.title,
      summary: item.detail,
      detail: item.detail,
      kind: guessRecoveryKind(item),
      priority: "primary",
      evidence: item.evidence,
    })),
  ) || {
    name: keyPoints[0]?.title,
    title: keyPoints[0]?.title,
    summary: keyPoints[0]?.detail || questionEvidence?.excerpt,
    detail: keyPoints[0]?.detail || questionEvidence?.excerpt,
    kind: "event",
    priority: "recent",
  };
  const repaired = sanitizeModelRecoveryQuestion(
    {
      prompt: displayText(raw?.question?.prompt),
      hint: displayText(raw?.question?.hint),
      answer: displayText(raw?.question?.answer, questionEvidence?.excerpt || evidenceList[0]?.excerpt || ""),
    },
    {
      chapterTitle,
      fallbackAnchor,
      evidenceExcerpt: questionEvidence?.excerpt || keyPoints[0]?.detail || "",
    },
  );
  const hint = sanitizeRecoveryHint(repaired.hint);
  return {
    intensity: ["light", "medium", "deep", "fresh"].includes(raw?.intensity) ? raw.intensity : "medium",
    absenceLabel: displayText(raw?.absenceLabel, "继续阅读前"),
    positionLabel: displayText(raw?.positionLabel, `上次读到 ${chapterTitle}`),
    keyPoints,
    prerequisites,
    question: {
      prompt: repaired.prompt || questionFromEpisodeAnchor(fallbackAnchor, chapterTitle),
      hint: hint && !isWeakRecoveryHint(hint) ? hint : "",
      answer: repaired.answer || questionEvidence?.excerpt || evidenceList[0]?.excerpt || "",
      evidence: questionEvidence,
    },
    evidence: evidenceList.slice(0, 6),
    sourceBook: { title: displayText(book?.title), creator: displayText(book?.creator) },
  };
}

function isWeakRecoveryKeyPoint(item) {
  const title = displayText(item?.title);
  const detail = displayText(item?.detail);
  if (!title || !detail) return true;
  if (isBroadMegaTopic(title) && !hasConcreteEpisodeCue(`${title} ${detail}`)) return true;
  return false;
}

function guessRecoveryKind(item) {
  const blob = `${item?.title || ""} ${item?.detail || ""}`;
  if (/概念|定义|机制|模型|原则|framework|mechanism|definition/i.test(blob)) return "concept";
  if (/主张|结论|判断|证明|claim|conclusion/i.test(blob)) return "claim";
  if (/决定|命令|冲突|突破|撤退|转移|会议|部署|战役|战斗|event|battle/i.test(blob)) return "event";
  return "event";
}

function normaliseRecoveryEvidence(item, index = 0, book = null) {
  if (!item) return null;
  const cite = item.cite || {};
  const ref = cite.label || cite.id || `[C${index + 1}]`;
  const excerpt = displayText(item.quote || cite.quote || item.excerpt).slice(0, 180);
  if (!excerpt) return null;
  const chapterIndex = Number(item.chapterIndex ?? cite.chapterIndex);
  const paragraphIndex = Number(item.paragraphIndex ?? cite.paragraphIndex);
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex) || chapterIndex < 0 || paragraphIndex < 0) return null;
  if (book?.chapters?.length) {
    const chapter = book.chapters.find((candidate, idx) => (candidate.sourceChapterIndex ?? idx) === chapterIndex)
      || book.chapters[chapterIndex];
    if (!chapter || !Array.isArray(chapter.paragraphs) || paragraphIndex >= chapter.paragraphs.length) return null;
  }
  return {
    id: item.id || cite.chunkId || `recovery-${chapterIndex}-${paragraphIndex}`,
    ref,
    chapterIndex,
    paragraphIndex,
    chapterTitle: displayText(item.chapterTitle || cite.chapterTitle),
    excerpt,
    quote: excerpt,
    cite: {
      ...cite,
      id: cite.id || ref.replace(/[\[\]]/g, ""),
      label: ref,
      quote: excerpt,
    },
    matchSources: Array.isArray(item.matchSources) ? item.matchSources : ["contextcite"],
  };
}

function buildTraceAnalysisPrompt(book, previousBookMemory, cursor, scope, traceProfile, candidates, supportingEvidence) {
  const source = book.chapters.map((chapter, chapterIndex) => ({
    chapterIndex: chapter.sourceChapterIndex ?? chapterIndex,
    title: chapter.title,
    paragraphs: (chapter.paragraphs || []).map((item, paragraphIndex) => ({
      paragraphIndex: typeof item === "object" ? item.paragraphIndex ?? paragraphIndex : paragraphIndex,
      text: typeof item === "object" ? item.text : item,
    })),
  }));
  const candidateTypes = BOOK_TYPES.map((type) => ({ name: type.name, facets: type.facets }));
  const scopeInstruction = scope === "full"
    ? "本次是手动全书分析。可以重建 Book Memory，但仍然只提取真正影响读者理解和回忆的高价值信息。"
    : "本次是增量已读分析。先读取上次 Book Memory，再根据新增已读正文补充、修正或删除条目；不得推断未读内容。";

  return `请为阅读软件“书脉”生成 Memory Engine 结果。目标不是穷举百科信息，而是帮助读者在继续阅读时回忆前文脉络。只保留最有帮助的约 80% 记忆锚点，宁可少而准。

${scopeInstruction}

核心原则：
1. 先判断图书类型，再按 Trace Profile 的 anchors 决定提取什么。科普、教材、技术、商业类不必强行输出人物、地点或时间线；历史、传记、军事、小说则按主线需要输出人物、组织、地点、时间线、事件和关系。
2. 候选池只是召回线索，不是答案。必须由原文或 ContextCite 证据证明，且必须与当前书的主旨、论证、情节、知识框架或主线行动密切相关。
3. 排除弱信息：人物出生日期、履历背景、出版信息、偶然提到的历史事件、无因果关系的地名、只出现一次且不影响理解的人名/术语。
4. 每个输出条目必须有 evidence.chapterIndex、evidence.paragraphIndex、evidence.quote。quote 必须来自提供文本或 ContextCite，不要凭常识补全。
5. priority 只允许 primary、recent 或 secondary。primary 是默认展示层；recent 表示最近已读新增；secondary 可展开。
6. relationships 只输出原文能直接证明的关系。没有可靠关系就返回空数组。
7. 优先填充 memory 六类桶；若某类不适用，返回空数组。可同时返回 legacy 字段作为兼容。

输出 JSON：
{
  "bookProfile":{"category":"候选类型之一","facets":["4-6 个适合本书的索引面板"]},
  "memory":{
    "entities":[{"kind":"person|organization|place|term","name":"","priority":"primary|recent|secondary","attributes":["1-2 个角色标签"],"summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
    "timeline":[{"kind":"event|timepoint","name":"","priority":"primary|recent|secondary","summary":"","causes":[],"causedBy":[],"evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
    "topics":[{"kind":"concept|definition|mechanism|framework|example","name":"","priority":"primary|recent|secondary","summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
    "arguments":[{"kind":"claim|reason|evidence|example|conclusion|objection","name":"","priority":"primary|recent|secondary","summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
    "episodic":[{"kind":"event|scene","name":"","priority":"primary|recent|secondary","summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
    "relationships":[{"source":"","sourceType":"person|organization|event","target":"","targetType":"person|organization|event","relation":"","relationKind":"command|belongs|cooperate|conflict|participate|other","importance":"primary|secondary","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}]
  },
  "people":[{"name":"","priority":"primary|secondary","attributes":["1-2 个身份/职责/阵营/关键关系"],"summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
  "organizations":[{"name":"","priority":"primary|secondary","summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
  "places":[{"name":"","priority":"primary|secondary","summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
  "timeline":[{"date":"","priority":"primary|secondary","title":"","summary":"","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
  "relationships":[{"source":"","sourceType":"person|organization|event","target":"","targetType":"person|organization|event","relation":"","relationKind":"command|belongs|cooperate|conflict|participate|other","importance":"primary|secondary","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],
  "discarded":[{"name":"","type":"","reason":""}]
}

图书类型候选：
${JSON.stringify(candidateTypes)}

Trace Profile：
${JSON.stringify(traceProfile)}

候选池：
${JSON.stringify((candidates || []).slice(0, 80))}

ContextCite 证据：
${JSON.stringify((supportingEvidence || []).slice(0, 20))}

上次 Book Memory：
${JSON.stringify(previousBookMemory || null)}

本次分析断点：
${JSON.stringify(cursor)}

本次正文：
${JSON.stringify(source)}`;
}

function resolvePreviousBookMemory({ previousBookMemory, previousIndex, previousTraceMemory, book, traceProfile }) {
  if (previousBookMemory) {
    return normalizeBookMemory(previousBookMemory, {
      bookId: book?.id || book?.title || "book",
      traceProfile,
    });
  }
  if (previousIndex || previousTraceMemory) {
    return bookMemoryFromLegacy({
      index: previousIndex,
      traceMemory: previousTraceMemory,
      cursor: previousTraceMemory?.cursor || null,
      profile: previousTraceMemory?.profile || null,
      traceProfile: previousTraceMemory?.traceProfile || traceProfile,
    }, {
      bookId: book?.id || book?.title || "book",
      traceProfile,
    });
  }
  return null;
}

function buildBookMemoryFromAnalysis({
  parsed,
  index,
  profile,
  cursor,
  traceProfile,
  supportingEvidence,
  previousBookMemory,
  bookId,
}) {
  const fromLegacy = bookMemoryFromLegacy({
    index,
    traceMemory: {
      anchors: Array.isArray(parsed.memoryAnchors) ? parsed.memoryAnchors.map((anchor) => ({
        id: anchor.anchorId || anchor.id,
        label: anchor.label,
        items: anchor.items,
      })) : [],
      discarded: parsed.discarded,
      evidence: supportingEvidence,
      cursor,
      profile,
      traceProfile,
    },
    discarded: parsed.discarded,
    supportingEvidence,
    cursor,
    profile,
    traceProfile,
  }, { bookId, cursor, profile, traceProfile, supportingEvidence });

  const fromCanonical = normalizeBookMemory({
    ...(parsed.memory || {}),
    discarded: parsed.discarded,
    supportingEvidence,
    cursor,
    profile,
    traceProfile,
    bookId,
  }, { bookId, cursor, profile, traceProfile, supportingEvidence });

  const incoming = mergeBookMemory(fromLegacy, fromCanonical, cursor);
  return mergeBookMemory(previousBookMemory, incoming, cursor);
}

function buildClassificationPrompt(book) {
  const candidates = BOOK_TYPES.map((type) => ({ name: type.name, facets: type.facets }));
  return `Classify the imported book into exactly one candidate type and choose 4-6 useful reading-index facets from that type.

Candidate types:
${JSON.stringify(candidates)}

Use only the supplied metadata, table of contents, and sample text. Prefer the book's actual subject and reading workflow over filename hints. If uncertain, choose the closest general type.

Return JSON exactly like:
{"category":"one candidate name","facets":["facet"],"reason":"short reason"}

Book metadata:
${JSON.stringify(book)}`;
}

function parseJson(content) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

/** Extract final answer text from a LangChain AIMessage (thinking models keep CoT separate). */
function messageContent(result) {
  const content = result?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("");
  }
  return String(content ?? "");
}

function normaliseIndex(raw, chapters) {
  const isOrganizationName = (value) => {
    const name = String(value || "").trim();
    if (!name) return false;
    return /(军团|方面军|集团军|红军|白军|桂军|黔军|川军|滇军|湘军|部队|纵队|支队|机枪连|警卫连|侦察连|运输队|工作队|先头部队|师|旅|团|营|党|政府|委员会|军委|机关|总部|司令部|同盟|联盟|公司|学校|大学|学院|研究所|协会|组织)$/.test(name)
      || /^(红|白|桂|黔|川|滇|湘|粤|中央|南京|国民党|共产党|中共).*(军|党|政府|军委|委员会|机关|总部|司令部)$/.test(name);
  };
  const makeEntry = (kind, item, index) => {
    item = item || {};
    const evidence = item.evidence || {};
    const summary = cleanTraceSummary(item.summary);
    const requestedChapter = Number(evidence.chapterIndex);
    const chapter = chapters.find((candidate, chapterIndex) => (candidate.sourceChapterIndex ?? chapterIndex) === requestedChapter);
    if (!chapter || evidence.chapterIndex == null || evidence.paragraphIndex == null || !Number.isInteger(requestedChapter) || requestedChapter < 0) {
      return { name: "", weakEvidence: true };
    }
    const chapterIndex = chapter.sourceChapterIndex ?? chapters.indexOf(chapter);
    const paragraphIndex = Number(evidence.paragraphIndex);
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= (chapter.paragraphs?.length || 0)) {
      return { name: "", weakEvidence: true };
    }
    const timelineName = displayText(item.date || item.name || item.title);
    const entityName = displayText(item.name || item.title);
    const name = kind === "timeline" ? timelineName : entityName;
    if (!name) return { name: "", weakEvidence: true };
    let quote = repairEvidenceQuote(chapter, paragraphIndex, evidence.quote, [name, item.title, summary]);
    let resolvedChapterIndex = chapterIndex;
    let resolvedParagraphIndex = paragraphIndex;
    const betterEvidence = findBetterTraceEvidence(chapters, { kind, name, summary, chapterIndex, paragraphIndex, quote });
    if (betterEvidence) {
      resolvedChapterIndex = betterEvidence.chapterIndex;
      resolvedParagraphIndex = betterEvidence.paragraphIndex;
      quote = betterEvidence.quote;
    }
    return {
      id: `${kind}-${index}-${name}`,
      name,
      subtitle: kind === "timeline" ? displayText(item.title) : summary,
      detail: kind === "timeline" ? summary : summary || quote,
      evidenceQuote: quote,
      priority: item.priority === "primary" ? "primary" : "secondary",
      attributes: kind === "person" ? (Array.isArray(item.attributes) ? item.attributes.map(cleanTraceSummary).filter(Boolean).slice(0, 2) : []) : [],
      sortKey: kind === "timeline" ? parseDate(item.date) : index,
      weakEvidence: isWeakTraceEvidenceQuote(quote),
      occurrence: { chapterIndex: resolvedChapterIndex, paragraphIndex: resolvedParagraphIndex },
      occurrences: [{ chapterIndex: resolvedChapterIndex, paragraphIndex: resolvedParagraphIndex }],
    };
  };
  const timeline = (raw.timeline || [])
    .map((item, index) => makeEntry("timeline", item, index))
    .filter((item) => item.name && !item.weakEvidence)
    .sort((a, b) => a.sortKey - b.sortKey);
  const people = [];
  const organizations = [];
  (raw.people || []).forEach((item, index) => {
    const entry = makeEntry("person", item, index);
    if (!entry.name || entry.name === "undefined") return;
    if (entry.weakEvidence) return;
    if (isOrganizationName(entry.name)) {
      organizations.push({ ...entry, id: `organization-from-person-${index}-${entry.name}`, attributes: [] });
    } else {
      people.push(entry);
    }
  });
  (raw.organizations || []).forEach((item, index) => {
    const entry = makeEntry("organization", item, index);
    if (!entry.name || entry.name === "undefined") return;
    if (entry.weakEvidence) return;
    organizations.push({ ...entry, id: `organization-${index}-${entry.name}`, attributes: [] });
  });
  const uniqueByName = (items) => Array.from(new Map(items.map((item) => [item.name, item])).values());
  const relationships = (raw.relationships || []).map((item, index) => {
    const evidence = item.evidence || {};
    const requestedChapter = Number(evidence.chapterIndex);
    const chapter = chapters.find((candidate, chapterIndex) => (candidate.sourceChapterIndex ?? chapterIndex) === requestedChapter);
    if (!chapter || evidence.chapterIndex == null || evidence.paragraphIndex == null || !Number.isInteger(requestedChapter) || requestedChapter < 0) return null;
    const chapterIndex = chapter.sourceChapterIndex ?? chapters.indexOf(chapter);
    const paragraphIndex = Number(evidence.paragraphIndex);
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= (chapter.paragraphs?.length || 0)) return null;
    const source = displayText(item.source);
    const target = displayText(item.target);
    const relation = displayText(item.relation);
    if (!source || !target || !relation || source === target) return null;
    const quote = repairEvidenceQuote(chapter, paragraphIndex, evidence.quote, [source, target, relation]);
    if (isWeakTraceEvidenceQuote(quote)) return null;
    return {
      id: `relationship-${index}-${source}-${target}`,
      source,
      target,
      sourceType: ["person", "organization", "event"].includes(item.sourceType) ? item.sourceType : "person",
      targetType: ["person", "organization", "event"].includes(item.targetType) ? item.targetType : "person",
      relation,
      relationKind: ["command", "belongs", "cooperate", "conflict", "participate", "other"].includes(item.relationKind) ? item.relationKind : "other",
      importance: item.importance === "primary" ? "primary" : "secondary",
      evidence: {
        chapterIndex,
        paragraphIndex,
        quote,
      },
    };
  }).filter(Boolean).slice(0, 36);
  return {
    people: uniqueByName(people),
    organizations: uniqueByName(organizations),
    places: (raw.places || []).map((item, index) => makeEntry("place", item, index)).filter((item) => item.name && !item.weakEvidence),
    timeline,
    relationships,
  };
}

function normaliseProfile(profile, { strict = false } = {}) {
  const matched = BOOK_TYPES.find((type) => type.name === profile?.category);
  if (!matched) {
    if (strict) return null;
    const fallback = BOOK_TYPES[0];
    return { category: fallback.name, facets: fallback.facets.slice(0, 6) };
  }
  const facets = Array.isArray(profile?.facets)
    ? profile.facets.filter((facet) => matched.facets.includes(facet)).slice(0, 6)
    : matched.facets.slice(0, 6);
  return { category: matched.name, facets: facets.length ? facets : matched.facets.slice(0, 6) };
}

function displayText(value, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^(undefined|null|nan)$/i.test(text)) return fallback;
  return text;
}

/** Drop incomplete / hard-cut recovery hints rather than inventing or showing garbage. */
function sanitizeRecoveryHint(value) {
  const text = displayText(value);
  if (!text) return "";
  if (looksTruncatedRecoveryHint(text)) return "";
  return text.slice(0, 96);
}

function looksTruncatedRecoveryHint(value) {
  const text = String(value || "")
    .replace(/^提示[：:]\s*/, "")
    .replace(/^回到这条线索[—\-–]+\s*/, "")
    .replace(/^先回想[—\-–]+\s*/, "")
    .trim();
  if (!text || text.length < 4) return true;
  if (/^(undefined|null|nan)$/i.test(text)) return true;
  // Peel a trailing stop so wrappers like 「……是清。」 still fail.
  const core = text.replace(/[。！？…]+$/g, "").trim();
  if (!core || core.length < 4) return true;
  if (/[，、：:；;（(\[\{「『《【]$/.test(core)) return true;
  if (/(?:其余的是|除了|以及|还有|就是|乃是|并非|不是)[\u4e00-\u9fff]?$/.test(core)) return true;
  if (/[的地得了着过与和及以于]$/.test(core)) return true;
  if (/(?:人外，|外，其余|是清|是湖|是四|是贵|是江)$/.test(core)) return true;
  const comma = Math.max(core.lastIndexOf("，"), core.lastIndexOf(","));
  if (comma >= 0) {
    const tail = core.slice(comma + 1).trim();
    if (tail.length > 0 && tail.length <= 6 && !/(什么|何处|哪|谁|如何|为何|哪一步)$/.test(tail)) return true;
  }
  return false;
}

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : min;
}

function paragraphText(item) {
  return typeof item === "object" ? String(item?.text || "") : String(item || "");
}

function cleanTraceSummary(value) {
  return String(value || "")
    .replace(/[，,；;]?\s*(?:一?[二三四五六七八九十]{1,3}|[1-9]\d?)岁/g, "")
    .replace(/[，,；;]?\s*(?:籍贯|出生于|生于|出生地|祖籍)[^，,。；;]{0,18}/g, "")
    .replace(/[，,；;]?\s*(?:湖南人|湖北人|陕西人|江西人|广东人|广西人|贵州人|四川人|云南人|福建人|浙江人|江苏人|山东人|河南人|河北人)/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[，,；;\s]+|[，,；;\s]+$/g, "")
    .trim();
}

function repairEvidenceQuote(chapter, paragraphIndex, quote, hints = []) {
  const source = paragraphText(chapter?.paragraphs?.[paragraphIndex]).trim();
  const requested = String(quote || "").trim().replace(/\s+/g, "");
  if (!source) return requested.slice(0, 160);
  const compactSource = source.replace(/\s+/g, "");
  if (requested.length >= 8 && compactSource.includes(requested)) return requested.slice(0, 160);
  const cleanHints = hints.map((item) => String(item || "").trim()).filter((item) => item.length >= 2);
  const hit = cleanHints
    .map((hint) => ({ hint, index: source.indexOf(hint) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)[0];
  if (hit) {
    const start = Math.max(0, hit.index - 28);
    const end = Math.min(source.length, hit.index + hit.hint.length + 92);
    return source.slice(start, end).replace(/\s+/g, "").slice(0, 160);
  }
  return source.replace(/\s+/g, "").slice(0, 160);
}

function findBetterTraceEvidence(chapters, { kind, name, summary, chapterIndex, paragraphIndex, quote }) {
  if (!["person", "organization", "place"].includes(kind)) return null;
  const wanted = traceSummaryTokens(summary);
  const rosterWeak = hasTraceRosterSignal(quote);
  if (!shouldImproveTraceEvidenceQuote(quote, wanted)) return null;
  let best = null;
  chapters.forEach((chapter, localChapterIndex) => {
    const sourceChapterIndex = chapter.sourceChapterIndex ?? localChapterIndex;
    (chapter.paragraphs || []).forEach((paragraph, localParagraphIndex) => {
      const text = paragraphText(paragraph);
      if (!text.includes(name) || !TRACE_ACTION_WORDS.test(text)) return;
      const sourceParagraphIndex = typeof paragraph === "object" ? paragraph.paragraphIndex ?? localParagraphIndex : localParagraphIndex;
      const tokenHits = wanted.filter((token) => text.includes(token)).length;
      if (!rosterWeak && wanted.length && tokenHits === 0) return;
      const distance = Math.abs(sourceChapterIndex - chapterIndex) * 20 + Math.abs(sourceParagraphIndex - paragraphIndex);
      const score = 40 + tokenHits * 10 - Math.min(distance, 30);
      if (!best || score > best.score) {
        best = {
          score,
          chapterIndex: sourceChapterIndex,
          paragraphIndex: sourceParagraphIndex,
          quote: trimTraceQuote(text, name),
        };
      }
    });
  });
  return best && best.score >= 30 ? best : null;
}

function shouldImproveTraceEvidenceQuote(quote, wanted = []) {
  const text = String(quote || "");
  if (!text) return true;
  const hasRosterSignal = hasTraceRosterSignal(text);
  const tokenHits = wanted.filter((token) => text.includes(token)).length;
  return hasRosterSignal || (wanted.length > 0 && tokenHits === 0);
}

function isWeakTraceEvidenceQuote(quote) {
  const text = String(quote || "");
  return !TRACE_ACTION_WORDS.test(text) || hasTraceRosterSignal(text) && !TRACE_ACTION_WORDS.test(text);
}

function hasTraceRosterSignal(value) {
  return /(?:岁|领导成员|他们是|担任|参谋长|政治委员|主任|主席|湖南人|陕西人)/.test(String(value || ""));
}

function traceSummaryTokens(summary) {
  return String(summary || "")
    .replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, " ")
    .split(/\s+/)
    .flatMap((token) => token.length > 4 && /^[\u4e00-\u9fff]+$/.test(token) ? [token.slice(0, 4), token.slice(-4)] : [token])
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

function trimTraceQuote(text, name) {
  const source = String(text || "").trim();
  const index = source.indexOf(name);
  if (index < 0) return source.replace(/\s+/g, "").slice(0, 160);
  const start = Math.max(0, index - 36);
  return source.slice(start, start + 130).replace(/\s+/g, "").slice(0, 160);
}

function parseDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d{4})(?:[-年/.](\d{1,2}))?(?:[-月/.](\d{1,2}))?/);
  if (match) return Date.UTC(Number(match[1]), Number(match[2] || 1) - 1, Number(match[3] || 1));

  const digitMap = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const toYear = (yearText) => {
    const digits = [...String(yearText || "")].map((char) => digitMap[char]).filter((digit) => digit !== undefined);
    return digits.length === 4 ? Number(digits.join("")) : null;
  };
  const toNumber = (part) => {
    const textPart = String(part || "");
    if (!textPart) return null;
    if (/^\d+$/.test(textPart)) return Number(textPart);
    if (textPart === "十") return 10;
    if (textPart.startsWith("十")) return 10 + (digitMap[textPart[1]] || 0);
    if (textPart.endsWith("十")) return (digitMap[textPart[0]] || 0) * 10;
    const tenIndex = textPart.indexOf("十");
    if (tenIndex >= 0) return (digitMap[textPart[0]] || 1) * 10 + (digitMap[textPart[tenIndex + 1]] || 0);
    return digitMap[textPart[0]] ?? null;
  };
  const chinese = text.match(/([零〇一二两三四五六七八九]{4})年(?:([十零〇一二两三四五六七八九\d]{1,3})月)?(?:([十零〇一二两三四五六七八九\d]{1,3})日)?/);
  if (!chinese) return Number.MAX_SAFE_INTEGER;
  const year = toYear(chinese[1]);
  const month = toNumber(chinese[2]) || 1;
  const day = toNumber(chinese[3]) || 1;
  return year ? Date.UTC(year, month - 1, day) : Number.MAX_SAFE_INTEGER;
}

function buildSummary(index, cursor) {
  const eventLabel = (item) => [item.name, item.subtitle || item.detail].map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
  const summarizeEntities = (items) => ({
    primary: items.filter((item) => item.priority === "primary" && item.name).slice(0, 6).map((item) => item.name),
    secondary: items.filter((item) => item.priority !== "primary" && item.name).slice(0, 6).map((item) => item.name),
    recent: [...items].filter((item) => item.name && item.occurrence.chapterIndex === cursor?.chapterIndex).slice(-4).map((item) => item.name),
  });
  return {
    people: summarizeEntities(index.people),
    organizations: summarizeEntities(index.organizations || []),
    places: summarizeEntities(index.places),
    events: index.timeline.slice(-6).map(eventLabel).filter(Boolean),
    cursor,
  };
}

const server = app.listen(8787, "127.0.0.1", () => {
  console.log("AI analysis service listening on http://127.0.0.1:8787");
});
server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error("Port 8787 is already in use. Stop the other node server.mjs and retry.");
  } else {
    console.error("AI analysis service failed to start:", error);
  }
  process.exit(1);
});
