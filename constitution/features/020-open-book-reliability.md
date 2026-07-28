# Feature 020: Open-Book Reliability

## Goal
A cold browser profile sees 《长征》 without importing; import failures explain the next action; Trace never freezes page turns.

## In scope
1. Builtin book fetch/parse errors show a recoverable shelf state (retry), not an empty “no books” void when `/books/long-march.epub` exists.
2. Import duplicate fingerprint: reopen existing book instead of silent no-op.
3. Keep analysis/adjudicator on idle/background paths; never `await` model calls inside page-turn handlers.
4. Notice copy for missing API key when user triggers AI — reading still works offline for local bridges.

## Out of scope
- Cloud sync, account login, store

## Acceptance
- Fresh profile: builtin appears within first load without user import
- Kill API key: reading + local History still function; adjudicator falls back locally
