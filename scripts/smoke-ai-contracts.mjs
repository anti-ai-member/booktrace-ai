/**
 * Feature 004 smoke checks for AI contract hardening.
 * Run: node scripts/smoke-ai-contracts.mjs
 */
import assert from "node:assert/strict";
import { cleanText } from "../src/memoryModels.js";
import { BOOK_TYPES } from "../src/bookTaxonomy.js";

function displayText(value, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^(undefined|null|nan)$/i.test(text)) return fallback;
  return text;
}

function resolveEvidenceStrict(byRef, ref) {
  const rawRef = String(ref || "").trim();
  if (!rawRef) return null;
  const key = rawRef.replace(/^\[/, "").replace(/\]$/, "");
  return byRef.get(rawRef) || byRef.get(key) || byRef.get(`[${key}]`) || null;
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

function rejectNullChapter(evidence) {
  if (evidence?.chapterIndex == null || evidence?.paragraphIndex == null) return true;
  const chapterIndex = Number(evidence.chapterIndex);
  const paragraphIndex = Number(evidence.paragraphIndex);
  return !Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex) || chapterIndex < 0 || paragraphIndex < 0;
}

assert.equal(cleanText("undefined"), "");
assert.equal(cleanText("null"), "");
assert.equal(displayText("undefined", "fallback"), "fallback");
assert.equal(displayText("萧克", "fallback"), "萧克");

const evidenceList = [
  { ref: "[C1]", id: "C1", chapterIndex: 0, paragraphIndex: 1, excerpt: "第六军团突围" },
  { ref: "[C2]", id: "C2", chapterIndex: 0, paragraphIndex: 2, excerpt: "旧州得到地图" },
];
const byRef = new Map();
evidenceList.forEach((item) => {
  [item.ref, item.id, item.ref.replace(/[\[\]]/g, "")].forEach((key) => byRef.set(key, item));
});

assert.equal(resolveEvidenceStrict(byRef, "C1")?.excerpt, "第六军团突围");
assert.equal(resolveEvidenceStrict(byRef, "C99"), null);
assert.equal(resolveEvidenceStrict(byRef, ""), null);

const badPoints = [
  { title: "萧克", detail: "主官", evidenceRef: "C99" },
  { title: "旧州", detail: "地图", evidenceRef: "C2" },
].map((item) => ({
  ...item,
  evidence: resolveEvidenceStrict(byRef, item.evidenceRef),
})).filter((item) => item.detail && item.evidence);
assert.equal(badPoints.length, 1, "wrong evidenceRef must not remap");
assert.ok(badPoints.length < 2, "fewer than 2 valid points must fail recovery contract");
assert.equal(normaliseProfile({ category: "" }, { strict: true }), null);
assert.equal(normaliseProfile({ category: "不存在的类型" }, { strict: true }), null);
assert.ok(normaliseProfile({ category: BOOK_TYPES[0].name }, { strict: true }));
assert.equal(rejectNullChapter({ chapterIndex: null, paragraphIndex: 0 }), true);
assert.equal(rejectNullChapter({ chapterIndex: 0, paragraphIndex: 1 }), false);

console.log("smoke-ai-contracts: ok");
