# Feature 017: MOBI / Kindle Import

## Goal

Allow readers to import `.mobi` (and Kindle `.azw` / `.azw3`) files into the local bookshelf and read them with the same chapter/paragraph reader model as EPUB/PDF.

## Scope

- Client-side parse via `foliate-js` `mobi.js` (+ `fflate` for KF8 zlib).
- Output the same book shape as EPUB/PDF: `{ title, creator, publisher, language, cover, chapters[{ id, href, title, paragraphs }] }`.
- Paragraphs are plain strings; inline images become `{ type: "image", src: dataUrl, alt }` (data URLs only, for IndexedDB persistence).
- Wire `importBook` / `parseImportedBook` so `.mobi` / `.azw` / `.azw3` are readable formats.
- Update shelf copy and README so MOBI is listed as directly readable.

## Out of scope

- DRM-protected Kindle files
- Perfect CSS / fixed-layout Kindle fidelity
- Server-side conversion
- Other planned formats (TXT, DOCX, FB2, etc.)

## Acceptance

- Selecting a non-DRM `.mobi` (or `.azw3`) imports a book with at least one chapter of readable text.
- Cover is optional; missing cover must not fail import.
- Empty/unreadable files surface a clear Chinese error.
- Duplicate fingerprint behavior matches existing EPUB/PDF import.
- `npm run build` passes.

## Status

Implemented. Fixed browser import for real Kindle markup: do not re-parse `section.load()` output as `application/xhtml+xml` (MOBI HTML is often not well-formed XML). Use `createDocument()` + `text/html`-safe extraction instead. Verified against `books/背叛 - 豆豆.mobi` (2 chapters, cover).
