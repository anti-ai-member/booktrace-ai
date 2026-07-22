# 书脉 UI/UE Spec

This document is the interface contract for Shumai. Any new UI or interaction change should preserve this style and flow unless the spec is deliberately updated first.

## Product Promise

书脉 is a quiet reading companion. Its value is not "AI summary everywhere"; its value is:

> AI 知道此刻你最应该回忆什么。

The UI must protect reading focus, surface memory only when helpful, and keep all AI output evidence-backed.

## Experience Principles

1. Reading first.
   The page text is always the main object. Tooling should stay in rails, panels, or transient cards.

2. Memory before retrieval.
   Memory Engine decides what to recall. ContextCite locates evidence and sources.

3. Contextual, not encyclopedic.
   Show only content relevant to the current reading position. Avoid full-book dashboards unless explicitly requested.

4. One primary action per moment.
   A screen should make the next action obvious: continue reading, recall, search, jump to evidence, or close.

5. Evidence without clutter.
   Every AI claim should be traceable, but evidence stays collapsed until requested.

6. Calm and literary.
   Use soft paper surfaces, restrained green/ink accents, low-contrast motifs, and modest motion.

## Visual Style

### Palette

- Background: warm paper, off-white, pale green paper tint.
- Text: ink green/charcoal, never pure black for body text.
- Accent: restrained deep green.
- Secondary accent: muted warm beige only for subtle memory warmth.
- Avoid: saturated gradients, purple-blue AI colors, heavy black shadows, decorative blobs.

### Typography

- Reading body: Chinese serif/Song style for long text.
- UI text: system sans-serif, medium weight for labels.
- Hero-scale type is only for product identity or the memory recovery title.
- Compact panels use 12-16px labels, not large marketing headings.
- Do not use negative letter spacing.

### Surfaces

- Reading canvas should feel like paper, not a dashboard.
- Cards are used only for repeated items, transient recovery cards, and tools.
- Avoid nested cards.
- Use border radius intentionally:
  - Small controls: 8-14px.
  - Recovery/modal-like cards: 20-32px.
  - Icon buttons: circular or soft square.

### Icons

- Primary controls are icon-first.
- Text appears on hover/tooltips or inside opened panels.
- Icons must be optically centered.
- Active rail icons should not use permanent heavy green blocks unless the state truly needs emphasis.

### Control Language (durable)

Chrome, transient reading tools, and recovery/memory cards share one control language:

- Prefer **icon-only** buttons for secondary actions (hint, answer, evidence, recall feedback, rail tools).
- Visible text labels appear on **hover/focus** via `title` / accessible name (`aria-label`), not as always-on button captions.
- Keep **one clear primary continue affordance** when the moment needs an obvious next step. Prefer a rail-consistent accent icon with hover/focus label (e.g. recovery「继续阅读」). Use a solid text CTA only when the surrounding surface is already text-forward (import/empty states, multi-field modals).
- Do not mix dense text-pill action rows with the icon rail language on the same surface.
- Content inside the card (question prose, path titles, prerequisite lines) remains readable text; only the *controls* are icon-first.

## App Layout

### Home

- Left icon rail.
- Top wide search.
- Cover-first bookshelf grid.
- Default book cards show little/no text.
- Title, author, progress, and actions appear on hover/focus.
- Type/category filters open as click-triggered side flyout.
- Avoid large header zones and dense text chips.

### Reader

- Left icon rail controls primary tools:
  - Theme
  - Directory
  - Bookmarks
  - Notes
  - AI reading / recovery
  - Back to shelf (bottom of rail)

- Rail icons toggle side content: click once to expand that panel; click the same active icon again to collapse. No standalone collapse-sidebar control. Opening 解惑 from selection bloom still expands the side panel.

- Topbar:
  - Icon-only search trigger opens a quiet paper panel anchored under the icon (`Ctrl K`); not a centered marketing modal.
  - Secondary progress/status controls on the right.

- Reading stage:
  - Page-turn reading, no internal scrolling in the page body.
  - In-book EPUB figures render inline in the page track (quiet centered images); packing reserves their height so glyphs and figures are not clipped.
  - Stable top chapter navigation and bottom page navigation.
  - Chapter controls and page controls must use distinct icons.
  - Chapter/page step controls, page recall, Trace status, and top-right status cluster are **icon-only**; labels appear only via `title` / `aria-label` on hover/focus.
  - Top-right status cluster (Trace + progress + shield) shares one baseline/height.

- Side panels:
  - Directory, bookmarks, notes, themes, AI settings, and reading indexes use the same left-panel toggle behavior.
  - No floating popovers for primary reader tools.

## Core Flows

### Continue Reading Recovery

Purpose: restore the reader's situation model before continuing.

The recovery card should answer:

> 为了理解当前页，你只需要回忆哪几件事？

Required content:

- Last position.
- One active-recall question.
- 2-3 memory anchors.
- 1-2 current-page prerequisites.
- Evidence collapsed by default.
- Continue reading button.

Layout rules:

- One screen, no scrolling.
- Single-column reading path: title → position → question → memory path → prerequisites → footer.
- No overlapping absolute-positioned content. Recovery content sections use normal document flow only (`position: static` / flex column); never absolute-position anchors, prerequisites, or evidence inside the card.
- Use an explicit grid/flex structure.
- Center question is the first visual focus.
- Memory anchors are a quiet numbered path of at most three nodes. Prefer a readable layout: if a three-column horizontal path would crush titles or details, use a vertical step list (number + title + one-to-two-line detail) that still reads as a path, not a dense report.
- Leave clear vertical rhythm between question, anchors, prerequisites, and footer; avoid dashboard density.
- Evidence is secondary and collapsed.
- Avoid two-column report layouts and decorative aura layers.
- Secondary recovery actions (查看提示、查看答案、展开证据、想起来了、还没想起) are icon-only with hover/focus labels.
- Continue reading is an accent icon control with hover/focus label「继续阅读」(rail-consistent); close remains a quiet icon.

Do not:

- Show recovery on the first page.
- Include publication metadata, cover/copyright text, table of contents, incidental dates, or minor names.
- Show full summaries.
- Show more than three primary recall items.

### Memory Engine

Memory types:

- Entity Memory: people, places, organizations, terms, status, relations, latest changes.
- Timeline Memory: events, dates, sequence, causal turns.
- Relationship Memory: evidenced edges among people, organizations, events, concepts.
- Topic/Semantic Memory: concepts, mechanisms, definitions, dependencies.
- Argument Memory: claim, evidence, example, conclusion.
- Episodic Memory: chapter events and narrative state changes.
- Reader Memory: reading position, recall feedback, forgotten items, mastered items.

Decision order:

1. Current-page dependency.
2. Mainline importance.
3. Evidence reliability.
4. Reading-position relevance.
5. Forgetting/reader-memory weight.

ContextCite is used after this to locate evidence or fill gaps.

### Relationship View

Relationship graph is not a default module.

Use it only when:

- Current page or selected text has reliable relationship edges.
- A recovery card includes a relationship anchor.
- The user selects a person/organization and asks for relationship context.

Rules:

- Show local 1-hop or current-context relationships, not the whole book graph.
- Every edge must have source evidence.
- Open as a larger left workspace that pushes the reading canvas.
- Title it "上下文关系", not "关系图谱", unless user explicitly asks for full graph.
- Hide the entry when no reliable relation exists nearby.

### Search

- Reader search uses an icon-only topbar trigger (and `Ctrl K`), then opens a quiet paper panel anchored under the search icon.
- Empty query: show this book's recent searches when available; otherwise short guidance only. Do not hard-code book-specific suggestion chips.
- With a query: clear chapter + quote result list; arrow keys move selection, Enter opens, Esc closes.
- Shortcut hints stay in tooltips / aria (and a quiet in-panel hint while results show); no noisy Ctrl K / Esc footer chrome.
- It is for locating original text, entities, or evidence.
- Search should not become the recall mechanism.

### Selected Text Assistance

The selection menu is transient.

Actions:

- 解惑 — opens a left panel with typed assist modes:
  - 书内出处: locate related passages in the already-read range
  - 词条简介: short identity/role for a person, place, org, or term
  - 深意阐释: contextual meaning of a dense / philosophical passage
  - 概念释义: plain definition of a technical or scholarly concept as used here
  - 前后因果: why this beat matters given prior read events
- 回忆
- 出处
- 关系 only when local relationship evidence exists
- 笔记
- 收藏
- 删除 — only when the current selection matches one or more persisted 解惑 annotations for this book (same chapter/paragraph + exact or overlapping selection). Hidden when nothing to delete. Click removes the matching explain record(s), clears in-text markers immediately, and closes the bloom.

笔记 rules:

- Saving a note on selected text persists the selection plus paragraph/offset anchors when available, and underlines the annotated span in the page with a quiet solid bottom underline (rose/ink, theme-aware) — distinct from 「解」badges (no badge, no wash).
- Deleting a note from the sidebar clears storage and the underline immediately.
- Notes sidebar list order: selection excerpt first, chapter/page source second, note content third. Click still jumps to the annotated location.

解惑 panel rules:

- Chrome is icon-first (少文字、多 icon), matching home/reader rails: mode row and 快速/深思 are icon-only controls with full Chinese labels in `title` / `aria-label` tooltips — not always-on text chips. Active mode/speed uses underline and quiet tint. Header keeps a short「选文解惑」title only; delete and evidence toggle prefer icon affordances (evidence: icon + count). Keep air between header → modes → speed → well with comfortable icon hit targets — never packed micro-type.
- Mode icons are peer controls; one active mode. Labels remain 书内出处 / 词条简介 / 深意阐释 / 概念释义 / 前后因果 (tooltips only in chrome).
- Secondary speed icons: 快速 (`deepseek-v4-flash`, thinking off) and 深思 (`deepseek-v4-pro`, thinking on for DeepSeek). Persist preference with AI settings.
- The answer is the visual prize and stays readable Chinese prose (do not icon-ify the explanation body): soft paper well / inset with serif quote + title, richer line-height, quiet left accent; quote lives inside the well as part of the reveal. Soft opacity/translateY when ready (respect `prefers-reduced-motion`). Optional「豁然开朗」kicker — literary ceremony, not AI dashboard chrome. Paper/ink, restrained green only.
- Evidence stays secondary, collapsed, and quieter at the bottom — never compete with the answer.
- Non-source modes may call a read-bounded model; source mode is local cites only.
- Switching speed refetches non-source answers (cache keyed by mode + speed).
- Persist every successful 解惑 result per book. Closing the panel must not discard stored explains.
- Mark the original selection in the page with a quiet badge (default「解」). Multiple explains on the same span collapse to one badge + count.
- Long hover (~500ms) on a marker shows a compact preview only: mode (+ speed), one-line conclusion (title or first sentence, max ~2 lines), and「依据 ×N · 点击展开」— never the full answer.
- Preview, reopened 解惑 panel, and the selection bloom (when the selection matches stored explains) all allow deleting; delete removes localStorage and clears the in-text marker immediately. Grouped badges (`解·N`) delete the currently shown item from preview; bloom delete removes all matching explains for that selection group.
- Click marker reopens the left 解惑 panel with the stored explanation and evidence; do not force a refetch when the mode+speed cache already has an answer.
- Markers must stay reading-native and low-reflow so page packing / clipping is not emptied.

Dismiss on:

- Outside pointer
- Escape
- Non-note action
- Timeout

## Component Rules

### Left Rail

- Icon-only by default.
- Consistent size, spacing, center alignment.
- Hover reveals intent.
- Active state must be subtle and consistent.

### Side Panel

- Same panel shell for all primary tools.
- Header: small label + clear title.
- Body: list, controls, or empty state.
- No unrelated explanatory copy.

### Recovery Card

- Use CSS grid/flex, not fragile absolute stacking.
- Header/title area: compact.
- Main question: visually primary.
- Memory anchors: 2-3.
- Prerequisites: 1-2 quiet chips.
- Footer: evidence toggle left, continue button right.

### Entity/Memory Items

- Primary display:
  - Name/title.
  - One-line role/reason.
  - Optional compact tags.
- Secondary evidence hidden until selected.
- Prioritize primary and recent items; secondary items are expandable.

## Motion

- Motion should signal state transition, not decorate.
- Recovery card uses a soft memory-fade/float entrance.
- Page turns use brief directional transition.
- Respect reduced-motion preference.
- Prefer transform and opacity.

## Empty States

Empty states should be quiet and specific:

- "当前页附近还没有可靠关系证据。"
- "尚未从已读内容中提取到可追溯时间线。"
- "继续阅读几页后，书脉会形成更稳定的记忆。"

Avoid blame or technical wording.

## Forbidden Patterns

- Full-book entity dumps in the reader by default.
- AI dashboard panels as the primary experience.
- Dense chips across the top of the page.
- Floating primary tool popovers.
- Native select for important navigation.
- Unverified graph edges.
- Showing unread spoilers.
- Showing metadata as memory.
- Showing "undefined", empty labels, or placeholder entities.
- Adding UI without hover/focus/empty states.

## Implementation Checklist

Before changing UI:

- Identify the flow: home, reader, recovery, side panel, search, selection, or memory view.
- Check whether the component already has a matching pattern.
- Avoid introducing a new visual language.
- Confirm the primary action.
- Confirm evidence behavior.
- Confirm empty state.
- Confirm no overlap at 1365x768 and 1920x1080.
- Run `npm run build`.
- Preview in the in-app browser when layout changes are visible.
