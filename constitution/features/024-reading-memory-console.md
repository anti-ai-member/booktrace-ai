# Feature 024: Reading Memory Console Clarity

## Problem

The AI reader panel exposes implementation-oriented labels such as "更新恢复卡" and
"重建材料". Readers cannot tell what will be produced or when to use either action.
The panel also contains hard-coded Chinese text, so it does not follow the app locale.
When new read content exists, refreshing waits for memory extraction and model work before
opening a recovery card, which makes the useful result feel slow.

## Scope

1. Present the panel as a reading-memory tool: explain that it creates key context,
   current-page prerequisites, and evidence from the already-read range.
2. Rename the actions by outcome: update reading memory for read content; rebuild the
   full-book reading memory only for corrections.
3. Localize every visible panel label through the existing locale catalog.
4. On a manual read-range update, immediately open a locally generated recovery card
   when usable prior memory exists, then keep model extraction/refinement in the background.
5. Surface concise background status without preventing reading, page turns, or closing the panel.

## Non-goals

- Do not change Memory Engine extraction, model selection, or the recovery-card layout.
- Do not turn the panel into an AI dashboard or add extra analysis modes.
- Do not send unread content to the model.

## Acceptance

- A first-time reader can tell what each action returns and which content it uses.
- English locale contains no Chinese in this panel.
- Existing local recovery material appears before a slow model request completes.
- The primary action remains read-bounded; full-book rebuild remains explicit and secondary.
- `npm run build` passes.
