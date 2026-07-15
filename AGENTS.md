# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Recorded Prototype Decisions

- Build the desktop reading experience first; defer mobile implementation until the desktop workflow feels right.
- Keep the interface quiet, clean, and reading-first. The main text should have more visual space than supporting panels.
- Use the local EPUB `books/长征 (王树增著).epub` as the primary prototype content source.
- The reader uses page turns, not an internally scrolling text column. Each page should hold a substantial amount of readable text.
- Keep people, timeline, places, and citations contextual to the reading position and do not reveal unread material.
- Include a functional local bookshelf and book classification workflow.
- Keep analysis book-agnostic: do not add title-specific entity lists, fixed year ranges, or other book-specific extraction rules. The reader UI must remain independent of the analysis provider.
- Prefer model-driven, evidence-backed reading indexes for relevance judgments. Default provider/model: DeepSeek `deepseek-v4-flash`; support user-selected OpenAI models with API keys read only from local `.env`.
- Model prompts must prioritize the book's central narrative: include only causal, theme-relevant events and locations with direct original-text evidence; exclude biographical dates, incidental historical references, and inferred or corrected place names.
- Analysis is incremental and reading-bounded: analyze only content up to the current page, retain a per-book checkpoint and prior result, then pass only newly read content plus that prior result on the next analysis. Show the resulting people, places, key events, and chapter/page checkpoint after each run.
- Pages become read only after the reader leaves them; persist their chapter/page/paragraph markers. The latest read page, not merely the current open page, is the upper bound for incremental analysis.
- As reading grows, group people and places by model-assigned priority: show primary entities by default, show entities from the most recent read content separately, and keep secondary entities in an expandable lower layer. Use the same hierarchy in analysis summaries.
- Provide three analysis modes: default manual read analysis; optional automatic read analysis after a configurable number of newly read pages (default five); and explicitly slow manual full-book analysis.
- People must include one or two model-extracted, main-narrative role attributes (such as identity, responsibility, affiliation, or key relationship), displayed as compact tags rather than only a name and prose summary.
- Use a book-type taxonomy to drive reading indexes. Model analysis selects one type and 4-6 type-specific facets; the shelf includes an explicitly labeled sample book for every supported type to exercise the experience.
- Sample books must contain enough coherent multi-chapter text to exercise model classification, relevance filtering, entity priority, and summary behavior; they are not merely cover placeholders.
- Keep user-managed shelf tags separate from the complete book-type browser. Present the type browser as a compact, filterable grid in the sidebar rather than a flat three-item category list.
- Persist the reading chapter and page independently for each book, restoring that exact location when the reader reopens it rather than returning to page one.
- Reduce sidebar density with progressive disclosure: show a compact subset of book types by default with an explicit expand control, and make the reader's auxiliary index sidebar collapsible so the reading canvas can take priority.
- In the reader sidebar, keep the table of contents as the only direct tab; place all type-specific indexes behind a compact selector to prevent variable-length facet labels from crowding the navigation.
- Keep entity index panels scan-friendly: show at most four primary and three recent entries with a one-line explanation; place all remaining entries behind an expand control and reveal evidence only after the reader selects an item.
- Selecting a paragraph opens contextual reading assistance; clicking unused page space closes it. Page changes use a brief directional transition that respects reduced-motion preferences.
- Use a custom popover menu for the reader index selector, not a native select, so each index can show readable padding, a short description, and an active state.
- Offer quiet, persistent reading themes (lotus, tea, orchid, flower branch, bamboo, and plain paper) through a dedicated reader control; limit them to subtle paper/ink tints and very low-contrast edge motifs so the text stays dominant.
- Keep the reading-theme control in the fixed top toolbar region; do not place it as a free-floating control that can collide with reading actions.
- Theme controls must participate in the toolbar grid flow so they never overlay the book search field or other topbar controls.
- Treat the reader sidebar's table of contents and index selector as a single, aligned navigation system: low-chrome text controls with a thin divider, rather than mixing a large tab with an input-like bordered control.
- The contents and reading-index entry are semantically peer controls. Render both as flat tabs with the same height, typography, padding, and active underline; the index tab alone may carry a chevron to open its menu.
- Persist reading position per book and restore chapter/page whenever a book is reopened; do not reset it during shelf navigation. Provide local per-book bookmarks with an icon toggle in the reader and a compact jump/delete list below the table of contents.
- Selecting text in the reading page opens a quiet lotus-like radial assistance menu. The UI shows the selected excerpt and options for explanation, recall, people, timeline, and source; its actions are visual-only until their underlying reading workflows are implemented.
- The selection lotus uses uniformly sized, low-saturation pale-pink petals and matching pink linework, not theme-green controls. Add a functional local note petal: it opens a compact composer, persists notes per book, and exposes them in the contents sidebar for jump/delete.
- Selection assistance is transient: dismiss it on any outside pointer interaction, `Esc`, a non-note action click, or nine seconds of inactivity.
- Theme selection also controls the selected-text assistance appearance: keep its interaction and geometry stable, but adapt the menu's palette and subtle petal/leaf treatment to plain paper, lotus, tea, orchid, flower branch, or bamboo.
- Show model-backed relationship visualizations only when reliable, evidenced edges exist in the currently read range. Open a right-side relation workspace that preserves some reading context and offers network, organization hierarchy, and matrix views; every selected relation must expose a jump back to its source evidence.
- The reading progression system has always-available universal skills plus type-specific talent trees. Track meaningful local reading events, active reading time, pages, bookmarks, notes, and source-evidence jumps. Present type-themed badge titles: military books use rank/command titles, history uses Song-era scholarly offices, and other types use role-appropriate titles.
- The ability-tree workspace must own a vertical scroll container so its archive, constellation path, and badge shelf cannot be clipped. Render special skills as a PixiJS-backed star-lodge scene with authored constellation coordinates, glow states, and React-managed details; do not use CSS-only absolute-positioned fake constellation layouts for this feature.
- Keep AI capabilities as the product's main differentiator, but present them as simple, reading-native assistance: inline annotations, evidence-backed indexes, and one-click contextual actions. Avoid complex AI dashboards, decorative AI panels, and multi-step flows that pull attention away from reading.
- Product name: `书脉`; slogan: `读得清脉络，记得住来处`.
- The home bookshelf should feel like an editorial physical bookshelf display rather than dense product cards: larger covers/book spines, subtle shelf lines, quiet labels, and hover lift, inspired by refined bookshelf browsing references while keeping three books per row on desktop.
- The home shelf should stay cover-first and compact like a visual pinboard: default cards show little to no text, while title, author, progress, and actions appear in a hover/focus overlay.
- The home chrome should follow the same Pinterest-like simplicity: compact top bar, horizontal filter chips instead of a heavy left sidebar, no large shelf heading, and content should begin quickly below the filters.
