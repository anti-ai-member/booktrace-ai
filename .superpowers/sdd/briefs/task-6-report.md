# Task 6 Report: Implement open-book reliability (Feature 020)

**Status:** DONE  
**Branch:** `season/bridge-retention`  
**Base:** `73e88a7503195d8bbc7828da2c2e3b8253045636`  
**Commit:** `2c3a649` — `fix: builtin retry and duplicate-import open path`

## Deliverables

| File | Action |
| --- | --- |
| `src/App.jsx` | Extracted `loadBuiltInBook` + retry UI; duplicate import opens existing; API-key notices |

## Task checklist

- [x] Step 1: Reproduce empty-shelf failure modes (code path: shelf empty + `loadError` previously only offered import)
- [x] Step 2: UI for builtin load failure — **重试加载《长征》** on shelf empty-state and loading-screen fallback
- [x] Step 3: Duplicate fingerprint → `openShelfBook(existing)` + notice「书架已有这本书，已为你打开」
- [x] Step 4: Verify — `turnPage` stays sync (no model await); adjudicator/analyze showNotice on missing API key and fall back locally
- [x] Step 5: Commit

## Implementation notes

- `loadBuiltInBook` moved out of the mount `useEffect` into a stable component function; mount calls via `loadBuiltInBookRef` so Retry can re-run fetch/parse.
- Cold start remains `screen === "shelf"`; recoverable empty state is the shelf `empty-library` block when `loadError && !libraryBooks.length`.
- Duplicate-only import no longer silent shelf stay; opens reader at prior position via `openShelfBook`.
- Missing API key (server `Please configure *_API_KEY in .env`) → clear Chinese `showNotice`; situation-bridge still returns `localFallback`.

## Tests

- `npm run build` — pass
- `npm run verify:situation-bridge` — pass

## Self-review

### Spec fidelity (Feature 020)
- Builtin fetch/parse errors → recoverable retry, not empty void: **done**
- Duplicate fingerprint reopen + notice: **done**
- No model await inside page-turn: **confirmed already true**
- Missing API key notice; reading + local bridges work: **done** (adjudicator + analyze)

### Concerns
- Brief cold-load / blocked-network UI not exercised in browser this run; verified by code path + build.
- Selection「解惑」still surfaces API errors in-panel rather than global notice (out of minimal App.jsx scope).

## Next task

Continue season plan after Feature 020 (see progress / Task 7+).
