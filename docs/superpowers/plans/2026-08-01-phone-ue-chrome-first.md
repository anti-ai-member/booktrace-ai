# Phone UE Chrome-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 书脉 shelf + reader usable at ~390px in Chrome device mode before Capacitor or real-device packaging.

**Architecture:** Responsive CSS on existing `.library-shell` / `.reader-shell` with a phone breakpoint (`max-width: 760px`). Reader side panels become overlays on phone; no second UI codebase.

**Tech Stack:** Vite/React, `src/styles.css`, light hooks in `src/App.jsx` if overlay backdrop needs a class; Feature 022a.

## Global Constraints

- Feature 022 north star; second-layer, not bookstore.
- Quiet UI; reading canvas primary.
- Follow `docs/product-ui-ux-spec.md` Mobile section.
- Spec → implement → verify (Chrome 390 + build) → next task.
- Do not start Capacitor in this plan.

---

### Task 1: Spec + design docs (lock)

**Files:**
- `constitution/features/022a-phone-reading-ue.md`
- `docs/superpowers/specs/2026-08-01-phone-ue-chrome-first-design.md`
- `docs/product-ui-ux-spec.md` (confirm Mobile section matches overlay rule)
- `constitution/roadmap.md` (Phase 11 Feature 022a in progress)

- [x] Confirm docs exist and Mobile section states overlay/sheet for side panels
- [x] Mark Feature 022a in progress on roadmap

### Task 2: Unlock phone viewport

**Files:** `src/styles.css`

- [x] Set `body { min-width: 0; }` (or only apply large min-width at `min-width: 1100px`)
- [x] Remove / override `@media (max-width: 1180px) { body { min-width: 940px; } }`
- [x] Verify no other hard `min-width` on `html`/`body`/`#root` blocks 390px

**Verify:** Chrome device mode 390px — page not forced to ~1100 scroll width on shelf.

### Task 3: Home shelf at phone width

**Files:** `src/styles.css`, possibly empty-state copy in `src/App.jsx`

- [x] At `max-width: 760px`: content padding, book-grid columns (2-up or auto-fill min ~120px), topbar search doesn’t overflow
- [x] Filter panel opens as overlay (`position: fixed` / high z-index) covering content, not a third crushing column
- [x] Empty shelf mentions second-layer import story

**Verify:** Shelf shows covers; import + filter usable at 390px.

### Task 4: Reader overlay panels

**Files:** `src/styles.css`, `src/App.jsx` (backdrop click to collapse if needed)

- [x] At `max-width: 760px`: when `!sidebarCollapsed`, side content is `position: fixed` (left after rail or bottom sheet), width `min(86vw, 320px)`, does not expand grid columns to push canvas permanently
- [x] Optional dim backdrop; click closes panel (reuse `toggleReaderPanel` / collapse)
- [x] Rail icons ≥40px hit area; chapter toolbar / footer page turns remain visible
- [x] Recovery card width `min(620px, calc(100% - 24px))`

**Verify:** Open 目录 — page still full-width under overlay; close returns clean canvas; page turns work.

### Task 5: Smoke checklist + gate

**Files:** `docs/mobile-chrome-smoke.md` (short), roadmap note

- [x] Write checklist: shelf, open book, 3 page turns, panel toggle, recovery if available, 解惑 open/close
- [x] `npm run build`
- [x] Browser smoke at 390×844 and desktop 1365×768

---

## Later (not this plan)

022b Capacitor, 022c mobile import paths, 022d sync.
