# Feature 023: Chapter Titles And Home Search Cleanup

## Problem

Some EPUB spine documents expose only a mechanical in-document heading such as `第 3 节`, while their EPUB navigation document contains the reader-facing chapter title. The reader currently displays the mechanical heading. The home shelf also renders an image-search icon without any usable image-search workflow.

## Scope

1. EPUB import resolves a display title for every spine item in this priority order:
   1. a matching EPUB 3 navigation-document label;
   2. a matching EPUB 2 NCX navigation label;
   3. the in-document heading;
   4. the existing generic section fallback.
2. Match labels to spine documents by normalized, fragment-free archive path.
3. Preserve existing paragraph and image parsing behavior.
4. Home search remains text-only. Remove the inactive image-search control and its unused icon import.

## Non-goals

- Do not invent chapter titles when the EPUB has no usable navigation label.
- Do not change the reader's Memory Engine, pagination, or search results behavior.
- Do not add image recognition or an image-search API.

## Acceptance Criteria

- An EPUB NAV or NCX label overrides a generic in-document heading for the same spine item.
- EPUBs without NAV/NCX retain their current title fallback behavior.
- The home search field has no image-search action.
- `npm run build` passes.
