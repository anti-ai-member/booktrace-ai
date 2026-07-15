import "dotenv/config";
import express from "express";
import { ChatOpenAI } from "@langchain/openai";
import { BOOK_TYPES } from "./src/bookTaxonomy.js";

const app = express();
app.use(express.json({ limit: "12mb" }));

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

app.get("/api/health", (_request, response) => response.json({ ok: true }));

app.post("/api/classify-book", async (request, response) => {
  const { provider = "deepseek", model, book } = request.body || {};
  const config = PROVIDERS[provider];
  if (!config) return response.status(400).json({ error: "Unsupported model provider" });
  if (!book?.title) return response.status(400).json({ error: "Missing book metadata" });

  const apiKey = process.env[config.apiKey];
  if (!apiKey) return response.status(400).json({ error: `Please configure ${config.apiKey} in .env first` });

  try {
    const modelClient = new ChatOpenAI({
      apiKey,
      model: model || config.defaultModel,
      temperature: 0,
      configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
    });
    const result = await modelClient.invoke([
      ["system", "You classify books for a quiet AI reading app. Return compact JSON only, with no Markdown."],
      ["human", buildClassificationPrompt(book)],
    ]);
    const parsed = parseJson(result.content);
    const profile = normaliseProfile({ category: parsed.category, facets: parsed.facets });
    response.json({ provider, model: model || config.defaultModel, profile, reason: String(parsed.reason || "").slice(0, 140) });
  } catch (error) {
    response.status(502).json({ error: error.message || "Book classification failed" });
  }
});

app.post("/api/analyze", async (request, response) => {
  const { provider = "deepseek", model, book, previousIndex, cursor, scope = "read" } = request.body || {};
  const config = PROVIDERS[provider];
  if (!config) return response.status(400).json({ error: "不支持的模型提供方" });
  if (!book?.chapters?.length) return response.status(400).json({ error: "没有可分析的正文内容" });

  const apiKey = process.env[config.apiKey];
  if (!apiKey) return response.status(400).json({ error: `请先在 .env 中配置 ${config.apiKey}` });

  try {
    const modelClient = new ChatOpenAI({
      apiKey,
      model: model || config.defaultModel,
      temperature: 0,
      configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
    });
    const result = await modelClient.invoke([
      ["system", "你是严谨的阅读索引分析器。只根据提供的原文工作，不得补写或猜测。只返回 JSON，不要 Markdown。"],
      ["human", `${buildAnalysisPrompt(book, previousIndex, cursor, scope)}\n\n关系图补充输出：在同一个 JSON 顶层增加 relationships 数组。只收录与当前已读主线直接相关、且原文能明确证明的关系；不要根据常识推断。每项格式为 {"source":"实体原文名","sourceType":"person|organization|event","target":"实体原文名","targetType":"person|organization|event","relation":"指挥/隶属/协作/对立/参与等简短关系","relationKind":"command|belongs|cooperate|conflict|participate|other","importance":"primary|secondary","evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":"直接证明关系的原文短句"}}。同一对实体最多保留一条最有证据的关系；没有可靠关系就返回空数组。`],
    ]);
    const parsed = parseJson(result.content);
    const index = normaliseIndex(parsed, book.chapters);
    const profile = normaliseProfile(parsed.bookProfile);
    response.json({ provider, model: model || config.defaultModel, index, profile, summary: buildSummary(index, cursor) });
  } catch (error) {
    response.status(502).json({ error: error.message || "大模型分析失败" });
  }
});

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

function buildAnalysisPrompt(book, previousIndex, cursor, scope) {
  const source = book.chapters.map((chapter, chapterIndex) => ({
    chapterIndex: chapter.sourceChapterIndex ?? chapterIndex,
    title: chapter.title,
    paragraphs: chapter.paragraphs.map((text, paragraphIndex) => ({ paragraphIndex, text })),
  }));
  const scopeInstruction = scope === "full"
    ? "本次为手动全书分析：提供的是全书正文。请重新建立完整索引，不受上次索引限制。"
    : "本次为增量已读分析：本次断点是读者已读页面中最靠后的页，正文仅包含断点之前、且上次分析之后的已读内容。先阅读上次分析结果，再只根据新增正文补充、修正或删除条目；不要推断未读内容。";
  return `分析下面这本书的正文，生成读者可追溯的累计主线索引。${scopeInstruction}\n\n图书类型候选：${JSON.stringify(BOOK_TYPES.map((type) => ({ name: type.name, facets: type.facets })))}。先选择最匹配的一个类型，并只从该类型的 facets 中挑选 4-6 个最适合本书的索引面板。\n\n严格筛选规则：\n1. 时间线只收录直接推动中心主题的转折、行动、冲突、决策、迁移、结果或阶段性变化。人物出生/死亡年份、作者或出版信息、顺带提及的历史年代、类比举例、与主叙事没有因果关系的背景事件，一律不要收录。\n2. 地点只收录主线人物或主体实际到达、行动、冲突、停留、决策或反复围绕的关键空间。不要收录人物籍贯、出生地、出版地、顺带提到的地名，或仅用于背景说明的地名。\n3. 每个人物、地点与时间节点必须标注 priority：primary 仅限持续推动中心主题、读者必须记住的关键角色/关键空间/重大历史节点；secondary 用于与主线相关但不需要默认展开的次级条目。优先少而准，primary 人物、地点和时间节点各不超过 8 个。\n4. 每个人物必须给出 1-2 个 attributes，只能是对主线重要的身份、阵营、职责或关键关系；每个属性应是简短名词短语，不能重复人名、不能编造。\n5. 地点名称必须逐字来自 evidence.quote 的原文，不能凭常识补全、纠正、合并或猜测。若不能确定其与主题的关系，宁可不收录。\n6. 人物只收录持续影响主线的核心角色；不要把被提及一次的背景人物当作人物卡。\n7. 每个条目必须有至少一个准确的 chapterIndex 与 paragraphIndex 作为 evidence；quote 必须是对应原文的短摘，并直接证明该条目的主线关联。\n8. timeline 按事件发生的时间排序；primary 时间节点必须是具有历史意义或结构性转折的事件，普通背景日期、人物履历日期、出版日期、类比日期只能标为 secondary 或不输出；日期不明确时不要臆测。最多输出 24 个时间节点、20 个地点、20 个人物，优先少而准确。\n9. JSON 格式必须为：\n{\n  "bookProfile":{"category":"候选中的一个类型", "facets":["索引面板"]},\n  "people": [{"name":"", "priority":"primary|secondary", "attributes":["身份或职责", "关键关系"], "summary":"", "evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],\n  "places": [{"name":"", "priority":"primary|secondary", "summary":"", "evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}],\n  "timeline": [{"date":"", "priority":"primary|secondary", "title":"", "summary":"", "evidence":{"chapterIndex":0,"paragraphIndex":0,"quote":""}}]\n}\n\n书名：${book.title}\n上次分析结果：${JSON.stringify(previousIndex || { people: [], places: [], timeline: [] })}\n本次分析断点：${JSON.stringify(cursor)}\n本次正文：${JSON.stringify(source)}`;
}

function parseJson(content) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

function normaliseIndex(raw, chapters) {
  const makeEntry = (kind, item, index) => {
    const evidence = item.evidence || {};
    const summary = String(item.summary || "").trim();
    const quote = String(evidence.quote || "").trim();
    const requestedChapter = Number(evidence.chapterIndex);
    const chapter = chapters.find((candidate, chapterIndex) => (candidate.sourceChapterIndex ?? chapterIndex) === requestedChapter) || chapters[0];
    const chapterIndex = chapter.sourceChapterIndex ?? chapters.indexOf(chapter);
    const paragraphIndex = clamp(evidence.paragraphIndex, 0, chapter.paragraphs.length - 1);
    const name = kind === "timeline" ? item.date : item.name;
    return {
      id: `${kind}-${index}-${name}`,
      name,
      subtitle: kind === "timeline" ? item.title : summary,
      detail: kind === "timeline" ? summary : summary || quote,
      evidenceQuote: quote,
      priority: item.priority === "primary" ? "primary" : "secondary",
      attributes: kind === "person" ? (Array.isArray(item.attributes) ? item.attributes.filter((attribute) => typeof attribute === "string" && attribute.trim()).slice(0, 2) : []) : [],
      sortKey: kind === "timeline" ? parseDate(item.date) : index,
      occurrence: { chapterIndex, paragraphIndex },
      occurrences: [{ chapterIndex, paragraphIndex }],
    };
  };
  const timeline = (raw.timeline || []).map((item, index) => makeEntry("timeline", item, index)).sort((a, b) => a.sortKey - b.sortKey);
  const relationships = (raw.relationships || []).map((item, index) => {
    const evidence = item.evidence || {};
    const requestedChapter = Number(evidence.chapterIndex);
    const chapter = chapters.find((candidate, chapterIndex) => (candidate.sourceChapterIndex ?? chapterIndex) === requestedChapter) || chapters[0];
    const chapterIndex = chapter.sourceChapterIndex ?? chapters.indexOf(chapter);
    const source = String(item.source || "").trim();
    const target = String(item.target || "").trim();
    const relation = String(item.relation || "").trim();
    if (!source || !target || !relation || source === target) return null;
    return {
      id: `relationship-${index}-${source}-${target}`,
      source,
      target,
      sourceType: ["person", "organization", "event"].includes(item.sourceType) ? item.sourceType : "person",
      targetType: ["person", "organization", "event"].includes(item.targetType) ? item.targetType : "person",
      relation,
      relationKind: ["command", "belongs", "cooperate", "conflict", "participate", "other"].includes(item.relationKind) ? item.relationKind : "other",
      importance: item.importance === "primary" ? "primary" : "secondary",
      evidence: { chapterIndex, paragraphIndex: clamp(evidence.paragraphIndex, 0, chapter.paragraphs.length - 1), quote: String(evidence.quote || "").slice(0, 160) },
    };
  }).filter(Boolean).slice(0, 36);
  return {
    people: (raw.people || []).map((item, index) => makeEntry("person", item, index)),
    places: (raw.places || []).map((item, index) => makeEntry("place", item, index)),
    timeline,
    relationships,
  };
}

function normaliseProfile(profile) {
  const matched = BOOK_TYPES.find((type) => type.name === profile?.category) || BOOK_TYPES[0];
  const facets = Array.isArray(profile?.facets) ? profile.facets.filter((facet) => matched.facets.includes(facet)).slice(0, 6) : matched.facets.slice(0, 6);
  return { category: matched.name, facets: facets.length ? facets : matched.facets.slice(0, 6) };
}

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : min;
}

function parseDate(value) {
  const match = String(value || "").match(/(\d{4})(?:[-年/.](\d{1,2}))?(?:[-月/.](\d{1,2}))?/);
  return match ? Date.UTC(Number(match[1]), Number(match[2] || 1) - 1, Number(match[3] || 1)) : Number.MAX_SAFE_INTEGER;
}

function buildSummary(index, cursor) {
  const summarizeEntities = (items) => ({
    primary: items.filter((item) => item.priority === "primary").slice(0, 6).map((item) => item.name),
    secondary: items.filter((item) => item.priority !== "primary").slice(0, 6).map((item) => item.name),
    recent: [...items].filter((item) => item.occurrence.chapterIndex === cursor?.chapterIndex).slice(-4).map((item) => item.name),
  });
  return {
    people: summarizeEntities(index.people),
    places: summarizeEntities(index.places),
    events: index.timeline.slice(-6).map((item) => `${item.name} · ${item.subtitle}`),
    cursor,
  };
}

app.listen(8787, "127.0.0.1", () => console.log("AI analysis service listening on http://127.0.0.1:8787"));
