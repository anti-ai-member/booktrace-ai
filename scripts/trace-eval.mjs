import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { ChatOpenAI } from "@langchain/openai";
import { buildMemoryCandidates, buildMemoryEvidenceStore, locateEvidence } from "../src/memoryEngine.js";
import { resolveTraceProfile, traceProfileForPrompt } from "../src/traceProfiles.js";

const DEFAULT_BOOK_HINT = "长征";
const DEFAULT_REPORT = "reports/trace-eval-long-march-30p.json";
const PAGE_CHAR_BUDGET = 720;
const ACTION_WORDS = /出发|抵达|进入|离开|命令|决定|转移|会合|战斗|冲突|失败|胜利|证明|导致|形成|改变|抛弃|召开|陷入|警戒|指挥|围剿|进攻|撤退|突破|主张|提出/;

const args = parseArgs(process.argv.slice(2));
const bookPath = args.book || await findDefaultBookPath(DEFAULT_BOOK_HINT);
const pageCount = Number(args.pages || 30);
const reportPath = args.out || DEFAULT_REPORT;
const live = Boolean(args.live);
const judge = Boolean(args.judge);
const typeSmoke = Boolean(args.typeSmoke || args["type-smoke"]);
const apiUrl = args.api || "http://127.0.0.1:8787/api/analyze";

const PROVIDERS = {
  deepseek: {
    apiKey: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
  },
  openai: {
    apiKey: "OPENAI_API_KEY",
    baseURL: undefined,
    defaultModel: "gpt-4.1-mini",
  },
};

const book = await parseEpubFromFile(bookPath);
const scoped = sliceBookToPseudoPages(book, pageCount);
const traceProfile = traceProfileForPrompt(resolveTraceProfile("历史纪实 / 传记", ["人物", "组织", "地点", "时间线", "关键事件", "关系"]));
const fallbackIndex = { people: [], organizations: [], places: [], timeline: [], relationships: [] };
const memoryEvidenceStore = buildMemoryEvidenceStore({ ...book, chapters: scoped.chapters }, fallbackIndex);
const candidates = buildMemoryCandidates(scoped.chapters, traceProfile);
const candidateQuery = [
  book.title,
  book.creator,
  traceProfile.category,
  ...candidates.slice(0, 24).map((item) => item.name),
  ...scoped.chapters.flatMap((chapter) => chapter.paragraphs.slice(0, 2).map(paragraphText)).slice(0, 8),
].filter(Boolean).join(" ");
const supportingEvidence = locateEvidence(memoryEvidenceStore, {
  query: candidateQuery,
  scopeCursor: scoped.cursor,
  currentCursor: scoped.cursor,
  traceIndex: fallbackIndex,
  topK: 16,
}).map((item) => ({
  cite: item.cite,
  chapterIndex: item.chapterIndex,
  paragraphIndex: item.paragraphIndex,
  chapterTitle: item.chapterTitle,
  quote: item.cite?.quote || item.excerpt,
  score: Number(item.score.toFixed(3)),
  matchSources: item.matchSources,
}));

const result = live
  ? await runLiveTrace({ apiUrl, book, scoped, traceProfile, candidates, supportingEvidence })
  : { index: fallbackIndex, profile: { category: "历史纪实 / 传记", facets: ["人物", "组织", "地点", "时间线", "关键事件", "关系"] }, traceMemory: null };

const report = evaluateTrace({
  book,
  scoped,
  traceProfile,
  candidates,
  supportingEvidence,
  result,
  mode: live ? "live-model" : "offline-preflight",
});

if (judge) {
  report.judge = await runJudgeEvaluation({ report, result, book, scoped, traceProfile });
  report.scores.judgeAverage = report.judge.average;
  report.scores.overallWithJudge = Math.round((report.scores.overall * 0.75) + (report.judge.average * 20 * 0.25));
}
if (typeSmoke) {
  report.typeSmoke = evaluateTypeSmokeFixtures();
}
report.pass = buildPassStatus(report);

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Trace eval report written: ${reportPath}`);
console.log(`Overall: ${report.scores.overall}/100`);
if (report.scores.overallWithJudge) console.log(`Overall with judge: ${report.scores.overallWithJudge}/100`);
console.log(report.summary.join("\n"));
if (report.pass?.passed === false) console.log(`Gate failed: ${report.pass.reasons.join("; ")}`);

function evaluateTrace({ book, scoped, traceProfile, candidates, supportingEvidence, result, mode }) {
  const index = result.index || {};
  const entries = flattenIndex(index);
  const sourceMap = buildSourceMap(scoped.chapters);
  const evidenceChecks = entries.map((entry) => validateEvidence(entry, sourceMap, scoped.cursor));
  const validEvidence = evidenceChecks.filter((item) => item.valid).length;
  const evidenceScore = entries.length ? Math.round((validEvidence / entries.length) * 100) : mode === "offline-preflight" ? 100 : 0;
  const scopeScore = entries.length ? Math.round((evidenceChecks.filter((item) => item.inScope).length / entries.length) * 100) : mode === "offline-preflight" ? 100 : 0;
  const uniqueNames = new Set(entries.map((entry) => normalise(entry.name)).filter(Boolean));
  const redundancyScore = entries.length ? Math.round((uniqueNames.size / entries.length) * 100) : 100;
  const priorityScore = scorePriority(index, traceProfile);
  const relevanceScore = scoreRelevance(entries, sourceMap, candidates);
  const coverageScore = scoreCandidateCoverage(entries, candidates);
  const formatScore = scoreFormat(result);
  const noSpoilerScore = evidenceChecks.some((item) => !item.inScope) ? 0 : 100;
  const overall = Math.round(
    (0.2 * evidenceScore)
    + (0.14 * relevanceScore)
    + (0.14 * coverageScore)
    + (0.12 * priorityScore)
    + (0.12 * noSpoilerScore)
    + (0.1 * redundancyScore)
    + (0.1 * formatScore)
    + (0.08 * scopeScore)
  );

  const failures = evidenceChecks.filter((item) => !item.valid || !item.inScope);
  return {
    meta: {
      mode,
      book: { title: book.title, creator: book.creator },
      pages: scoped.pages.length,
      pageCharBudget: PAGE_CHAR_BUDGET,
      cursor: scoped.cursor,
      generatedAt: new Date().toISOString(),
      evaluationBasis: "Objective checks plus Agentic-style dimensions: task success, groundedness, relevance, completeness, concision, safety/no-spoiler, and user usefulness.",
    },
    scores: {
      overall,
      evidenceGrounding: evidenceScore,
      scopeSafety: scopeScore,
      noSpoiler: noSpoilerScore,
      relevance: relevanceScore,
      coverage: coverageScore,
      priorityCalibration: priorityScore,
      nonRedundancy: redundancyScore,
      jsonFormat: formatScore,
    },
    counts: {
      paragraphs: scoped.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0),
      candidates: candidates.length,
      supportingEvidence: supportingEvidence.length,
      outputEntries: entries.length,
      validEvidence,
      invalidEvidence: failures.length,
    },
    summary: [
      `候选池 ${candidates.length} 个，ContextCite 证据 ${supportingEvidence.length} 条，模型输出 ${entries.length} 条。`,
      `证据有效率 ${evidenceScore}，相关性 ${relevanceScore}，覆盖率 ${coverageScore}，优先级校准 ${priorityScore}。`,
      failures.length ? `发现 ${failures.length} 条证据或范围问题，请看 failures。` : "未发现证据越界或明显无效证据。",
    ],
    topCandidates: candidates.slice(0, 20),
    supportingEvidence,
    outputPreview: entries.slice(0, 30),
    failures,
    judgeRubric: buildJudgeRubric(),
    rawResult: result,
  };
}

function buildJudgeRubric() {
  return {
    scale: "1-5",
    dimensions: [
      { id: "task_success", question: "Trace 是否帮助读者回忆前 30 页主线，而不是机械摘要？" },
      { id: "groundedness", question: "每个人物、地点、时间、事件是否都有可核验原文证据？" },
      { id: "relevance", question: "是否过滤了出生日期、背景人物、出版信息、顺带地名等弱相关内容？" },
      { id: "coverage", question: "是否覆盖了影响后续理解的关键人物、组织、地点、事件和关系？" },
      { id: "priority", question: "primary 是否真的适合默认展示，secondary 是否适合折叠展示？" },
      { id: "conciseness", question: "输出是否少而准，没有百科式穷举？" },
      { id: "safety", question: "是否严格不泄露当前已读范围之后的信息？" },
      { id: "usefulness", question: "用户回到阅读页时，这些条目是否能减少遗忘和查找成本？" },
    ],
  };
}

async function runJudgeEvaluation({ report, result, book, scoped, traceProfile }) {
  const provider = args.judgeProvider || args.provider || "deepseek";
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unsupported judge provider: ${provider}`);
  const apiKey = process.env[config.apiKey];
  if (!apiKey) throw new Error(`Please configure ${config.apiKey} in .env before running --judge`);
  const modelClient = new ChatOpenAI({
    apiKey,
    model: args.judgeModel || args.model || config.defaultModel,
    temperature: 0,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  });
  const payload = compactJudgePayload({ report, result, book, scoped, traceProfile });
  const judgeResult = await modelClient.invoke([
    ["system", "You are a strict evaluator for an AI reading-memory product. Score only the supplied trace output against the supplied read-range evidence. Return JSON only."],
    ["human", buildJudgePrompt(payload)],
  ]);
  return normaliseJudgeResult(parseJson(judgeResult.content), provider, args.judgeModel || args.model || config.defaultModel);
}

function compactJudgePayload({ report, result, book, scoped, traceProfile }) {
  return {
    book: report.meta.book || { title: book.title, creator: book.creator },
    cursor: scoped.cursor,
    traceProfile,
    objectiveScores: report.scores,
    counts: report.counts,
    failures: report.failures.slice(0, 20),
    supportingEvidence: (report.supportingEvidence || []).slice(0, 12).map((item) => ({
      ref: item.cite?.label,
      chapterTitle: item.chapterTitle,
      chapterIndex: item.chapterIndex,
      paragraphIndex: item.paragraphIndex,
      quote: item.quote,
    })),
    output: {
      people: (result.index?.people || []).slice(0, 16),
      organizations: (result.index?.organizations || []).slice(0, 16),
      places: (result.index?.places || []).slice(0, 16),
      timeline: (result.index?.timeline || []).slice(0, 16),
      relationships: (result.index?.relationships || []).slice(0, 16),
      memoryAnchors: (result.traceMemory?.anchors || []).slice(0, 12),
    },
  };
}

function buildJudgePrompt(payload) {
  return `Evaluate whether this AI Trace result helps a reader resume and understand the already-read range.

Use a 1-5 integer scale:
1 = harmful or mostly wrong
2 = weak, many important failures
3 = acceptable but needs clear fixes
4 = good, minor issues
5 = excellent

Dimensions:
- task_success: helps the reader recover the main thread, not just a mechanical entity list.
- groundedness: claims are backed by cited source evidence.
- relevance: filters incidental dates, background names, publication metadata, and throwaway locations.
- coverage: captures the most important memory anchors for this book type.
- priority: primary/secondary/default-display choices are calibrated.
- conciseness: selective and useful, not encyclopedic.
- safety: no unread-range leakage.
- usefulness: reduces rereading and lookup cost.

Return JSON exactly:
{
  "scores":{"task_success":1,"groundedness":1,"relevance":1,"coverage":1,"priority":1,"conciseness":1,"safety":1,"usefulness":1},
  "criticalIssues":[""],
  "recommendations":[""],
  "rationale":""
}

Payload:
${JSON.stringify(payload)}`;
}

function normaliseJudgeResult(raw, provider, model) {
  const scoreKeys = ["task_success", "groundedness", "relevance", "coverage", "priority", "conciseness", "safety", "usefulness"];
  const scores = Object.fromEntries(scoreKeys.map((key) => [key, clampScore(raw?.scores?.[key])]));
  const average = Number((scoreKeys.reduce((sum, key) => sum + scores[key], 0) / scoreKeys.length).toFixed(2));
  return {
    provider,
    model,
    average,
    scores,
    criticalIssues: arrayText(raw?.criticalIssues).slice(0, 8),
    recommendations: arrayText(raw?.recommendations).slice(0, 8),
    rationale: String(raw?.rationale || "").trim().slice(0, 900),
  };
}

function buildPassStatus(report) {
  const reasons = [];
  const outputMode = report.meta?.mode !== "offline-preflight";
  if (outputMode && report.scores.overall < 80) reasons.push(`overall ${report.scores.overall} < 80`);
  if (outputMode && report.scores.evidenceGrounding < 90) reasons.push(`evidenceGrounding ${report.scores.evidenceGrounding} < 90`);
  if (outputMode && report.scores.scopeSafety !== 100) reasons.push(`scopeSafety ${report.scores.scopeSafety} != 100`);
  if (outputMode && report.scores.noSpoiler !== 100) reasons.push(`noSpoiler ${report.scores.noSpoiler} != 100`);
  if (outputMode && report.scores.relevance < 75) reasons.push(`relevance ${report.scores.relevance} < 75`);
  if (report.judge) {
    Object.entries(report.judge.scores)
      .filter(([, score]) => score < 3)
      .forEach(([key, score]) => reasons.push(`judge ${key} ${score} < 3`));
  }
  if (report.typeSmoke?.passed === false) reasons.push("typeSmoke failed");
  return {
    passed: reasons.length === 0,
    reasons,
    criteria: {
      overall: ">= 80",
      evidenceGrounding: ">= 90",
      scopeSafety: "100",
      noSpoiler: "100",
      relevance: ">= 75",
      judgeDimensions: ">= 3 when --judge is used",
    },
  };
}

async function runLiveTrace({ apiUrl, book, scoped, traceProfile, candidates, supportingEvidence }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      scope: "read",
      previousBookMemory: null,
      previousIndex: null,
      previousTraceMemory: null,
      cursor: scoped.cursor,
      traceProfile,
      candidates,
      supportingEvidence,
      book: {
        title: book.title,
        creator: book.creator,
        bookType: "历史纪实 / 传记",
        indexSchema: ["人物", "组织", "地点", "时间线", "关键事件", "关系"],
        chapters: scoped.chapters,
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Trace API failed: ${response.status}`);
  return payload;
}

function flattenIndex(index) {
  const toEntry = (kind, item) => ({
    kind,
    name: String(item?.name || item?.date || item?.title || "").trim(),
    priority: item?.priority || item?.importance || "",
    evidence: item?.evidence || (item?.occurrence ? {
      chapterIndex: item.occurrence.chapterIndex,
      paragraphIndex: item.occurrence.paragraphIndex,
      quote: item.evidenceQuote || item.detail || item.subtitle || "",
    } : {}),
    summary: item?.summary || item?.detail || item?.subtitle || "",
  });
  return [
    ...(index.people || []).map((item) => toEntry("people", item)),
    ...(index.organizations || []).map((item) => toEntry("organizations", item)),
    ...(index.places || []).map((item) => toEntry("places", item)),
    ...(index.timeline || []).map((item) => toEntry("timeline", item)),
    ...(index.relationships || []).map((item) => toEntry("relationships", { ...item, name: `${item.source || ""}-${item.target || ""}` })),
  ].filter((entry) => entry.name && entry.name !== "undefined");
}

function validateEvidence(entry, sourceMap, cursor) {
  const chapterIndex = Number(entry.evidence?.chapterIndex);
  const paragraphIndex = Number(entry.evidence?.paragraphIndex);
  const quote = String(entry.evidence?.quote || "").trim();
  const key = `${chapterIndex}:${paragraphIndex}`;
  const source = sourceMap.get(key) || "";
  const inScope = chapterIndex < cursor.chapterIndex || (chapterIndex === cursor.chapterIndex && paragraphIndex <= cursor.paragraphIndex);
  const quoteNeedle = quote.replace(/\s+/g, "");
  const sourceNeedle = source.replace(/\s+/g, "");
  const valid = Number.isInteger(chapterIndex) && Number.isInteger(paragraphIndex) && Boolean(source) && quoteNeedle.length >= 4 && sourceNeedle.includes(quoteNeedle.slice(0, 80));
  return { entry, valid, inScope, reason: valid ? "" : "missing_or_unmatched_quote" };
}

function scorePriority(index, traceProfile) {
  const anchors = new Map((traceProfile.anchors || []).map((anchor) => [anchor.id, anchor]));
  const groups = {
    people: index.people || [],
    organizations: index.organizations || [],
    places: index.places || [],
    timeline: index.timeline || [],
  };
  const scores = Object.entries(groups).map(([kind, items]) => {
    const anchor = anchors.get(kind) || anchors.get(kind.replace(/s$/, ""));
    const primary = items.filter((item) => item.priority === "primary").length;
    const cap = anchor?.maxPrimary || 8;
    if (!items.length) return 100;
    if (primary === 0 && items.length > 3) return 55;
    if (primary <= cap) return 100;
    return Math.max(30, 100 - ((primary - cap) * 12));
  });
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function scoreRelevance(entries, sourceMap, candidates) {
  if (!entries.length) return 0;
  const candidateNames = new Set(candidates.map((item) => normalise(item.name)));
  const scored = entries.map((entry) => {
    const evidence = sourceMap.get(`${entry.evidence?.chapterIndex}:${entry.evidence?.paragraphIndex}`) || "";
    let score = 0.45;
    if (ACTION_WORDS.test(evidence)) score += 0.25;
    if (candidateNames.has(normalise(entry.name))) score += 0.2;
    if (entry.priority === "primary") score += 0.1;
    if (/出生|出版|印刷|作者|年月北京|第\d+版/.test(evidence) && entry.kind !== "relationships") score -= 0.35;
    return Math.max(0, Math.min(1, score));
  });
  return Math.round((scored.reduce((sum, score) => sum + score, 0) / scored.length) * 100);
}

function scoreCandidateCoverage(entries, candidates) {
  const highImpact = candidates.filter((item) => (item.impactHint || 0) >= 5).slice(0, 16);
  if (!highImpact.length) return 100;
  const entryText = entries.map((entry) => normalise([entry.name, entry.summary].join(" "))).join(" ");
  const covered = highImpact.filter((candidate) => entryText.includes(normalise(candidate.name).slice(0, 12))).length;
  return Math.round((covered / highImpact.length) * 100);
}

function scoreFormat(result) {
  const index = result.index || {};
  const required = ["people", "organizations", "places", "timeline", "relationships"];
  const present = required.filter((key) => Array.isArray(index[key])).length;
  return Math.round((present / required.length) * 100);
}

function buildSourceMap(chapters) {
  const map = new Map();
  chapters.forEach((chapter, chapterIndex) => {
    const sourceChapterIndex = chapter.sourceChapterIndex ?? chapterIndex;
    chapter.paragraphs.forEach((item, paragraphIndex) => {
      const sourceParagraphIndex = typeof item === "object" ? item.paragraphIndex ?? paragraphIndex : paragraphIndex;
      map.set(`${sourceChapterIndex}:${sourceParagraphIndex}`, paragraphText(item));
    });
  });
  return map;
}

function sliceBookToPseudoPages(book, pages) {
  const chapters = [];
  const pageMarks = [];
  let currentChars = 0;
  let currentPageChars = 0;
  let lastCursor = { chapterIndex: 0, paragraphIndex: 0, pageIndex: 0, pageCount: pages };

  outer:
  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
    const chapter = book.chapters[chapterIndex];
    const nextChapter = { ...chapter, sourceChapterIndex: chapterIndex, paragraphs: [] };
    for (let paragraphIndex = 0; paragraphIndex < chapter.paragraphs.length; paragraphIndex += 1) {
      const paragraph = chapter.paragraphs[paragraphIndex];
      nextChapter.paragraphs.push(paragraph);
      currentChars += paragraph.length;
      currentPageChars += paragraph.length;
      lastCursor = { chapterIndex, paragraphIndex, pageIndex: Math.min(pageMarks.length, pages - 1), pageCount: pages };
      if (currentPageChars >= PAGE_CHAR_BUDGET) {
        pageMarks.push({ chapterIndex, paragraphIndex, chars: currentChars });
        currentPageChars = 0;
        if (pageMarks.length >= pages) {
          chapters.push(nextChapter);
          break outer;
        }
      }
    }
    if (nextChapter.paragraphs.length) chapters.push(nextChapter);
  }
  return { chapters, pages: pageMarks, cursor: lastCursor };
}

async function parseEpubFromFile(filePath) {
  const data = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(data);
  const container = await zip.file("META-INF/container.xml").async("text");
  const opfPath = attr(container.match(/<rootfile\b[^>]*>/i)?.[0] || "", "full-path");
  if (!opfPath) throw new Error("EPUB container missing OPF path");
  const opfSource = await zip.file(opfPath).async("text");
  const basePath = opfPath.split("/").slice(0, -1).join("/");
  const manifest = new Map([...opfSource.matchAll(/<item\b[^>]*>/gi)].map((match) => [attr(match[0], "id"), {
    href: attr(match[0], "href"),
    type: attr(match[0], "media-type"),
  }]));
  const title = tagText(opfSource, "dc:title") || path.basename(filePath);
  const creator = tagText(opfSource, "dc:creator") || "";
  const spineIds = [...opfSource.matchAll(/<itemref\b[^>]*>/gi)].map((match) => attr(match[0], "idref")).filter(Boolean);
  const chapters = [];
  for (let index = 0; index < spineIds.length; index += 1) {
    const item = manifest.get(spineIds[index]);
    if (!item?.href || !/x?html/i.test(item.type || "")) continue;
    const entryPath = normalisePath(basePath, item.href);
    const entry = zip.file(entryPath);
    if (!entry) continue;
    const html = await entry.async("text");
    const heading = stripTags((html.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/i) || [])[0] || "").trim();
    const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 18);
    if (paragraphs.length) chapters.push({ id: `chapter-${index}`, title: heading || `第 ${chapters.length + 1} 节`, paragraphs });
  }
  return { id: "long-march-eval", title, creator, chapters };
}

async function findDefaultBookPath(hint) {
  const booksDir = path.resolve("books");
  const entries = await fs.readdir(booksDir).catch(() => []);
  const epubs = entries.filter((entry) => /\.epub$/i.test(entry));
  const preferred = epubs.find((entry) => normalise(entry).includes(normalise(hint)));
  const selected = preferred || epubs[0];
  if (!selected) {
    throw new Error(`No EPUB found in ${booksDir}. Pass --book <path> to evaluate a specific file.`);
  }
  return path.join("books", selected);
}

function parseJson(content) {
  const text = String(content || "").trim();
  if (!text) throw new Error("Model returned empty JSON content");
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced.trim());
    const object = text.match(/\{[\s\S]*\}/)?.[0];
    if (object) return JSON.parse(object);
    throw new Error("Model response did not contain parseable JSON");
  }
}

function evaluateTypeSmokeFixtures() {
  const fixtures = [
    {
      id: "science",
      type: "science",
      expectedAnchors: ["concepts", "definitions", "mechanisms"],
      forbiddenPrimaryKinds: ["person", "place"],
      chapters: [{
        title: "光合作用",
        paragraphs: [
          "光合作用把光能转化为化学能，叶绿素吸收光子后启动电子传递链。",
          "限制因子原理解释了为什么二氧化碳或温度成为瓶颈时，增加光照不再提高效率。",
        ],
      }],
    },
    {
      id: "business",
      type: "business",
      expectedAnchors: ["frameworks", "cases", "metrics"],
      forbiddenPrimaryKinds: ["person", "place"],
      chapters: [{
        title: "经营模型",
        paragraphs: [
          "一家企业采用三层增长框架，把核心优化、相邻业务和探索项目分开管理。",
          "毛利率和留存率是判断新渠道是否继续投入的两个关键指标。",
        ],
      }],
    },
    {
      id: "fiction",
      type: "fiction",
      expectedAnchors: ["people", "relationships", "plot"],
      forbiddenPrimaryKinds: [],
      chapters: [{
        title: "信",
        paragraphs: [
          "林嘉把密信藏了起来，因为它证明陈珂背叛了城防军。",
          "在旧桥边，许澜选择保护林嘉，这让两人脆弱的同盟转向信任。",
        ],
      }],
    },
    {
      id: "technology",
      type: "technology",
      expectedAnchors: ["concepts", "apis", "flows"],
      forbiddenPrimaryKinds: ["person", "place"],
      chapters: [{
        title: "任务队列",
        paragraphs: [
          "后台任务队列把 HTTP 请求和缓慢的文档解析解耦，让前台界面保持响应。",
          "重试策略记录失败任务、退避时间和应该恢复处理的检查点。",
        ],
      }],
    },
  ];

  const cases = fixtures.map((fixture) => {
    const profile = traceProfileForPrompt(resolveTraceProfile(fixture.type, []));
    const candidates = buildMemoryCandidates(fixture.chapters, profile);
    const candidateTypes = new Set(candidates.map((item) => item.type));
    const expectedMatched = fixture.expectedAnchors.filter((anchorId) => (profile.anchors || []).some((anchor) => anchor.id === anchorId));
    const forbiddenFound = candidates.filter((item) => fixture.forbiddenPrimaryKinds.includes(item.type)).map((item) => item.name);
    return {
      id: fixture.id,
      profile: profile.id,
      category: profile.category,
      expectedMatched,
      candidateTypes: [...candidateTypes],
      candidates: candidates.slice(0, 8).map((item) => ({ type: item.type, name: item.name, score: item.impactHint })),
      passed: expectedMatched.length === fixture.expectedAnchors.length && candidates.length > 0 && forbiddenFound.length === 0,
      forbiddenFound,
    };
  });
  return {
    passed: cases.every((item) => item.passed),
    cases,
    criteria: "Each major book type resolves to its own memory anchors and does not force people/place candidates for concept-led nonfiction fixtures.",
  };
}

function parseArgs(argv) {
  const parsed = {};
  const booleanFlags = new Set(["live", "judge", "type-smoke", "typeSmoke"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--") && booleanFlags.has(item.slice(2))) {
      parsed[item.slice(2)] = true;
    } else if (item.startsWith("--")) {
      parsed[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function attr(tag, name) {
  return (tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i")) || [])[1] || "";
}

function tagText(source, tag) {
  return stripTags((source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "").trim();
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalisePath(base, href) {
  const parts = `${base}/${href.split("#")[0]}`.split("/");
  const resolved = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  });
  return resolved.join("/");
}

function normalise(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function paragraphText(item) {
  return typeof item === "object" ? String(item?.text || "") : String(item || "");
}

function clampScore(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(5, number));
}

function arrayText(value) {
  return (Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean);
}
