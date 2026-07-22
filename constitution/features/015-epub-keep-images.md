# Feature 015: Keep EPUB Images In Reading Flow

## Goal

Parse and render in-book EPUB images instead of discarding them when building chapter paragraphs for pagination.

## Scope

- EPUB parsers (`src/epubWorker.js`, `src/epub.js`) extract `<img>` (and SVG `<image href>` / `xlink:href`) into paragraph blocks with embedded `data:` URLs.
- Reader page packing treats image blocks as atomic height costs so text is not clipped and pages are not left half-empty solely because of images.
- Reader renders images inline in the page track.
- Text paragraphs remain strings; image paragraphs are `{ type: "image", src, alt }`.
- Memory/search/classification skip or safely ignore image-only blocks.

## Out of scope

- External `http(s)` image URLs
- Full CSS layout fidelity from the EPUB stylesheet
- Image zoom / lightbox

## Acceptance

- Long March EPUB image assets are counted and in-flow images appear after re-parse.
- `npm run build` passes.
- AGENTS.md records that EPUB images are kept in the reading flow.
