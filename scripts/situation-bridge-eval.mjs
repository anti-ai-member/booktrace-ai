import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adjudicatorPayloadFromShortlist,
  applySituationBridgeJudgement,
  buildSituationBridgePlan,
  prepareSituationBridgeShortlist,
} from "../src/situationBridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "situation-bridge-cases.json");
const DEFAULT_REPORT = "reports/situation-bridge-eval.json";

const args = parseArgs(process.argv.slice(2));
const reportPath = args.out || DEFAULT_REPORT;
const live = Boolean(args.live);
const apiUrl = args.api || "http://127.0.0.1:8787/api/situation-bridge";

const cases = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
const rows = [];
for (const fixture of cases) {
  rows.push(await evaluateCase(fixture, { live, apiUrl }));
}

const report = summarise(rows);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Situation-bridge eval written: ${reportPath}`);
console.log(`Overall: ${report.scores.overall}/100`);
console.log(`Precision: ${report.scores.precision}/100 · SuppressAccuracy: ${report.scores.suppressAccuracy}/100 · Coverage: ${report.scores.coverage}/100`);
console.log(`Budget: ${report.scores.budgetCompliance}/100 · InventIdReject: ${report.scores.inventIdReject}/100`);
console.log(report.summary.join("\n"));
if (!report.pass.passed) {
  console.error(`Gate failed: ${report.pass.reasons.join("; ")}`);
  process.exitCode = 1;
}

async function evaluateCase(fixture, options) {
  const shortlist = prepareSituationBridgeShortlist({
    book: fixture.book,
    bookMemory: fixture.bookMemory,
    cursor: fixture.cursor,
    currentPageText: fixture.currentPageText,
    notes: fixture.notes || [],
    explains: fixture.explains || [],
    bookmarks: fixture.bookmarks || [],
    mode: fixture.mode || "manual",
    minAbsenceMs: 0,
  });

  let plan;
  let liveMeta = null;
  if (fixture.useJudgement && !shortlist.suppressed) {
    const judgement = await buildJudgement(shortlist, fixture, options);
    plan = applySituationBridgeJudgement(shortlist, judgement.payload);
    liveMeta = judgement.meta;
    // Also probe invented-id rejection on a copy of the shortlist.
    const poisoned = applySituationBridgeJudgement(shortlist, {
      bridges: [
        {
          gapId: "invented-gap",
          candidateId: "invented-cand",
          title: "伪造",
          whyNeeded: "不应入选",
          confidence: "high",
        },
        ...(judgement.payload.bridges || []).slice(0, 2),
      ],
    });
    const inventedSurvived = (poisoned.bridges || []).some(
      (item) => item.candidateId === "invented-cand" || item.gapId === "invented-gap",
    );
    return scoreRow(fixture, plan, shortlist, {
      inventedRejected: !inventedSurvived,
      liveMeta,
    });
  }

  plan = buildSituationBridgePlan({
    book: fixture.book,
    bookMemory: fixture.bookMemory,
    cursor: fixture.cursor,
    currentPageText: fixture.currentPageText,
    notes: fixture.notes || [],
    explains: fixture.explains || [],
    bookmarks: fixture.bookmarks || [],
    mode: fixture.mode || "manual",
    minAbsenceMs: 0,
  });
  return scoreRow(fixture, plan, shortlist, { liveMeta });
}

async function buildJudgement(shortlist, fixture, options) {
  const payload = adjudicatorPayloadFromShortlist(shortlist);
  if (options.live && payload) {
    try {
      const response = await fetch(options.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "deepseek",
          thinking: true,
          gaps: payload.gaps,
          candidates: payload.candidates,
          currentPageBrief: payload.currentPageBrief,
        }),
      });
      const result = await response.json();
      if (response.ok && result.judgement?.bridges?.length) {
        return {
          payload: result.judgement,
          meta: { source: "live", model: result.model || null },
        };
      }
      return {
        payload: localJudgementFromShortlist(shortlist),
        meta: { source: "live-fallback", error: result.error || `HTTP ${response.status}` },
      };
    } catch (error) {
      return {
        payload: localJudgementFromShortlist(shortlist),
        meta: { source: "live-fallback", error: error.message },
      };
    }
  }
  return {
    payload: localJudgementFromShortlist(shortlist),
    meta: { source: "offline-synthetic" },
  };
}

function localJudgementFromShortlist(shortlist) {
  const gaps = shortlist.gaps || [];
  const candidates = shortlist.candidates || [];
  const bridges = [];
  const used = new Set();
  for (const gap of gaps) {
    if (bridges.length >= 3) break;
    const match = candidates.find((item) => {
      if (used.has(item.id)) return false;
      if (item.forGapId && item.forGapId === gap.id) return true;
      return overlaps(item.title, gap.label) || overlaps(item.snippet, gap.label);
    }) || candidates.find((item) => !used.has(item.id));
    if (!match) continue;
    used.add(match.id);
    bridges.push({
      gapId: gap.id,
      candidateId: match.id,
      title: match.title,
      whyNeeded: `接上「${gap.label}」才能读通本页`,
      confidence: "high",
    });
  }
  return { bridges: bridges.slice(0, 3), question: null };
}

function scoreRow(fixture, plan, shortlist, extras = {}) {
  const expect = fixture.expect || {};
  const checks = [];

  const suppressOk = Boolean(plan?.suppressed) === Boolean(expect.suppressed);
  checks.push({ id: "suppress", pass: suppressOk });

  if (expect.suppressed) {
    const reasonOk = !expect.reasons?.length || expect.reasons.includes(plan?.reason);
    checks.push({ id: "reason", pass: reasonOk });
  } else {
    const bridges = plan?.bridges || [];
    const minOk = bridges.length >= (expect.minBridges || 2);
    checks.push({ id: "minBridges", pass: minOk });

    const evidenceOk = bridges.every((item) => item.whyNeeded && item.evidence);
    checks.push({ id: "evidence", pass: evidenceOk });

    const precision = scorePrecision(bridges, expect.titleHints || []);
    checks.push({ id: "precision", pass: precision >= 0.5, value: precision });

    if (expect.gapKinds?.length && plan?.gaps?.length) {
      const kinds = new Set(plan.gaps.map((item) => item.kind));
      const hit = expect.gapKinds.some((kind) => kinds.has(kind));
      checks.push({ id: "gapKind", pass: hit });
    }

    if (expect.source) {
      checks.push({ id: "source", pass: plan?.source === expect.source });
    }
  }

  if (expect.rejectInventedIds) {
    checks.push({ id: "inventedRejected", pass: extras.inventedRejected !== false });
  }

  const budget = scoreBudget(shortlist);
  checks.push({ id: "budget", pass: budget.ok, detail: budget });

  const failed = checks.filter((item) => !item.pass);
  return {
    id: fixture.id,
    bookType: fixture.bookType,
    factor: fixture.factor,
    expectSuppressed: Boolean(expect.suppressed),
    actualSuppressed: Boolean(plan?.suppressed),
    reason: plan?.reason || null,
    bridgeTitles: (plan?.bridges || []).map((item) => item.title),
    gapKinds: (plan?.gaps || []).map((item) => item.kind),
    source: plan?.source || null,
    live: extras.liveMeta || null,
    checks,
    passed: failed.length === 0,
    failures: failed.map((item) => item.id),
    precision: checks.find((item) => item.id === "precision")?.value ?? (expect.suppressed ? 1 : 0),
    budgetOk: budget.ok,
    inventedRejected: extras.inventedRejected !== false,
  };
}

function scorePrecision(bridges, hints) {
  if (!bridges.length) return 0;
  if (!hints.length) return bridges.every((item) => item.whyNeeded && item.evidence) ? 1 : 0;
  const hits = bridges.filter((bridge) => hints.some((hint) => overlaps(bridge.title, hint) || overlaps(bridge.whyNeeded, hint)));
  return hits.length / bridges.length;
}

function scoreBudget(shortlist) {
  if (!shortlist || shortlist.suppressed) {
    return { ok: true, gaps: 0, candidates: 0, maxSnippet: 0 };
  }
  const gaps = shortlist.gaps || [];
  const candidates = shortlist.candidates || [];
  const maxSnippet = Math.max(0, ...candidates.map((item) => String(item.snippet || "").length));
  const ok = gaps.length <= 6 && candidates.length <= 12 && maxSnippet <= 80;
  return { ok, gaps: gaps.length, candidates: candidates.length, maxSnippet };
}

function summarise(rows) {
  const showRows = rows.filter((row) => !row.expectSuppressed);
  const suppressRows = rows.filter((row) => row.expectSuppressed);
  const precision = average(showRows.map((row) => row.precision));
  const suppressAccuracy = suppressRows.length
    ? suppressRows.filter((row) => row.actualSuppressed === row.expectSuppressed && !row.failures.includes("reason")).length / suppressRows.length
    : 1;
  const showSuppressAccuracy = showRows.length
    ? showRows.filter((row) => row.actualSuppressed === false).length / showRows.length
    : 1;
  const combinedSuppress = (suppressAccuracy + showSuppressAccuracy) / 2;
  const coverage = showRows.length
    ? showRows.filter((row) => row.passed || (!row.actualSuppressed && row.precision >= 0.5)).length / showRows.length
    : 1;
  const budgetCompliance = rows.filter((row) => row.budgetOk).length / Math.max(1, rows.length);
  const inventRows = rows.filter((row) => row.id.includes("adjudicator") || row.checks?.some((c) => c.id === "inventedRejected"));
  const inventIdReject = inventRows.length
    ? inventRows.filter((row) => row.inventedRejected).length / inventRows.length
    : 1;

  const scores = {
    precision: Math.round(precision * 100),
    suppressAccuracy: Math.round(combinedSuppress * 100),
    coverage: Math.round(coverage * 100),
    budgetCompliance: Math.round(budgetCompliance * 100),
    inventIdReject: Math.round(inventIdReject * 100),
    overall: Math.round(
      precision * 40
      + combinedSuppress * 25
      + coverage * 15
      + budgetCompliance * 10
      + inventIdReject * 10,
    ),
  };

  const byFactor = {};
  for (const row of rows) {
    const key = row.factor || "unknown";
    if (!byFactor[key]) byFactor[key] = { total: 0, passed: 0 };
    byFactor[key].total += 1;
    if (row.passed) byFactor[key].passed += 1;
  }

  const pass = {
    passed: scores.overall >= 80
      && scores.precision >= 70
      && scores.suppressAccuracy >= 80
      && scores.budgetCompliance === 100
      && scores.inventIdReject === 100,
    reasons: [],
  };
  if (scores.overall < 80) pass.reasons.push(`overall ${scores.overall} < 80`);
  if (scores.precision < 70) pass.reasons.push(`precision ${scores.precision} < 70`);
  if (scores.suppressAccuracy < 80) pass.reasons.push(`suppressAccuracy ${scores.suppressAccuracy} < 80`);
  if (scores.budgetCompliance < 100) pass.reasons.push("budgetCompliance must be 100");
  if (scores.inventIdReject < 100) pass.reasons.push("inventIdReject must be 100");

  const failedIds = rows.filter((row) => !row.passed).map((row) => row.id);
  const summary = [
    `Cases: ${rows.length} (show ${showRows.length}, suppress ${suppressRows.length})`,
    `Passed cases: ${rows.filter((row) => row.passed).length}/${rows.length}`,
    failedIds.length ? `Failed: ${failedIds.join(", ")}` : "Failed: none",
    `By factor: ${Object.entries(byFactor).map(([k, v]) => `${k} ${v.passed}/${v.total}`).join("; ")}`,
  ];

  return {
    generatedAt: new Date().toISOString(),
    mode: live ? "live-adjudicator" : "offline",
    scores,
    pass,
    byFactor,
    summary,
    cases: rows,
  };
}

function overlaps(a, b) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function average(values) {
  if (!values.length) return 1;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
