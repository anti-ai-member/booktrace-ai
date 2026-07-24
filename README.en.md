# Shumai (书脉)

> Read the thread clearly. Remember where it came from.

[中文 README](./README.md)

Shumai is a local-first desktop reading prototype for deep long-form reading. It focuses on the memory problems dense books create: too many people, tangled relationships, broken timelines, lost places and events, and passages that are hard to trace back to evidence.

The UI stays quiet and reading-first. AI is a Memory Engine first (what should you recall right now), with ContextCite used for original-text positioning and evidence — not a heavy RAG dashboard.

## Core features

- Local bookshelf with cover-first browsing and per-book progress
- EPUB / PDF / MOBI·AZW·AZW3 reading (non-DRM Kindle); height-aware page packing; EPUB / MOBI inline images kept in the reading flow
- Continued-reading recovery with episode-specific, book-agnostic recall questions
- Memory Engine (entities, timeline, topics, arguments, episodic + reader memory)
- Selection 解惑 modes, persistable markers, notes with underlines
- Evidence-backed search and relationship views when reliable edges exist
- Quiet reading themes

## Supported formats

**Readable now:**

| Format | Notes |
|--------|--------|
| **EPUB** | Full support; inline images kept in the reading flow |
| **PDF** | Text-layer PDFs only; scanned / image-only PDFs are not extractable yet |
| **MOBI / AZW / AZW3** | Non-DRM Kindle books via foliate-js; DRM-protected files cannot be parsed |

**Accept dialog reserved, parsers not wired yet:** TXT, HTML, RTF, DOC / DOCX, FB2, DjVu, CBZ / CBR, etc.

Multi-select import is supported; unsupported files are skipped with a notice.

## Run locally

```bash
npm install
cp .env.example .env   # add DEEPSEEK_API_KEY and/or OPENAI_API_KEY
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

## Privacy / what not to commit

Keep local only (already gitignored where applicable):

- `.env` and API keys
- `books/` / `public/books/` imported files
- Browser IndexedDB / LocalStorage library, notes, explains, analysis memory
- Local debug screenshots, eval reports, caches

## Roadmap

See [`constitution/roadmap.md`](./constitution/roadmap.md).
