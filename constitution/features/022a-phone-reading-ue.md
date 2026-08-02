# Feature 022a: Phone Reading UE (Chrome-first)

## Status

**Paused** with Chrome-first groundwork partially in tree — not the active track. Resume with Feature 022 when mobile is reopened.

## Goal

Make shelf and reader usable at phone widths (~390px) in desktop Chrome device mode. Capacitor and sync come later.

## In scope

1. Remove desktop-only `body` / shell min-widths that block phone viewports.
2. Home: readable cover grid + compact topbar + rail at ≤760px; filter panel overlays rather than crushing the grid.
3. Reader: keep icon rail; when a panel is open, show side content as an overlay/sheet so the reading canvas is not permanently halved.
4. Touch-friendly hit targets (≥40px) on primary rail icons; page-turn controls remain reachable.
5. Recovery card and 选文解惑 remain usable without desktop-only popover traps.
6. Empty / import copy states second-layer positioning (books come from elsewhere).
7. Document Chrome device-mode smoke checklist.

## Out of scope

- Capacitor / App Store / Play Store.
- New mobile-only React app.
- Cross-device sync.
- Redesigning desktop chrome at ≥1100px.

## Acceptance

- Chrome device mode (iPhone 14 width): shelf → open builtin book → page turn → toggle 目录/主题 panel → dismiss.
- Desktop smoke at 1365×768 still looks like current product.
- `npm run build` passes.
- UI changes stay within `docs/product-ui-ux-spec.md` Mobile section.

## Related

- Season lock: `constitution/features/022-mobile-capacitor-season.md`
- Design: `docs/superpowers/specs/2026-08-01-phone-ue-chrome-first-design.md`
- Plan: `docs/superpowers/plans/2026-08-01-phone-ue-chrome-first.md`
