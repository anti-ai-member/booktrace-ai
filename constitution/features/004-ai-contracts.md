# Feature 004: AI Contracts

## Status

Verified.

## Problem

Classify / analyze / recovery prompts already exist, but model output is only lightly shaped. Weak or wrong `evidenceRef` can silently remap to the wrong paragraph; stringified `undefined` can still leak into labels; classify may invent a default book type when the model is empty.

## Goal

Harden AI contracts so Memory Engine API payloads and UI never show invalid claims: filter weak output, ban `undefined` display text, and require evidence refs to resolve to real source paragraphs.

## Scope

In scope:

- Shared display/evidence cleaners (strip `undefined`/`null`/`nan`; require real chapter/paragraph indices when a book is available).
- Recovery contract (`/api/recovery-card` + App `normalizeRecoveryCard`):
  - Resolve `evidenceRef` strictly (no silent fallback to `evidenceList[i]` when the ref is wrong).
  - Drop key points / prerequisites / question evidence that cannot resolve.
  - If fewer than 2 resolvable key points remain, treat the model card as failed so the App keeps the local Context Builder fallback.
- Analyze contract (server `normaliseIndex` / `memoryModels.cleanText`):
  - `cleanText` rejects stringified undefined.
  - Do not coerce missing chapter evidence to chapter 0 when validating jump targets on the client (`hasIndexEvidence`).
- Classify contract:
  - Only emit known `BOOK_TYPES` categories.
  - If the model returns no usable category, return a clear error instead of silently inventing the first taxonomy type.
- Prompt wording for recovery: emphasize valid `evidenceRef` only.

Out of scope:

- Full evaluation harness expansion (Phase 6).
- Recovery card visual redesign beyond contract fields.
- Changing default recovery model / thinking (already shipped).

## Contracts

### Recovery card (model → server → App)

```js
{
  intensity: "light|medium|deep|fresh",
  absenceLabel: string, // never "undefined"
  positionLabel: string,
  keyPoints: [{ title, detail, evidenceRef }], // 2-3; each evidenceRef must resolve
  prerequisites: [{ text, evidenceRef }], // 0-2; weak refs dropped
  question: { prompt, hint?, answer, evidenceRef }, // evidenceRef must resolve or question uses local fallback only on App
  evidenceRefs: ["C1", ...]
}
```

Server returns `{ card }` only when `keyPoints.length >= 2` after strict evidence resolution; otherwise `{ error, fallback: true }`.

### Evidence resolution

Given supplied ContextCite list `C1..Cn`:

1. Match `evidenceRef` to label / id / bare number.
2. If unmatched → `null` (do not pick another cite by index).
3. Optional book check: `chapters[chapterIndex].paragraphs[paragraphIndex]` must exist.

### Display text

Any user-visible string must pass a cleaner that rejects empty and `/^(undefined|null|nan)$/i`.

## Verification

- `npm run build`
- Node smoke: wrong `C99` does not remap; fewer than 2 valid points → recovery API failure/fallback flag; `cleanText("undefined")` → `""`; classify empty category → 400/502 contract error (not silent first type).
- Sub-agent review against this spec.

## Roadmap

Marks Phase 4 (AI Contracts) complete when Verified.
