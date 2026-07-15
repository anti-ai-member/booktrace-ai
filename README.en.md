# BookTrace AI

> Read with structure. Remember where everything came from.

BookTrace AI is a local-first desktop reading prototype for long-form books. It is designed for readers who lose track of characters, relationships, timelines, places, and source context while reading dense nonfiction, history, biographies, novels, or other complex books.

The project focuses on a quiet, reading-first desktop experience. AI is treated as an in-context reading assistant: it helps organize what you have already read, links every conclusion back to source evidence, and avoids turning the reader into a separate AI dashboard.

## What It Solves

Long books often create a practical memory problem:

- Too many characters to remember.
- Relationships between people, organizations, and events become hard to track.
- Earlier events are forgotten when later chapters reference them.
- Timelines are easy to confuse.
- Important places and movement routes blur together.
- Selected passages are hard to trace back to their original context.
- Readers need clarification without spoiling unread content.

BookTrace AI explores how a reader can build a structured, evidence-backed memory of a book as they read.

## Core Features

- **Local bookshelf**: Manage local books, categories, reading progress, and last reading position.
- **EPUB reader**: Parse local EPUB files, browse chapters, turn pages, and restore reading position.
- **AI reading index**: Extract characters, places, timelines, key events, and relationships from read content.
- **Evidence backlinks**: Every AI-generated entry keeps a source location so readers can jump back to the original text.
- **Priority-aware indexes**: Major characters, important places, and historically meaningful timeline events are shown first. Recent items are used as a fallback when no major entries are found.
- **Incremental analysis**: By default, the model only analyzes content the reader has already reached, then continues from the previous analysis result.
- **Bookmarks and notes**: Persist local bookmarks, notes, and reading positions per book.
- **Selection assistant UI**: Selecting text opens a quiet radial action menu with options such as explanation, recall, people, timeline, source, and notes. Some actions are currently UI-first prototypes.
- **Relationship visualization**: When reliable evidence-backed relationships are available, the app can show graph, hierarchy, and matrix views.
- **Reading themes**: Includes subtle paper-like themes such as plain paper, lotus, tea, orchid, flower branch, and bamboo.

## AI Principles

BookTrace AI does not try to summarize an entire book upfront. Instead, it follows the reader's progress and builds an index only from already-read content.

1. Analyze read content only, so unread chapters are not spoiled.
2. Reuse the previous analysis result and update it incrementally.
3. Keep characters, places, and timelines tightly related to the book's main thread.
4. Exclude incidental dates such as birthdays, publishing metadata, or loosely mentioned historical years from the main timeline.
5. Show place summaries in the place list, not raw source excerpts.
6. Keep source evidence for traceability whenever possible.

## Supported Formats

Currently readable:

- EPUB

Import entry points are prepared for future parser integrations:

- PDF
- TXT
- HTML
- RTF
- DOC / DOCX
- MOBI
- AZW / AZW3
- FB2
- DjVu
- CBZ / CBR

## Tech Stack

- React 19
- Vite 6
- Express
- LangChain
- DeepSeek / OpenAI chat models
- JSZip for EPUB parsing
- React Flow / Dagre for relationship diagrams
- PixiJS for the experimental reading ability tree
- LocalStorage for local persistence

## Getting Started

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

This starts both services:

- Web app: `http://localhost:5173`
- Local AI API: `http://127.0.0.1:8787`

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## AI Configuration

Copy the environment example:

```bash
cp .env.example .env
```

Set at least one API key:

```env
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
```

Default model settings:

- Provider: DeepSeek
- Model: `deepseek-v4-flash`

OpenAI models can also be selected from the reader's AI settings. API keys are read only by the local server from `.env`; they are not stored in browser state.

## Project Structure

```text
smart-reading/
├── books/                 # Local book assets, ignored by Git
├── public/                # Static assets
├── src/
│   ├── App.jsx            # Main app, bookshelf, reader, AI interactions
│   ├── epub.js            # EPUB parsing
│   ├── bookTaxonomy.js    # Book categories and index facet definitions
│   ├── skillSystem.js     # Experimental reading progress and badge system
│   ├── TalentConstellation.jsx
│   └── styles.css
├── server.mjs             # Local AI analysis API
├── .env.example
└── package.json
```

## Roadmap

- Add real parsers for PDF, TXT, MOBI, AZW3, and other formats.
- Improve entity merging, alias handling, and relationship stability across chapters.
- Connect the selection menu actions such as explanation, recall, and source lookup to real AI workflows.
- Improve visualizations for people, organizations, place routes, and timelines.
- Refine the desktop reading experience before designing the mobile app.
- Revisit the reading ability tree as a later feature without distracting from the core reading flow.

## Status

This is an actively evolving product prototype. The current goal is to explore how AI can reduce the cognitive load of long-form reading while preserving a calm, focused, source-grounded reading experience.

