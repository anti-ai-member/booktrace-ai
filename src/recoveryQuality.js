/**
 * Book-agnostic recovery-card quality helpers.
 * Prefer concrete, evidence-grounded recall targets; reject mega-topics and generic templates.
 */

const ACTION_HINT =
  /决定|命令|出发|抵达|进入|离开|转移|会合|冲突|战斗|失败|胜利|证明|导致|形成|改变|提出|主张|发现|背叛|结盟|突破|撤退|起义|谈判|部署|会议|包围|突围|进攻|防守|会师|被俘|追击|定义|证明|推导|假设|实验|反驳|成立|失效|cause|decide|order|attack|retreat|define|prove|claim|shift/i;

/** Overly broad labels with little per-book recall value unless tied to a concrete episode. */
const BROAD_MEGA_TOPICS = new Set([
  "党",
  "国家",
  "人民",
  "历史",
  "政府",
  "军队",
  "战争",
  "革命",
  "社会",
  "世界",
  "人类",
  "时代",
  "民族",
  "中国",
  "共产党",
  "中国共产党",
  "国民党",
  "中华民族",
  "党中央",
  "中央",
  "组织",
  "部队",
  "委员会",
  "party",
  "the party",
  "nation",
  "the nation",
  "people",
  "the people",
  "history",
  "government",
  "the government",
  "army",
  "war",
  "revolution",
  "society",
  "world",
  "humanity",
]);

const WEAK_QUESTION_PATTERNS = [
  /为什么会影响后面的内容/,
  /关键决策如何形成/,
  /会对后面产生什么影响/,
  /对后续有什么影响/,
  /在历史中的意义/,
  /为什么重要[？?]?$/,
  /有什么重要意义/,
];

const WEAK_HINT_PATTERNS = [
  /^关键决策如何形成$/,
  /^主线冲突推进到哪一步$/,
  /^最关键的因果变化$/,
  /^哪个核心概念刚出现$/,
];

const EPISODE_KINDS = new Set([
  "event",
  "scene",
  "timepoint",
  "claim",
  "conclusion",
  "reason",
  "mechanism",
  "concept",
  "definition",
  "framework",
  "timeline",
  "plot",
  "events",
  "concepts",
  "mechanisms",
]);

export function normaliseRecoveryLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^["“”'‘’《》「」『』【】\[\]]+|["“”'‘’《》「」『』【】\[\]]+$/g, "")
    .trim();
}

export function isBroadMegaTopic(name) {
  const label = normaliseRecoveryLabel(name).toLowerCase();
  if (!label) return true;
  if (BROAD_MEGA_TOPICS.has(label)) return true;
  // Short institutional shells without a concrete episode marker in the name itself.
  if (/^(中国)?共产[党黨]$|^国民党$|^党中央$|^中央政府$|^人民政府$/.test(label)) return true;
  return false;
}

export function hasConcreteEpisodeCue(text) {
  const blob = normaliseRecoveryLabel(text);
  if (!blob || blob.length < 6) return false;
  if (ACTION_HINT.test(blob)) return true;
  // Named action-ish clause: someone did/said something specific.
  if (/[\u4e00-\u9fff]{2,8}(?:在|于|从|向|把|将).{2,24}(?:了|着|过)/.test(blob)) return true;
  if (/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?\b.{0,40}\b(?:decided|ordered|claimed|proved|defined)\b/i.test(blob)) {
    return true;
  }
  return false;
}

export function isEpisodeWorthyAnchor(anchor = {}) {
  const name = normaliseRecoveryLabel(anchor.name || anchor.title);
  const detail = normaliseRecoveryLabel(anchor.summary || anchor.detail || "");
  const kind = String(anchor.kind || "").toLowerCase();
  if (!name) return false;
  if (isBroadMegaTopic(name) && !hasConcreteEpisodeCue(`${name} ${detail}`)) return false;
  if (EPISODE_KINDS.has(kind)) return true;
  if (kind === "person" || kind === "people" || kind === "organization" || kind === "organizations" || kind === "relationship") {
    return detail.length >= 10 && hasConcreteEpisodeCue(detail);
  }
  if (kind === "place" || kind === "places") {
    return detail.length >= 10 && hasConcreteEpisodeCue(detail);
  }
  return hasConcreteEpisodeCue(`${name} ${detail}`) && detail.length >= 10;
}

export function isWeakRecoveryQuestion(prompt, options = {}) {
  const text = normaliseRecoveryLabel(prompt);
  if (!text) return true;
  if (WEAK_QUESTION_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const quoted = extractQuotedRecallTarget(text);
  if (quoted && isBroadMegaTopic(quoted) && !hasConcreteEpisodeCue(options.answer || options.detail || "")) {
    return true;
  }

  // Encyclopedic framing without a concrete recall target.
  if (/还记得.{0,24}(?:党|国家|人民|历史|政府|军队|战争|革命)/.test(text) && !hasConcreteEpisodeCue(text)) {
    return true;
  }
  return false;
}

export function isWeakRecoveryHint(hint) {
  const text = normaliseRecoveryLabel(hint)
    .replace(/^提示[：:]\s*/, "")
    .replace(/^先回想[—\-–]+\s*/, "")
    .replace(/[。！？…]+$/g, "")
    .trim();
  if (!text) return true;
  if (WEAK_HINT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (/^关键决策/.test(text) && !hasConcreteEpisodeCue(text)) return true;
  return false;
}

export function extractQuotedRecallTarget(prompt) {
  const text = String(prompt || "");
  const match =
    text.match(/[「『“"]([^」』”"]{1,24})[」』”"]/)
    || text.match(/[《]([^》]{1,24})[》]/);
  return match ? normaliseRecoveryLabel(match[1]) : "";
}

/**
 * Build an active-recall question from a concrete memory/evidence anchor.
 * Book-agnostic: templates keyed by memory kind only, never by book title or fixed passages.
 */
export function questionFromEpisodeAnchor(anchor, chapterTitle = "当前章节") {
  const title = clipLabel(normaliseRecoveryLabel(anchor?.name || anchor?.title), 16);
  const chapter = clipLabel(normaliseRecoveryLabel(chapterTitle) || "当前章节", 24);
  if (!title || !isEpisodeWorthyAnchor(anchor)) {
    return `继续读《${chapter}》前，上一阶段最具体的主线变化是什么？`;
  }
  const kind = String(anchor.kind || "").toLowerCase();
  if (kind === "event" || kind === "scene" || kind === "timepoint" || kind === "timeline" || kind === "events" || kind === "plot") {
    return `继续读《${chapter}》前，你还记得“${title}”为何会发生、当时局面如何吗？`;
  }
  if (kind === "concept" || kind === "mechanism" || kind === "framework" || kind === "definition" || kind === "concepts" || kind === "mechanisms") {
    return `继续读《${chapter}》前，你还记得“${title}”在书里指的是什么吗？`;
  }
  if (kind === "claim" || kind === "conclusion" || kind === "reason") {
    return `继续读《${chapter}》前，你还记得“${title}”这条判断依据什么吗？`;
  }
  if (kind === "person" || kind === "people" || kind === "organization" || kind === "organizations" || kind === "relationship") {
    return `继续读《${chapter}》前，你还记得“${title}”在这段里做了什么关键行动或决定吗？`;
  }
  if (kind === "place" || kind === "places") {
    return `继续读《${chapter}》前，你还记得“${title}”在这段里意味着什么形势变化吗？`;
  }
  return `继续读《${chapter}》前，你还记得“${title}”在刚读过的内容里发生了什么吗？`;
}

/**
 * Hint from evidence excerpt itself — clip a concrete action clause, never book-specific slogans.
 */
export function hintFromEvidenceExcerpt(excerpt = "") {
  const clean = normaliseRecoveryLabel(excerpt);
  if (!clean || clean.length < 8) return "";
  const clause = pickConcreteClause(clean);
  if (!clause) return "";
  const nudge = clipLabel(clause, 22);
  if (!nudge || isWeakRecoveryHint(nudge)) return "";
  return `提示：先回想——${nudge}。`;
}

export function pickConcreteClause(text) {
  const clean = normaliseRecoveryLabel(text);
  if (!clean) return "";
  const parts = clean.split(/[。！？；;\n]/).map((item) => item.trim()).filter((item) => item.length >= 6);
  const actionPart = parts.find((item) => hasConcreteEpisodeCue(item) && !isBroadMegaTopic(item));
  if (actionPart) return stripLeadingConnectors(actionPart);
  const first = parts[0] || clean;
  if (hasConcreteEpisodeCue(first)) return stripLeadingConnectors(first);
  return "";
}

export function preferQuestionAnchor(anchors = []) {
  const list = (Array.isArray(anchors) ? anchors : []).filter(Boolean);
  const ranked = [...list].sort((left, right) => episodeAnchorRank(right) - episodeAnchorRank(left));
  return ranked.find((item) => isEpisodeWorthyAnchor(item)) || null;
}

export function episodeAnchorRank(anchor = {}) {
  const priority = anchor.priority === "primary" ? 3 : anchor.priority === "recent" ? 2.4 : 1;
  const kindBoost = EPISODE_KINDS.has(String(anchor.kind || "").toLowerCase()) ? 1.2 : 0.4;
  const cue = hasConcreteEpisodeCue(`${anchor.name || anchor.title || ""} ${anchor.summary || anchor.detail || ""}`) ? 1 : 0;
  const broadPenalty = isBroadMegaTopic(anchor.name || anchor.title) ? -2 : 0;
  const proximity = Number(anchor.scores?.proximity || 0);
  return priority + kindBoost + cue + broadPenalty + proximity * 0.8;
}

/**
 * Sort evidence so paragraphs nearest the cursor come first (stable for cites).
 */
export function sortEvidenceByCursorProximity(evidence = [], cursor = null) {
  const list = Array.isArray(evidence) ? [...evidence] : [];
  if (!cursor) return list;
  const chapterIndex = Number(cursor.chapterIndex) || 0;
  const paragraphIndex = Number(cursor.paragraphIndex) || 0;
  return list.sort((left, right) => {
    const leftDistance = evidenceDistance(left, chapterIndex, paragraphIndex);
    const rightDistance = evidenceDistance(right, chapterIndex, paragraphIndex);
    return leftDistance - rightDistance;
  });
}

export function sanitizeModelRecoveryQuestion(question = {}, options = {}) {
  const prompt = normaliseRecoveryLabel(question.prompt);
  const hint = normaliseRecoveryLabel(question.hint);
  const answer = normaliseRecoveryLabel(question.answer);
  const chapterTitle = options.chapterTitle || "当前章节";
  const weakPrompt = isWeakRecoveryQuestion(prompt, { answer, detail: answer });
  const weakHint = hint ? isWeakRecoveryHint(hint) : false;

  if (!weakPrompt && !weakHint) {
    return {
      prompt,
      hint: hint || "",
      answer,
      repaired: false,
    };
  }

  const fallbackAnchor = options.fallbackAnchor || null;
  const repairedPrompt = fallbackAnchor
    ? questionFromEpisodeAnchor(fallbackAnchor, chapterTitle)
    : `继续读《${clipLabel(chapterTitle, 24)}》前，上一阶段最具体的主线变化是什么？`;
  const repairedHint = weakHint
    ? hintFromEvidenceExcerpt(options.evidenceExcerpt || answer || fallbackAnchor?.summary || fallbackAnchor?.detail || "")
    : hint;

  return {
    prompt: weakPrompt ? repairedPrompt : prompt,
    hint: repairedHint || "",
    answer,
    repaired: true,
  };
}

function evidenceDistance(item, chapterIndex, paragraphIndex) {
  const itemChapter = Number(item?.chapterIndex);
  const itemParagraph = Number(item?.paragraphIndex);
  if (!Number.isInteger(itemChapter) || !Number.isInteger(itemParagraph)) return 1e9;
  return Math.abs((itemChapter - chapterIndex) * 80 + (itemParagraph - paragraphIndex));
}

function stripLeadingConnectors(text) {
  return normaliseRecoveryLabel(text)
    .replace(/^(?:于是|因此|所以|然而|但是|可是|不过|后来|当时|此时|这时|接着|随后)/, "")
    .trim();
}

function clipLabel(value, max = 80) {
  const text = normaliseRecoveryLabel(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
