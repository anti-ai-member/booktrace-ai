# Design: Season — Bridge Retention (not catalog)

**Date:** 2026-07-27  
**Status:** implementing  
**Product:** 书脉  
**Constraint:** Cannot and will not compete with 腾讯读书 / Kindle on book count or discovery.

## Problem

Mature readers already have somewhere to *find* books. They abandon 书脉 when:

1. Reopening after days does not restore the situation model (false or noisy bridges).
2. Opening / importing friction kills the first session before the differentiator appears.
3. Non-history books feel like a history-reader with AI paint.

## Positioning lock

> 书脉 is the **second layer** for hard, interruptible reading: bring *your* book, leave with a living Memory and on-demand situation bridges.  
> 腾讯读书 / Kindle remain the first layer for shelf size and casual reading.

## Approaches considered

| Approach | Focus | Pros | Cons |
| --- | --- | --- | --- |
| A. Platform season | Mobile + formats + sync | Looks like a “real reader” | Competes on their turf; delays differentiator |
| **B. Hit-rate season (recommended)** | Bridge precision + Reader Memory + open-book friction | Directly proves mission | Shelf still thin by design |
| C. Aid season | Graphs / concept maps first | Visually impressive | Pulls attention from reading; weak without hit-rate |

**Decision:** Approach B for one season (~4–6 weeks of focused work).

## Season outcome

A returning reader of a hard book can say:

> “I opened 书脉 after a week, it showed 2–3 things I actually needed, I jumped to evidence, and continued — I would not get that from 腾讯读书.”

## Non-goals (explicit)

- Book store, recommendations, social
- Matching catalog breadth
- Mobile-first rewrite
- Extra permanent AI dashboards / default relation graphs
- Dumping more prior text into the model

## Three pillars

1. **Bridge hit-rate loop** — Reader Memory (想起了/没想起) feeds candidate scoring; live hand-eval on 《长征》 + one argument/fiction book.
2. **Zero-drama open book** — Built-in 《长征》 always on shelf; import failures explain themselves; analysis never blocks page turns.
3. **Type-honest recovery** — Concept/argument books recover via topics/claims, not forced people/places.

## Success metrics (season gate)

| Metric | Target |
| --- | --- |
| Hand-eval bridge precision (show cards) | ≥ 70% “helpful” on 20 scripted reopen/manual cases |
| Suppress correctness | ≥ 80% on scenic / low-dependency pages |
| Offline `situation-bridge:evaluate` | Gate still green; fixtures expand with Reader Memory cases |
| Time-to-first-page on cold start | Built-in book visible without import |
| Non-history demo | One labeled sample proves concept/argument bridges |

## Specs to open during the season

- Feature 019 — Reader Memory → situation-bridge fuel (extends roadmap 010)
- Feature 020 — Open-book reliability (builtin + import UX)
- Feature 021 — Type-honest bridge profiles (extends roadmap 011 partially)
- Expand Feature 018 Phase C fixtures / live hand protocol
