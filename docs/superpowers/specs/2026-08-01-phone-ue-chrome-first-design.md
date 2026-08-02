# Design: Phone UE (Chrome-first) — Feature 022a

**Status:** Approved by product direction (Feature 022 + user: PC Chrome simulate first, then real devices).  
**Date:** 2026-08-01

## Problem

书脉 desktop chrome forces `body { min-width: 1100px }` (940px under 1180). Chrome device mode cannot show a real phone composition. Reader side panels permanently steal canvas width when open.

## Goal (this slice only)

Make **shelf + reader** usable at **~390×844** in Chrome device mode without Capacitor. Preserve desktop layouts at ≥1100px.

## Approach (chosen)

**Responsive CSS + minimal class hooks on existing shells** — not a second UI codebase, not Capacitor yet.

Rejected for this slice:

- Capacitor/Android Studio first (too early; layout not phone-ready).
- WeChat mini program (wrong shell; large rewrite).
- Separate mobile React tree.

## Layout rules

| Surface | Phone (`max-width: 760px`) | Desktop |
|--------|---------------------------|---------|
| Viewport | `body` min-width 0; `100dvw` | unchanged |
| Home | Keep 58–72px icon rail; content fills rest; filter panel as overlay/sheet when open | current rail + flyout |
| Reader | Icon rail stays; **side content becomes fixed overlay / sheet** over the page (not a permanent second column that shrinks the page) | current 72 + 304 push |
| Recovery / 解惑 | Fit width; no absolute traps off-screen | current |
| Empty shelf | Second-layer copy (books from elsewhere) | same |

## Out of scope (later 022b–d)

Capacitor shell, share-target import, cross-device sync, TestFlight.

## Success

1. Chrome iPhone 14 / Pixel 7 presets: open shelf, open 《长征》, turn pages, open/close 目录 drawer, open recovery / 解惑 without forced desktop min-width scroll.
2. Desktop 1365×768 / 1920×1080 unchanged for primary chrome.
3. `npm run build` green.
