# Feature 022: Mobile Capacitor Season (Constitution Lock)

## Status

**Paused** (2026-08-01) — core desktop feature usefulness takes priority. Resume only when explicitly reopened.

## Goal

Ship a phone-capable 书脉 on **iOS and Android via Capacitor**, without becoming a bookstore. Win by making import effortless, syncing reading state across devices, stating the second-layer positioning clearly, and keeping situation-bridge hit rate as the product proof.

## Season north star

> 用「导入无感 + 双端同步 + 第二层定位」消解书源劣势；用「续读接驳命中率」赢德。

## Positioning lock

- 书脉 is a **second-layer serious reader**: discover/buy books elsewhere (微信读书 / Kindle / stores / libraries); bring *your* hard books here to read through interruptions.
- Do **not** compete on catalog size, recommendations, or social feeds.
- Empty shelf copy and onboarding must say this explicitly — never only「请导入」.

## In scope (quarter)

1. **Mobile reading UE** — responsive shelf + reader for phone widths; touch page turns; rails/panels as drawers; keep Quiet UI and bridges-first recovery.
2. **Capacitor shell** — package the existing Vite/React app for iOS + Android; minimal native plugins (filesystem / share-target / status bar as needed).
3. **Frictionless import** — share-in / open-with / Files / drag paths that match mobile habits; clear failure reasons; duplicate fingerprint opens existing book.
4. **Cross-device sync (lite → full)** — start with a documented path (e.g. same-account encrypted sync of library metadata, progress, Memory, notes; book blobs as needed); Wi‑Fi desktop→phone transfer acceptable as an interim milestone if cloud sync slips.
5. **Hit-rate continuity** — situation-bridge + Reader Memory feedback remain the differentiator on mobile; do not ship mobile without reopen/manual History bridges working.

## Out of scope

- Building an online bookstore or crawling third-party catalogs.
- React Native / Flutter rewrite.
- Social reading, community, recommendation feeds.
- OCR-heavy PDF as the default mobile path.

## Tech choice (locked)

- **Capacitor** wraps the current React/Vite reader (see `constitution/teck-stack.md`).
- Prefer responsive CSS + shared logic over a second UI codebase.

## Acceptance (season)

- Phone-width Web (and Capacitor build) can: open builtin or imported book, turn pages, import at least one mobile path, open situation bridges / 解惑 without desktop-only chrome traps.
- Onboarding states second-layer positioning; no fake catalog.
- Sync or interim transfer restores progress + Memory for at least one book across two devices/profiles.
- `npm run build` and situation-bridge eval gates still pass; mobile smoke checklist documented.

## Related docs

- Mission: second-layer + mobile users — `constitution/mission.md`
- Stack: Capacitor — `constitution/teck-stack.md`
- Roadmap: Phase 11 — `constitution/roadmap.md`
- Prototype decisions — `AGENTS.md`
