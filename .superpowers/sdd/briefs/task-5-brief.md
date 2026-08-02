### Task 5: Feature 020 spec 鈥?Open-book reliability

**Files:**
- Create: `constitution/features/020-open-book-reliability.md`

**Interfaces:**
- Produces: Spec for builtin always-visible, parse error surfacing, non-blocking analysis

- [ ] **Step 1: Write Feature 020**

```markdown
# Feature 020: Open-Book Reliability

## Goal
A cold browser profile sees 銆婇暱寰併€?without importing; import failures explain the next action; Trace never freezes page turns.

## In scope
1. Builtin book fetch/parse errors show a recoverable shelf state (retry), not an empty 鈥渘o books鈥?void when `/books/long-march.epub` exists.
2. Import duplicate fingerprint: reopen existing book instead of silent no-op.
3. Keep analysis/adjudicator on idle/background paths; never `await` model calls inside page-turn handlers.
4. Notice copy for missing API key when user triggers AI 鈥?reading still works offline for local bridges.

## Out of scope
- Cloud sync, account login, store

## Acceptance
- Fresh profile: builtin appears within first load without user import
- Kill API key: reading + local History still function; adjudicator falls back locally
```

- [ ] **Step 2: Commit**

```bash
git add constitution/features/020-open-book-reliability.md
git commit -m "spec: Feature 020 open-book reliability"
```

---


