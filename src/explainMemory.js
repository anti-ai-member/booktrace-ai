const EXPLAIN_CAP = 80;

const MODE_LABELS = {
  source: "书内出处",
  entity: "词条简介",
  meaning: "深意阐释",
  concept: "概念释义",
  context: "前后因果",
};

const MODE_SHORT = {
  source: "出",
  entity: "词",
  meaning: "意",
  concept: "念",
  context: "因",
};

const SPEED_LABELS = {
  fast: "快速",
  deep: "深思",
};

export function explainsStorageKey(book) {
  return `yuezhi-explains:${book?.id || book?.title}:${book?.creator || "unknown"}:${book?.chapters?.length || 0}`;
}

export function explainModeLabel(mode) {
  return MODE_LABELS[mode] || "选文解惑";
}

export function explainSpeedLabel(speed) {
  return SPEED_LABELS[speed === "deep" ? "deep" : "fast"];
}

export function normalizeExplainRecord(raw = {}, book = null) {
  const mode = ["source", "entity", "meaning", "concept", "context"].includes(raw.mode) ? raw.mode : "source";
  const explainSpeed = raw.explainSpeed === "deep" ? "deep" : "fast";
  const selection = String(raw.selection || "").trim();
  if (!selection) return null;
  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  const cites = Array.isArray(raw.cites) ? raw.cites : evidence;
  const highlights = Array.isArray(raw.highlights) ? raw.highlights.map(String).filter(Boolean).slice(0, 6) : [];
  const explanations = raw.explanations && typeof raw.explanations === "object" ? raw.explanations : {};
  const startOffset = Number.isInteger(Number(raw.startOffset)) ? Number(raw.startOffset) : null;
  const endOffset = Number.isInteger(Number(raw.endOffset)) ? Number(raw.endOffset) : null;
  return {
    id: String(raw.id || `${Date.now()}-${mode}-${explainSpeed}-${selection.slice(0, 24)}`),
    bookId: String(raw.bookId || book?.id || book?.title || "book"),
    chapterIndex: Math.max(0, Number(raw.chapterIndex) || 0),
    pageIndex: Math.max(0, Number(raw.pageIndex) || 0),
    paragraphIndex: Math.max(0, Number(raw.paragraphIndex) || 0),
    startOffset,
    endOffset,
    selection,
    mode,
    explainSpeed,
    title: String(raw.title || "").trim(),
    answer: String(raw.answer || "").trim(),
    highlights,
    evidence,
    cites,
    explanations,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

export function loadExplains(book) {
  if (!book) return [];
  try {
    const raw = localStorage.getItem(explainsStorageKey(book));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => normalizeExplainRecord(item, book))
      .filter(Boolean)
      .slice(0, EXPLAIN_CAP);
  } catch {
    return [];
  }
}

export function saveExplains(book, items) {
  if (!book) return [];
  const next = (Array.isArray(items) ? items : [])
    .map((item) => normalizeExplainRecord(item, book))
    .filter(Boolean)
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
    .slice(0, EXPLAIN_CAP);
  localStorage.setItem(explainsStorageKey(book), JSON.stringify(next));
  return next;
}

export function explainIdentityKey(record) {
  return [
    Number(record.chapterIndex) || 0,
    Number(record.paragraphIndex) || 0,
    String(record.selection || "").trim(),
    record.mode || "source",
    record.explainSpeed === "deep" ? "deep" : "fast",
  ].join("|");
}

export function upsertExplain(list, record, book = null) {
  const nextRecord = normalizeExplainRecord(record, book);
  if (!nextRecord) return Array.isArray(list) ? list : [];
  const key = explainIdentityKey(nextRecord);
  const filtered = (Array.isArray(list) ? list : []).filter((item) => explainIdentityKey(item) !== key);
  return saveExplains(book, [nextRecord, ...filtered]);
}

export function removeExplain(list, id, book = null) {
  const targetId = String(id || "");
  if (!targetId) return Array.isArray(list) ? list : [];
  const filtered = (Array.isArray(list) ? list : []).filter((item) => String(item.id) !== targetId);
  return saveExplains(book, filtered);
}

export function removeExplains(list, ids, book = null) {
  const idSet = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "")).filter(Boolean));
  if (!idSet.size) return Array.isArray(list) ? list : [];
  const filtered = (Array.isArray(list) ? list : []).filter((item) => !idSet.has(String(item.id)));
  return saveExplains(book, filtered);
}

/** True when a live selection matches a persisted explain (same chapter/paragraph + exact/overlap). */
export function selectionOverlapsExplain(selectionMeta, record) {
  if (!record || !selectionMeta) return false;
  const chapterIndex = Number(selectionMeta.chapterIndex);
  if (Number.isInteger(chapterIndex) && chapterIndex !== Number(record.chapterIndex)) return false;

  const paragraphIndex = Number(selectionMeta.paragraphIndex);
  if (Number.isInteger(paragraphIndex) && paragraphIndex !== Number(record.paragraphIndex)) return false;

  const selection = String(selectionMeta.selection || selectionMeta.fullText || selectionMeta.text || "").trim();
  const stored = String(record.selection || "").trim();
  if (!selection || !stored) return false;

  if (selection === stored) return true;
  if (selection.includes(stored) || stored.includes(selection)) return true;

  const selStart = Number(selectionMeta.startOffset);
  const selEnd = Number(selectionMeta.endOffset);
  const recStart = Number(record.startOffset);
  const recEnd = Number(record.endOffset);
  if (
    Number.isInteger(selStart)
    && Number.isInteger(selEnd)
    && Number.isInteger(recStart)
    && Number.isInteger(recEnd)
    && selEnd > selStart
    && recEnd > recStart
  ) {
    return selStart < recEnd && recStart < selEnd;
  }

  return false;
}

export function findExplainsForSelection(explains, selectionMeta) {
  return (Array.isArray(explains) ? explains : []).filter((record) => selectionOverlapsExplain(selectionMeta, record));
}

export function spanGroupKey(record) {
  return [
    Number(record.chapterIndex) || 0,
    Number(record.paragraphIndex) || 0,
    String(record.selection || "").trim(),
  ].join("|");
}

export function previewConclusion(record) {
  const title = String(record?.title || "").trim();
  if (title) return title.slice(0, 72);
  const answer = String(record?.answer || "").trim();
  if (!answer) return "已保存解惑";
  const sentence = answer.split(/[。！？\n]/)[0] || answer;
  return sentence.slice(0, 72);
}

export function previewMetaLabel(record) {
  const mode = explainModeLabel(record?.mode);
  const speed = record?.mode === "source" ? "" : explainSpeedLabel(record?.explainSpeed);
  return speed ? `${mode} · ${speed}` : mode;
}

export function markerShortLabel(records = []) {
  if (!records.length) return "解";
  if (records.length === 1) {
    return MODE_SHORT[records[0].mode] || "解";
  }
  const modes = new Set(records.map((item) => item.mode));
  if (modes.size === 1) return MODE_SHORT[records[0].mode] || "解";
  return "解";
}

/** Find selection match inside a page segment; returns local [start, end) or null. */
export function findSelectionInSegment(segmentText, record, segmentStart = 0) {
  const selection = String(record?.selection || "").trim();
  const text = String(segmentText || "");
  if (!selection || !text) return null;

  if (Number.isInteger(record.startOffset) && Number.isInteger(record.endOffset)) {
    const localStart = record.startOffset - segmentStart;
    const localEnd = record.endOffset - segmentStart;
    if (localStart >= 0 && localEnd <= text.length && localEnd > localStart) {
      const slice = text.slice(localStart, localEnd);
      if (slice === selection || selection.includes(slice) || slice.includes(selection.slice(0, Math.min(12, selection.length)))) {
        return { start: localStart, end: localEnd };
      }
    }
  }

  const exact = text.indexOf(selection);
  if (exact >= 0) return { start: exact, end: exact + selection.length };

  // Selection may span segments: show marker where a substantial prefix/suffix overlaps.
  if (selection.length > 8) {
    for (let size = Math.min(selection.length, text.length); size >= 8; size -= 1) {
      const prefix = selection.slice(0, size);
      const at = text.indexOf(prefix);
      if (at >= 0 && at + size <= text.length) return { start: at, end: at + size };
      const suffix = selection.slice(-size);
      const atSuffix = text.lastIndexOf(suffix);
      if (atSuffix >= 0) return { start: atSuffix, end: atSuffix + size };
    }
  }
  return null;
}

export function groupExplainMarkersForSegment(explains, { chapterIndex, paragraphIndex, segmentText, segmentStart = 0 }) {
  const relevant = (Array.isArray(explains) ? explains : []).filter(
    (item) => item.chapterIndex === chapterIndex && item.paragraphIndex === paragraphIndex,
  );
  if (!relevant.length) return [];

  const groups = new Map();
  relevant.forEach((record) => {
    const match = findSelectionInSegment(segmentText, record, segmentStart);
    if (!match) return;
    const key = `${match.start}:${match.end}:${spanGroupKey(record)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
    } else {
      groups.set(key, {
        key,
        start: match.start,
        end: match.end,
        selection: record.selection,
        records: [record],
      });
    }
  });

  return [...groups.values()]
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((group, index, list) => {
      // Drop fully nested weaker groups to avoid stacked badges.
      return !list.some((other, otherIndex) => (
        otherIndex !== index
        && other.start <= group.start
        && other.end >= group.end
        && (other.end - other.start) > (group.end - group.start)
      ));
    });
}

/** Quiet underline ranges for selection notes on a page segment. */
export function groupNoteMarksForSegment(notes, { chapterIndex, paragraphIndex, segmentText, segmentStart = 0 }) {
  const relevant = (Array.isArray(notes) ? notes : []).filter((item) => {
    if ((Number(item.chapterIndex) || 0) !== chapterIndex) return false;
    if (Number.isInteger(item.paragraphIndex)) return item.paragraphIndex === paragraphIndex;
    // Legacy notes without paragraphIndex: match by selection text only.
    return Boolean(String(item.selection || "").trim());
  });
  if (!relevant.length) return [];

  const groups = new Map();
  relevant.forEach((record) => {
    if (Number.isInteger(record.paragraphIndex) && record.paragraphIndex !== paragraphIndex) return;
    const match = findSelectionInSegment(segmentText, {
      selection: record.selection,
      startOffset: record.startOffset,
      endOffset: record.endOffset,
    }, segmentStart);
    if (!match) return;
    const key = `${match.start}:${match.end}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
    } else {
      groups.set(key, {
        key,
        start: match.start,
        end: match.end,
        selection: record.selection,
        records: [record],
      });
    }
  });

  return [...groups.values()]
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((group, index, list) => {
      return !list.some((other, otherIndex) => (
        otherIndex !== index
        && other.start <= group.start
        && other.end >= group.end
        && (other.end - other.start) > (group.end - group.start)
      ));
    });
}

export function buildAssistFromExplain(record) {
  if (!record) return null;
  const cacheKey = `${record.mode}:${record.explainSpeed === "deep" ? "deep" : "fast"}`;
  const explanation = record.explanations?.[cacheKey] || {
    mode: record.mode,
    title: record.title,
    answer: record.answer,
    highlights: record.highlights,
    evidence: record.evidence,
  };
  const explanations = {
    ...(record.explanations || {}),
    [cacheKey]: explanation,
  };
  return {
    text: record.selection,
    mode: record.mode,
    cites: record.cites?.length ? record.cites : (record.evidence || []),
    explanations,
    statusByMode: { [cacheKey]: (explanation?.answer || record.mode === "source") ? "ready" : "idle" },
    errorByMode: {},
    chapterIndex: record.chapterIndex,
    pageIndex: record.pageIndex,
    paragraphIndex: record.paragraphIndex,
    startOffset: record.startOffset,
    endOffset: record.endOffset,
    fromExplainId: record.id,
  };
}
