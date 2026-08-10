import { filterBookMemoryByCursor, normalizeBookMemory } from "./memoryModels.js";

const NODE_LIMIT = 7;
const EDGE_LIMIT = 8;
const ARGUMENT_KINDS = new Set(["claim", "reason", "evidence", "example", "conclusion", "objection"]);
const CONCEPT_KINDS = new Set(["concept", "definition", "mechanism", "framework"]);

export function buildLocalContextView({
  bookMemory = null,
  cursor = null,
  focusText = "",
  pageText = "",
} = {}) {
  const memory = filterBookMemoryByCursor(normalizeBookMemory(bookMemory || {}), cursor);
  const canonicalItems = collectCanonicalItems(memory);
  const aliases = buildAliasMap(canonicalItems);
  const nodes = new Map();
  const edges = [];

  const ensureNode = (item, fallback = {}) => {
    const name = clean(item?.name || fallback.name);
    const evidence = usableEvidence(item?.evidence) || usableEvidence(fallback.evidence);
    if (!name || !evidence) return null;
    const id = nodeId(name);
    const existing = nodes.get(id);
    const node = {
      id,
      name,
      label: name,
      type: item?.kind || fallback.type || "term",
      summary: clean(item?.summary || fallback.summary || evidence.quote),
      priority: item?.priority || fallback.priority || "secondary",
      evidence,
    };
    if (!existing || nodeRank(node) > nodeRank(existing)) nodes.set(id, node);
    return nodes.get(id);
  };

  const addEdge = ({ sourceItem, targetItem, sourceFallback, targetFallback, relation, evidence, kind, relationKind = "other" }) => {
    const source = ensureNode(sourceItem, sourceFallback);
    const target = ensureNode(targetItem, targetFallback);
    const edgeEvidence = usableEvidence(evidence) || source?.evidence || target?.evidence;
    if (!source || !target || source.id === target.id || !relation || !edgeEvidence) return;
    const key = `${source.id}|${target.id}|${normalize(relation)}`;
    if (edges.some((item) => item.key === key)) return;
    edges.push({
      id: `context-edge-${edges.length + 1}`,
      key,
      source: source.id,
      target: target.id,
      sourceName: source.name,
      targetName: target.name,
      sourceType: source.type,
      targetType: target.type,
      relation,
      kind,
      relationKind,
      evidence: edgeEvidence,
      priority: strongestPriority(source.priority, target.priority),
    });
  };

  (memory.relationships || []).forEach((relationship) => {
    addEdge({
      sourceItem: resolveAlias(aliases, relationship.source),
      targetItem: resolveAlias(aliases, relationship.target),
      sourceFallback: { name: relationship.source, type: relationship.sourceType, evidence: relationship.evidence },
      targetFallback: { name: relationship.target, type: relationship.targetType, evidence: relationship.evidence },
      relation: relationship.relation,
      evidence: relationship.evidence,
      kind: "relationship",
      relationKind: relationship.relationKind,
    });
  });

  (memory.topics || []).forEach((item) => {
    (item.prerequisites || []).forEach((reference) => addExplicitReferenceEdge({
      item, reference, aliases, addEdge, direction: "incoming", relation: "前置于", kind: "concept",
    }));
    (item.relatedTo || []).forEach((reference) => addExplicitReferenceEdge({
      item, reference, aliases, addEdge, direction: "outgoing", relation: "相关", kind: "concept",
    }));
  });

  [...(memory.timeline || []), ...(memory.episodic || [])].forEach((item) => {
    (item.causedBy || []).forEach((reference) => addExplicitReferenceEdge({
      item, reference, aliases, addEdge, direction: "incoming", relation: "导致", kind: "causal",
    }));
    (item.causes || []).forEach((reference) => addExplicitReferenceEdge({
      item, reference, aliases, addEdge, direction: "outgoing", relation: "导致", kind: "causal",
    }));
  });

  (memory.arguments || []).forEach((item) => {
    (item.supports || []).forEach((reference) => addExplicitReferenceEdge({
      item, reference, aliases, addEdge, direction: "outgoing", relation: "支持", kind: "argument",
    }));
    (item.respondsTo || []).forEach((reference) => addExplicitReferenceEdge({
      item, reference, aliases, addEdge, direction: "outgoing", relation: "回应", kind: "argument",
    }));
  });

  const focus = clean(focusText);
  const context = focus || clean(pageText);
  if (!context || !edges.length) return null;
  const focusNode = [...nodes.values()]
    .filter((node) => textMatchesNode(context, node.name))
    .sort((left, right) => focusRank(right, context) - focusRank(left, context))[0];
  if (!focusNode) return null;

  const localEdges = edges
    .filter((edge) => edge.source === focusNode.id || edge.target === focusNode.id)
    .sort((left, right) => edgeRank(right) - edgeRank(left))
    .slice(0, EDGE_LIMIT);
  if (!localEdges.length) return null;

  const includedIds = new Set([focusNode.id]);
  localEdges.forEach((edge) => {
    if (includedIds.size < NODE_LIMIT) includedIds.add(edge.source);
    if (includedIds.size < NODE_LIMIT) includedIds.add(edge.target);
  });
  const boundedEdges = localEdges.filter((edge) => includedIds.has(edge.source) && includedIds.has(edge.target));
  const boundedNodes = [...includedIds]
    .map((id) => nodes.get(id))
    .filter(Boolean)
    .slice(0, NODE_LIMIT);
  if (boundedNodes.length < 2 || !boundedEdges.length) return null;

  const mode = contextMode(focusNode, boundedEdges);
  return {
    mode,
    title: contextTitle(mode),
    actionLabel: "关联",
    focusId: focusNode.id,
    focusLabel: focusNode.name,
    nodes: boundedNodes,
    edges: boundedEdges,
  };
}

function collectCanonicalItems(memory) {
  return [
    ...(memory.entities || []),
    ...(memory.topics || []),
    ...(memory.arguments || []),
    ...(memory.timeline || []),
    ...(memory.episodic || []),
  ].filter((item) => item?.name && usableEvidence(item.evidence));
}

function buildAliasMap(items) {
  const aliases = new Map();
  items.forEach((item) => {
    [item.id, item.name].filter(Boolean).forEach((alias) => aliases.set(normalize(alias), item));
  });
  return aliases;
}

function resolveAlias(aliases, reference) {
  return aliases.get(normalize(reference)) || null;
}

function addExplicitReferenceEdge({ item, reference, aliases, addEdge, direction, relation, kind }) {
  const related = resolveAlias(aliases, reference);
  if (!related) return;
  addEdge(direction === "incoming"
    ? { sourceItem: related, targetItem: item, relation, evidence: item.evidence, kind }
    : { sourceItem: item, targetItem: related, relation, evidence: item.evidence, kind });
}

function usableEvidence(raw) {
  if (!raw) return null;
  const chapterIndex = Number(raw.chapterIndex);
  const paragraphIndex = Number(raw.paragraphIndex);
  const quote = clean(raw.quote || raw.excerpt || raw.cite?.quote);
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex) || !quote || quote.length < 4) return null;
  return { ...raw, chapterIndex, paragraphIndex, quote };
}

function textMatchesNode(text, name) {
  const haystack = normalize(text);
  const needle = normalize(name);
  return needle.length >= 2 && haystack.includes(needle);
}

function focusRank(node, context) {
  const exact = normalize(context) === normalize(node?.name) ? 100 : 0;
  return exact + nodeRank(node) * 10 + Math.min(normalize(node?.name).length, 9);
}

function nodeId(name) {
  return `context:${normalize(name)}`;
}

function contextMode(focus, edges) {
  if (CONCEPT_KINDS.has(focus?.type) || edges.some((edge) => edge.kind === "concept")) return "concept";
  if (ARGUMENT_KINDS.has(focus?.type) || edges.some((edge) => edge.kind === "argument")) return "argument";
  if (["event", "scene", "timepoint"].includes(focus?.type) || edges.some((edge) => edge.kind === "causal")) return "causal";
  return "relationship";
}

function contextTitle(mode) {
  return {
    concept: "概念关联",
    causal: "因果承接",
    argument: "论证脉络",
    relationship: "上下文关系",
  }[mode] || "上下文关联";
}

function strongestPriority(left, right) {
  const ranks = { primary: 3, recent: 2, secondary: 1 };
  return (ranks[left] || 1) >= (ranks[right] || 1) ? left : right;
}

function nodeRank(node) {
  return ({ primary: 3, recent: 2, secondary: 1 }[node?.priority] || 1);
}

function edgeRank(edge) {
  return ({ primary: 3, recent: 2, secondary: 1 }[edge?.priority] || 1);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "");
}
