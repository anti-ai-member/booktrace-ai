# Hand-Eval Protocol: Situation-Bridge Hit Rate

Human checklist for **Feature 018 / 019** continued-reading situation bridges. Complements offline `npm run situation-bridge:evaluate` with live desktop proof on real books.

## Season gate

| Metric | Target | Rows |
| --- | --- | --- |
| Show-helpful | ≥ **70%** | S01–S10 (`expected: show`) |
| Suppress correct | ≥ **80%** | X01–X05 (`expected: suppress`) |

Evidence-jump (E01–E03) and Reader Memory ranking (R01–R02) are **required smoke** but not part of the season percentage above.

Fill **pass/fail** and **note** locally after each run. Do **not** commit filled results if notes contain private reading-position clutter.

## Books

| Label | Source |
| --- | --- |
| **builtin** | Built-in 《长征》 (`long-march`) — no import |
| **import** | One imported **argument** or **fiction** EPUB (non-DRM). Record title in your local notes. Use argument rows for philosophy/essay/non-fiction; fiction rows for novel/literary EPUB. |

Run on **desktop** with `npm run dev`. DeepSeek key optional (local bridges still work; adjudicator enriches when key present).

## Setup (every case)

1. Read forward to the checkpoint through normal page turns (leave pages so they become **已读**).
2. Run **AI Trace** (manual or auto) so `bookMemory` exists up to the latest read page.
3. For **auto reopen** cases: set `yuezhi-reading-activity:<book>` in DevTools → Application → Local Storage to a timestamp **≥ 12 hours ago** (or clear it and set `lastActivityAt` inside `shumai-recovery-memory:<book>` similarly).
4. Close and reopen the book from the shelf, **or** stay on page and tap the page-title **主动回忆** (History) control for **manual** rows.
5. Judge only what the recovery card shows — bridges, suppress reason, evidence jumps, 想起了 / 还没想起.

### Helpful (show rows)

Pass when **all** apply:

- Card is **not** suppressed; shows **≥ 2** situation bridges.
- At least **one** bridge is **helpful**: episode-specific, names a prior decision/person/place/claim the current page depends on, and `whyNeeded` ties to visible page text — not a mega-topic or vague template.

Fail if suppressed on a dependent page, fewer than two bridges, or bridges are scenic trivia / unrelated biography.

### Suppress (scenic rows)

Pass when **any** apply:

- No recovery overlay on auto reopen **and** manual recall shows suppress copy (e.g. 当前页不必先回想).
- Card explicitly suppressed with a low-dependency reason.

Fail if two or more irrelevant bridges appear on a scenic or chapter-ornament page.

### Evidence jump (E rows)

Expand evidence on a bridge (or question). Pass if jump lands on the **correct prior chapter/paragraph** cited in Memory, within one page turn of the evidence anchor.

### 没想起 → reopen ranking (R rows)

1. On first open, tap **还没想起** on the bridge under test (note its title / candidate theme).
2. Reload or re-open the same page with ≥ 12h absence (or manual recall).
3. Pass if a bridge matching that theme (same event, person, claim, or `candidateId` family) appears in the **top two** bridges; fail if it disappears or ranks below unrelated filler.

---

## Checklist (20 cases)

| ID | Book | Chapter / page intent | Expected | Pass | Fail | Note |
| --- | --- | --- | --- | --- | --- | --- |
| **S01** | builtin | Mid-book: page where current action references **遵义会议** or its immediate command outcome (not the meeting scene itself) | show | | | |
| **S02** | builtin | Mid-book: **四渡赤水** / 赤水河 maneuver — page where prior crossing or direction change explains today's movement | show | | | |
| **S03** | builtin | Mid-book: post-**湘江** passage — page where command loss, corps change, or route pressure from that battle matters now | show | | | |
| **S04** | builtin | Mid-book: **巧渡金沙江** / 金沙江 — page where earlier crossing decision or timing affects present action | show | | | |
| **S05** | builtin | Mid-book: **飞夺泸定桥** or 大渡河 thread — page that assumes knowledge of prior bridge/route race | show | | | |
| **S06** | builtin | Mid-book: leadership handoff or **命令链** — page where who ordered what earlier is needed to read current orders | show | | | |
| **S07** | builtin | Mid-book: **敌我态势** turn — page where prior encirclement / pursuit / 包围圈 explains current breakout or march | show | | | |
| **S08** | import | Argument EPUB: mid-chapter page where text applies an earlier **核心概念 / 论点** (e.g. principle → consequence paragraph) | show | | | |
| **S09** | import | Argument EPUB: page that depends on a prior **论证步骤 / 反驳** rather than scene or biography | show | | | |
| **S10** | import | Fiction EPUB: mid-story page where **人物关系 / 前文事件** (not atmosphere) is required to understand current beat | show | | | |
| **X01** | builtin | **Scenic**: landscape, weather, or march atmosphere only — no new command, battle turn, or decision | suppress | | | |
| **X02** | builtin | **Chapter ornament**: epigraph, part title, or transitional filler with no causal hook to prior plot | suppress | | | |
| **X03** | builtin | **Low dependency**: early paragraph of a new chapter that is mostly orientation before action resumes | suppress | | | |
| **X04** | import | Argument EPUB: aside, metaphor, or scene-setting sentence unrelated to the book's claims | suppress | | | |
| **X05** | import | Fiction EPUB: pure setting / mood paragraph with no plot dependency on prior chapters | suppress | | | |
| **E01** | builtin | Any **show** row: open collapsed evidence on the most causal bridge; verify jump to prior battle/meeting/order passage | evidence | | | |
| **E02** | builtin | Second show row: evidence on a **person** bridge jumps to first substantive mention in read range | evidence | | | |
| **E03** | import | Non-history show row: evidence jump lands on concept/claim/scene anchor in read range (not wrong chapter) | evidence | | | |
| **R01** | builtin | Repeat **S02** (or similar causal page): mark **还没想起** on the strongest bridge; reopen → that theme should rank in top 2 | ranking | | | |
| **R02** | builtin | Repeat **S06** (command chain): **还没想起** on person/command bridge; reopen → related fuel preferred over weak secondary names | ranking | | | |

---

## Recording results

Copy the table to a local file under `reports/` (gitignored) or your notes app. Example season summary:

```text
Show helpful: __/10 = __%  (gate ≥70%)
Suppress correct: __/5 = __%  (gate ≥80%)
Evidence smoke: __/3
Ranking smoke: __/2
Season bridge hand-eval: PASS / FAIL
```

Re-run after major changes to `situationBridge.js`, Reader Memory scoring, or adjudicator path. Keep automated gate green: `npm run situation-bridge:evaluate`.
