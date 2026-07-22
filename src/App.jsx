import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Bot,
  Brain,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  CircleHelp,
  Coffee,
  Eye,
  FileText,
  Flower2,
  FolderPlus,
  GitBranch,
  History,
  Lightbulb,
  Quote,
  ListFilter,
  Minus,
  Network,
  Plus,
  Palette,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Tag,
  Trees,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { parseEpub } from "./epub.js";
import { BOOK_TYPES, findBookType } from "./bookTaxonomy.js";
import { buildMemoryCandidates, buildMemoryEvidenceStore, locateEvidence } from "./memoryEngine.js";
import {
  bookMemoryFromLegacy,
  collectMemoryAnchors,
  compatibilityTraceMemory,
  hasBookMemoryContent,
  normalizeBookMemory,
  readingIndexFromBookMemory,
  readerForgettingScore,
  updateReaderMemory,
} from "./memoryModels.js";
import { buildRecoveryPlan } from "./contextBuilder.js";
import {
  hasConcreteEpisodeCue,
  hintFromEvidenceExcerpt,
  isBroadMegaTopic,
  isWeakRecoveryHint,
  isWeakRecoveryQuestion,
  preferQuestionAnchor,
  questionFromEpisodeAnchor,
  sanitizeModelRecoveryQuestion,
  sortEvidenceByCursorProximity,
} from "./recoveryQuality.js";
import { resolveTraceProfile, traceProfileForPrompt } from "./traceProfiles.js";
import { UNIVERSAL_SKILLS, createReadingProgress, domainProgress, earnedBadges, getDomainConfig, resolveSkillDomain, unlockedSpecialSkills } from "./skillSystem.js";
import { TalentConstellation } from "./TalentConstellation.jsx";
import {
  buildAssistFromExplain,
  explainModeLabel,
  findExplainsForSelection,
  groupExplainMarkersForSegment,
  groupNoteMarksForSegment,
  loadExplains,
  markerShortLabel,
  previewConclusion,
  previewMetaLabel,
  removeExplains,
  upsertExplain,
} from "./explainMemory.js";

const BUILT_IN_BOOK_ID = "long-march";
const BUILT_IN_CACHE_VERSION = "long-march-v2-images";
/** Bump when EPUB paragraph shape changes (e.g. keep inline images). Re-import upgrades stale IndexedDB books. */
const EPUB_CONTENT_PARSE_VERSION = "epub-v2-images";
const BOOK_PATH = "/books/long-march.epub";
const COVER_PATH = "/books/long-march-cover.jpeg";
const APP_NAME = "书脉";
const APP_SLOGAN = "读得清脉络，记得住来处";

function BrandMark({ size = 22 }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path d="M5.5 9.2c3.4-1.8 6.6-1.7 10.5.6v13.4c-3.8-2.1-7-2.2-10.5-.3V9.2Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M26.5 9.2c-3.4-1.8-6.6-1.7-10.5.6v13.4c3.8-2.1 7-2.2 10.5-.3V9.2Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M8.8 15.2c2.4 2.1 4.1-.6 7.2 1.1 2.6 1.4 4.2 3 7.2 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="10.4" cy="15.8" r="1.35" fill="currentColor" />
        <circle cx="16" cy="16.3" r="2.05" fill="currentColor" />
        <circle cx="22.4" cy="17.5" r="1.35" fill="currentColor" />
      </svg>
    </span>
  );
}

const SUPPORTED_IMPORT_ACCEPT = ".epub,.pdf,.txt,.html,.htm,.rtf,.doc,.docx,.mobi,.azw,.azw3,.fb2,.djvu,.cbz,.cbr,application/epub+zip,application/pdf,text/plain,text/html";
const READABLE_IMPORT_FORMATS = new Set(["epub", "pdf"]);
const TRACE_ANALYSIS_VERSION = "trace-v5";
const PAGE_COLUMN_GAP = 64;
const RECOVERY_CARD_MIN_ABSENCE_MS = 12 * 60 * 60 * 1000;
const PLANNED_BOOK_FORMATS = new Map([
  ["pdf", "PDF"],
  ["txt", "TXT"],
  ["html", "HTML"],
  ["htm", "HTML"],
  ["rtf", "RTF"],
  ["doc", "Word"],
  ["docx", "Word"],
  ["mobi", "MOBI"],
  ["azw", "Kindle AZW"],
  ["azw3", "Kindle AZW3"],
  ["fb2", "FB2"],
  ["djvu", "DjVu"],
  ["cbz", "CBZ 漫画书"],
  ["cbr", "CBR 漫画书"],
]);
const DEFAULT_CATEGORIES = ["历史纪实", "军事", "中国近现代史"];
const DEFAULT_AI_SETTINGS = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  analysisMode: "read",
  autoPageThreshold: 5,
  explainSpeed: "fast",
};
/** Continued-reading recovery cards default to DeepSeek Pro with thinking mode. */
const RECOVERY_MODEL_BY_PROVIDER = {
  deepseek: "deepseek-v4-pro",
  openai: "gpt-4.1-mini",
};
const EXPLAIN_SPEED_MODES = [
  { id: "fast", label: "快速", detail: "快速 · DeepSeek flash，较快整理", icon: Zap },
  { id: "deep", label: "深思", detail: "深思 · DeepSeek pro + 思考模式", icon: Brain },
];

function resolveExplainRequest(settings = {}) {
  const provider = settings.provider || "deepseek";
  const speed = settings.explainSpeed === "deep" ? "deep" : "fast";
  if (speed === "deep") {
    return {
      speed,
      provider,
      model: provider === "deepseek"
        ? "deepseek-v4-pro"
        : (RECOVERY_MODEL_BY_PROVIDER[provider] || settings.model || "gpt-4.1-mini"),
      thinking: provider === "deepseek",
    };
  }
  return {
    speed,
    provider,
    model: provider === "deepseek"
      ? "deepseek-v4-flash"
      : (settings.model || "gpt-4.1-mini"),
    thinking: false,
  };
}

function explainCacheKey(mode, speed = "fast") {
  return `${mode}:${speed === "deep" ? "deep" : "fast"}`;
}
const LIBRARY_DB_NAME = "shumai-library";
const LIBRARY_DB_VERSION = 1;
const LIBRARY_STORE = "books";
const EMPTY_READING_INDEX = { people: [], organizations: [], places: [], timeline: [], relationships: [] };
const READING_THEMES = [
  { id: "plain", name: "素笺", detail: "清透留白", icon: BookOpen },
  { id: "lotus", name: "荷花", detail: "淡青水色", icon: Flower2 },
  { id: "tea", name: "香茗", detail: "轻烟暖白", icon: Coffee },
  { id: "orchid", name: "兰花", detail: "幽绿清雅", icon: Sprout },
  { id: "flower", name: "花枝", detail: "微粉春意", icon: Flower2 },
  { id: "bamboo", name: "竹林", detail: "疏竹晨雾", icon: Trees },
];
const EXPLAIN_MODES = [
  { id: "source", label: "书内出处", detail: "在已读范围定位相关原文", icon: Quote },
  { id: "entity", label: "词条简介", detail: "人物、地点、组织或术语的身份与作用", icon: Tag },
  { id: "meaning", label: "深意阐释", detail: "段落在论证或主题上的含义", icon: Lightbulb },
  { id: "concept", label: "概念释义", detail: "本书语境下的概念用法", icon: CircleHelp },
  { id: "context", label: "前后因果", detail: "此刻为何重要", icon: GitBranch },
];

function defaultExplainMode(selection = "", bookType = "") {
  const text = String(selection || "").trim();
  const type = String(bookType || "");
  const shortTerm = text.length > 0 && text.length <= 12 && !/[。！？；\n]/.test(text);
  if (shortTerm) {
    if (/科普|教材|技术|科学|学习|商业/.test(type)) return "concept";
    return "entity";
  }
  if (/哲学|思想|文学|随笔|商业/.test(type) && text.length > 24) return "meaning";
  if (/科普|教材|技术|科学|学习/.test(type) && text.length <= 40) return "concept";
  return "source";
}

function loadStored(name, fallback) {
  try {
    const value = localStorage.getItem(name);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(resolve, { timeout: 120 });
      return;
    }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

async function buildMemoryCandidatesAsync(chapters = [], traceProfile = null, onProgress) {
  const merged = new Map();
  const mergeCandidate = (candidate) => {
    const id = candidate.id || `${candidate.type}:${candidate.name}`;
    const current = merged.get(id);
    if (!current) {
      merged.set(id, {
        ...candidate,
        occurrences: [...(candidate.occurrences || [])],
        contexts: [...(candidate.contexts || [])],
      });
      return;
    }
    current.count += candidate.count || 1;
    current.impactHint = Math.max(current.impactHint || 0, candidate.impactHint || 0);
    current.occurrences = [...current.occurrences, ...(candidate.occurrences || [])].slice(0, 5);
    current.contexts = [...current.contexts, ...(candidate.contexts || [])].slice(0, 3);
  };

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    const paragraphs = chapter.paragraphs || [];
    const batchSize = paragraphs.length > 120 ? 80 : Math.max(1, paragraphs.length);
    for (let offset = 0; offset < paragraphs.length; offset += batchSize) {
      const partialChapter = {
        ...chapter,
        paragraphs: paragraphs.slice(offset, offset + batchSize).map((paragraph, paragraphOffset) => (
          typeof paragraph === "string"
            ? { text: paragraph, paragraphIndex: offset + paragraphOffset }
            : paragraph
        )),
      };
      buildMemoryCandidates([partialChapter], traceProfile).forEach(mergeCandidate);
      onProgress?.(merged.size);
      await yieldToBrowser();
    }
    if (!paragraphs.length) await yieldToBrowser();
  }

  return [...merged.values()]
    .map((item) => ({
      ...item,
      occurrences: (item.occurrences || []).slice(0, 5),
      contexts: (item.contexts || []).slice(0, 3),
    }))
    .sort((left, right) => (right.impactHint || 0) - (left.impactHint || 0) || (right.count || 0) - (left.count || 0))
    .slice(0, 80);
}

async function parseEpubInWorker(fileOrBlob) {
  if (typeof Worker === "undefined") return parseEpub(fileOrBlob);
  const buffer = await fileOrBlob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const id = `epub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const worker = new Worker(new URL("./epubWorker.js", import.meta.url), { type: "module" });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      cleanup();
      if (event.data.ok) resolve(event.data.parsed);
      else reject(new Error(event.data.error || "EPUB 解析失败"));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "EPUB Worker 解析失败"));
    };
    worker.postMessage({ id, buffer }, [buffer]);
  });
}

function openLibraryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LIBRARY_DB_NAME, LIBRARY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) db.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadStoredLibraryBooks() {
  try {
    const db = await openLibraryDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(LIBRARY_STORE, "readonly");
      const request = transaction.objectStore(LIBRARY_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    });
  } catch {
    return [];
  }
}

async function saveStoredLibraryBook(book) {
  if (!book || (book.local && !book.builtIn)) return;
  const db = await openLibraryDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readwrite");
    transaction.objectStore(LIBRARY_STORE).put(book);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function deleteStoredLibraryBook(bookId) {
  if (!bookId) return;
  const db = await openLibraryDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readwrite");
    transaction.objectStore(LIBRARY_STORE).delete(bookId);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export function App() {
  const [screen, setScreen] = useState("shelf");
  const [book, setBook] = useState(null);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState(() => loadStored("yuezhi-categories", DEFAULT_CATEGORIES));
  const [bookCategories, setBookCategories] = useState(() => loadStored("yuezhi-book-categories", DEFAULT_CATEGORIES));
  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeType, setActiveType] = useState("全部类型");
  const [typeBrowserExpanded, setTypeBrowserExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [pageTurn, setPageTurn] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageWidth, setPageWidth] = useState(900);
  const [pageHeight, setPageHeight] = useState(720);
  const [pagePackScale, setPagePackScale] = useState(1);
  const [activePanel, setActivePanel] = useState("目录");
  const [selectedParagraph, setSelectedParagraph] = useState(null);
  const [selectionBloom, setSelectionBloom] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shelfSearchOpen, setShelfSearchOpen] = useState(false);
  const [shelfSearchQuery, setShelfSearchQuery] = useState("");
  const [analysisSettings, setAnalysisSettings] = useState(() => ({ ...DEFAULT_AI_SETTINGS, ...loadStored("yuezhi-ai-settings", DEFAULT_AI_SETTINGS) }));
  const [readingTheme, setReadingTheme] = useState(() => loadStored("yuezhi-reading-theme", "plain"));
  const [analysisSummaryOpen, setAnalysisSummaryOpen] = useState(false);
  const [selectionAssist, setSelectionAssist] = useState(null);
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [readingProgress, setReadingProgress] = useState(() => ({ ...createReadingProgress(), ...loadStored("yuezhi-reading-progress", createReadingProgress()) }));
  const [aiIndex, setAiIndex] = useState(null);
  const [memoryEvidenceStore, setMemoryEvidenceStore] = useState(null);
  const [bookProfile, setBookProfile] = useState(null);
  const [analysisRecord, setAnalysisRecord] = useState(null);
  const [recoveryCard, setRecoveryCard] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [readPages, setReadPages] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [explains, setExplains] = useState([]);
  const [explainPreview, setExplainPreview] = useState(null);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteContext, setNoteContext] = useState(null);
  const [analysisState, setAnalysisState] = useState({ status: "idle", message: "尚未使用大模型分析" });
  const [traceJob, setTraceJob] = useState({ status: "idle", message: "AI Trace 空闲" });
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);
  const pageCopyRef = useRef(null);
  const pageTrackRef = useRef(null);
  const pageSizeRef = useRef({ width: 900, height: 720 });
  const readingAnchorRef = useRef({ paragraphIndex: 0, charOffset: 0 });
  const layoutMetricsRef = useRef({ width: 900, height: 720, packScale: 1 });
  const layoutRestoreRef = useRef(false);
  const didInitialPageMeasureRef = useRef(false);
  // Chapter pack plan: settle once, then freeze so page turns cannot rewrite pageCount.
  const packPlanRef = useRef({ locked: false, safetyApplied: false });
  const recoveryCardJobRef = useRef(0);
  const readingStartedAtRef = useRef(Date.now());

  useEffect(() => {
    didInitialPageMeasureRef.current = false;
    layoutRestoreRef.current = false;
    pageSizeRef.current = { width: 900, height: 720 };
    layoutMetricsRef.current = { width: 900, height: 720, packScale: 1 };
  }, [book?.id, screen]);

  useEffect(() => { localStorage.setItem("yuezhi-categories", JSON.stringify(categories)); }, [categories]);
  useEffect(() => { localStorage.setItem("yuezhi-book-categories", JSON.stringify(bookCategories)); }, [bookCategories]);
  useEffect(() => {
    if (!book) return;
    const storageKey = readingPositionStorageKey(book);
    const saved = loadStored(storageKey, { chapterIndex: 0, pageIndex: 0 });
    setChapterIndex(Math.min(Math.max(saved.chapterIndex || 0, 0), book.chapters.length - 1));
    setPageIndex(Math.max(saved.pageIndex || 0, 0));
  }, [book?.id, book?.title, book?.creator, book?.chapters.length]);

  useEffect(() => {
    if (!book) return;
    const storageKey = readingPositionStorageKey(book);
    localStorage.setItem(storageKey, JSON.stringify({ chapterIndex, pageIndex, updatedAt: Date.now() }));
  }, [book, chapterIndex, pageIndex]);
  useEffect(() => { localStorage.setItem("yuezhi-ai-settings", JSON.stringify(analysisSettings)); }, [analysisSettings]);
  useEffect(() => { localStorage.setItem("yuezhi-reading-theme", JSON.stringify(readingTheme)); }, [readingTheme]);
  useEffect(() => { localStorage.setItem("yuezhi-reading-progress", JSON.stringify(readingProgress)); }, [readingProgress]);

  useEffect(() => () => {
    recoveryCardJobRef.current += 1;
  }, []);

  useEffect(() => {
    clearLegacyAnalysisStorage();
  }, []);

  useEffect(() => {
    if (!book) return;
    const storageKey = analysisStorageKey(book);
    const storedRecord = loadStored(storageKey, null);
    const record = storedRecord ? hydrateAnalysisRecord(storedRecord, book) : null;
    setReadPages(loadStored(readPagesStorageKey(book), []));
    setAnalysisRecord(record);
    setRecoveryCard(null);
    setAiIndex(record?.index || null);
    setBookProfile(record?.profile || (book.bookType ? { category: book.bookType, facets: book.indexSchema || findBookType(book.bookType).facets } : null));
    setAnalysisState(record ? { status: "done", message: "已加载上次增量分析结果" } : { status: "idle", message: "尚未使用大模型分析" });
    setTraceJob(record ? { status: "done", message: "已加载上次 Trace" } : { status: "idle", message: "AI Trace 空闲" });
    if (record) localStorage.setItem(storageKey, JSON.stringify(record));
  }, [book?.title, book?.creator, book?.chapters.length]);

  useEffect(() => {
    if (!book) return;
    setBookmarks(loadStored(bookmarkStorageKey(book), []));
  }, [book?.id, book?.title, book?.creator, book?.chapters.length]);

  useEffect(() => {
    if (!book) return;
    setNotes(loadStored(notesStorageKey(book), []));
  }, [book?.id, book?.title, book?.creator, book?.chapters.length]);

  useEffect(() => {
    if (!book) return;
    setExplains(loadExplains(book));
    setExplainPreview(null);
  }, [book?.id, book?.title, book?.creator, book?.chapters.length]);

  useEffect(() => {
    setExplainPreview(null);
  }, [chapterIndex, pageIndex]);

  useEffect(() => {
    if (analysisSettings.analysisMode !== "auto" || analysisState.status === "loading" || traceJob.status === "running" || !book) return;
    const latestRead = getLatestReadCursor();
    const unreadSinceAnalysis = countReadPagesAfter(readPages, analysisRecord?.cursor);
    if (latestRead && unreadSinceAnalysis >= analysisSettings.autoPageThreshold) {
      setTraceJob({ status: "queued", message: "AI Trace 已排队" });
      const timer = window.setTimeout(() => analyzeBook("read", true), 120);
      return () => window.clearTimeout(timer);
    }
  }, [readPages, analysisSettings.analysisMode, analysisSettings.autoPageThreshold, analysisRecord, analysisState.status, traceJob.status, book]);

  useEffect(() => {
    async function loadBuiltInBook() {
      try {
        const storedBooks = await loadStoredLibraryBooks();
        const importedBooks = storedBooks.filter((item) => !item.local);
        const cachedBuiltIn = storedBooks.find((item) => item.id === BUILT_IN_BOOK_ID && item.builtInCacheVersion === BUILT_IN_CACHE_VERSION) || null;
        const activeBookId = loadStored("shumai-active-book-id", "");
        const cachedBooks = cachedBuiltIn ? [cachedBuiltIn, ...importedBooks] : importedBooks;
        const activeCachedBook = cachedBooks.find((item) => item.id === activeBookId) || cachedBuiltIn || importedBooks[0] || null;
        setLibraryBooks(cachedBooks);
        if (activeCachedBook) {
          setBook(activeCachedBook);
          setChapterIndex((current) => Math.min(Math.max(current, 0), activeCachedBook.chapters.length - 1));
        }
        const staleEpubCount = importedBooks.filter((item) => needsEpubContentReparse(item)).length;
        if (staleEpubCount > 0 && !loadStored("shumai-epub-image-reparse-hint", false)) {
          localStorage.setItem("shumai-epub-image-reparse-hint", JSON.stringify(true));
          showNotice(`${staleEpubCount} 本已导入 EPUB 仍是旧解析；重新导入同一文件即可显示插图`);
        }
        if (cachedBuiltIn) {
          return;
        }
        await yieldToBrowser();

        const response = await fetch(BOOK_PATH);
        if (!response.ok) throw new Error("无法打开本地 EPUB 文件");
        const parsed = await parseEpubInWorker(await response.blob());
        const builtIn = {
          ...parsed,
          id: BUILT_IN_BOOK_ID,
          fingerprint: "builtin:long-march",
          cover: COVER_PATH,
          bookType: "历史纪实 / 传记",
          indexSchema: findBookType("历史纪实 / 传记").facets,
          local: true,
          builtIn: true,
          format: "EPUB",
          builtInCacheVersion: BUILT_IN_CACHE_VERSION,
          contentParseVersion: EPUB_CONTENT_PARSE_VERSION,
        };
        await saveStoredLibraryBook(builtIn);
        const books = [builtIn, ...importedBooks];
        const activeBook = books.find((item) => item.id === activeBookId) || builtIn;
        setLibraryBooks(books);
        setBook((current) => current || activeBook);
        setChapterIndex((current) => Math.min(Math.max(current, 0), activeBook.chapters.length - 1));
      } catch (error) {
        setLoadError(error.message || "解析 EPUB 时出现问题");
      }
    }
    loadBuiltInBook();
  }, []);

  useEffect(() => {
    if (book?.id) localStorage.setItem("shumai-active-book-id", JSON.stringify(book.id));
  }, [book?.id]);

  useEffect(() => {
    Promise.all(libraryBooks.filter((item) => !item.local).map((item) => saveStoredLibraryBook(item))).catch(() => {});
  }, [libraryBooks]);

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!selectionBloom) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (event.target.closest?.(".selection-bloom")) return;
      setSelectionBloom(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectionBloom(null);
    };
    const timeout = window.setTimeout(() => setSelectionBloom(null), 9000);
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectionBloom]);

  useEffect(() => {
    if (!recoveryCard) return;
    setDrawerOpen(false);
    setSelectedParagraph(null);
    setSelectionBloom(null);
  }, [recoveryCard]);

  const chapter = book?.chapters[chapterIndex];
  const chapterPage = useMemo(
    () => paginateChapterWindow(chapter, pageIndex, pageWidth, pageHeight, pagePackScale),
    [chapter, pageIndex, pageWidth, pageHeight, pagePackScale],
  );
  const visiblePageIndex = Math.min(pageIndex, Math.max(0, chapterPage.pageCount - 1));
  const currentPageParagraphs = chapterPage.items || [];
  const hasPriorReadingContext = chapterIndex > 0 || visiblePageIndex > 0;
  useEffect(() => {
    function updatePageMetrics() {
      const viewport = pageCopyRef.current;
      if (!viewport) return;
      const width = Math.round(viewport.clientWidth);
      const style = window.getComputedStyle(viewport);
      const padY = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
      // Budget against the content box only — padding is reserved for glyph clearance.
      const height = Math.round(viewport.clientHeight - padY);
      if (width <= 0 || height <= 0) return;
      const prev = pageSizeRef.current;
      // Ignore ±1–2px ResizeObserver jitter so charBudget / pageCount stay stable while flipping.
      const PAGE_SIZE_HYSTERESIS_PX = 2;
      if (
        didInitialPageMeasureRef.current
        && Math.abs(prev.width - width) < PAGE_SIZE_HYSTERESIS_PX
        && Math.abs(prev.height - height) < PAGE_SIZE_HYSTERESIS_PX
      ) {
        return;
      }
      const sizeShifted = Math.abs(prev.width - width) >= 24 || Math.abs(prev.height - height) >= 24;
      if (didInitialPageMeasureRef.current && sizeShifted) {
        layoutRestoreRef.current = true;
        packPlanRef.current = { locked: false, safetyApplied: false };
        setPagePackScale(1);
      }
      didInitialPageMeasureRef.current = true;
      pageSizeRef.current = { width, height };
      setPageWidth(width);
      setPageHeight(height);
    }

    const frame = requestAnimationFrame(updatePageMetrics);
    const observer = new ResizeObserver(updatePageMetrics);
    if (pageCopyRef.current) observer.observe(pageCopyRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [chapter, screen, sidebarCollapsed, relationshipOpen]);

  // Pack scale is chapter-scoped: reset only when chapter changes (or on meaningful viewport resize above).
  // Never reset on pageIndex — that made totals oscillate as each page re-measured overflow.
  useEffect(() => {
    packPlanRef.current = { locked: false, safetyApplied: false };
    setPagePackScale(1);
  }, [chapter?.id]);

  useEffect(() => {
    const nextCount = Math.max(1, chapterPage.pageCount);
    setPageCount(nextCount);
    setPageIndex((index) => Math.min(index, nextCount - 1));
  }, [chapterPage.pageCount]);

  // Keep a paragraph/char anchor for the visible page so layout-driven repacks can restore position.
  useLayoutEffect(() => {
    if (!currentPageParagraphs.length) return;
    const preferred = [
      selectionAssist?.paragraphIndex,
      selectionBloom?.paragraphIndex,
      selectedParagraph,
    ].find((value) => Number.isInteger(value));
    const metrics = getLogicalPageMetrics(pageWidth, pageHeight, pagePackScale);

    if (Number.isInteger(preferred)) {
      const match = currentPageParagraphs.find((item) => item.paragraphIndex === preferred);
      let charOffset = 0;
      if (selectionAssist?.paragraphIndex === preferred && Number.isInteger(selectionAssist?.startOffset)) {
        charOffset = selectionAssist.startOffset;
      } else if (selectionBloom?.paragraphIndex === preferred && Number.isInteger(selectionBloom?.startOffset)) {
        charOffset = selectionBloom.startOffset;
      } else if (match) {
        charOffset = Math.max(0, (Number(match.segmentIndex) || 0) * metrics.longSegmentSize);
      }
      readingAnchorRef.current = {
        paragraphIndex: preferred,
        charOffset: Math.max(0, charOffset),
      };
      return;
    }

    const first = currentPageParagraphs[0];
    readingAnchorRef.current = {
      paragraphIndex: first.paragraphIndex,
      charOffset: Math.max(0, (Number(first.segmentIndex) || 0) * metrics.longSegmentSize),
    };
  }, [currentPageParagraphs, selectionAssist, selectionBloom, selectedParagraph, pageWidth, pageHeight, pagePackScale]);

  // After .page-copy resizes (sidebar / relation panel) or pack-scale settles, remap pageIndex from the reading anchor.
  useEffect(() => {
    const prev = layoutMetricsRef.current;
    const widthChanged = prev.width !== pageWidth;
    const heightChanged = prev.height !== pageHeight;
    const scaleChanged = prev.packScale !== pagePackScale;
    layoutMetricsRef.current = { width: pageWidth, height: pageHeight, packScale: pagePackScale };
    if (!chapter || !layoutRestoreRef.current) return;
    if (!widthChanged && !heightChanged && !scaleChanged) return;

    const anchor = readingAnchorRef.current;
    if (!Number.isInteger(anchor?.paragraphIndex)) return;
    const nextIndex = findPageForParagraphInChapter(
      chapter,
      anchor.paragraphIndex,
      pageWidth,
      pageHeight,
      pagePackScale,
      anchor.charOffset,
    );
    setPageIndex((current) => (current === nextIndex ? current : nextIndex));
  }, [pageWidth, pageHeight, pagePackScale, chapter]);

  useEffect(() => {
    const viewport = pageCopyRef.current;
    if (!viewport || viewport.clientWidth <= 0) return;
    viewport.scrollLeft = 0;
  }, [pageIndex, pageWidth, pageHeight]);

  useEffect(() => {
    const viewport = pageCopyRef.current;
    const track = pageTrackRef.current;
    if (!viewport || !track || !currentPageParagraphs.length) return undefined;
    // Avoid measuring mid page-turn animation (transform can skew rects).
    if (pageTurn) return undefined;
    let cancelled = false;
    let frame = 0;

    function shrinkPackScale(ratio) {
      layoutRestoreRef.current = true;
      packPlanRef.current.locked = false;
      setPagePackScale((scale) => {
        const next = Math.max(0.3, Math.min(scale * ratio, scale - 0.06));
        return Math.round(next * 100) / 100;
      });
    }

    function measureOverflow() {
      if (cancelled) return;
      const copyBox = viewport.getBoundingClientRect();
      const blocks = track.querySelectorAll("p, figure.page-figure");
      if (!blocks.length || copyBox.height <= 0) return;
      const last = blocks[blocks.length - 1];
      const lastBottom = last.getBoundingClientRect().bottom;
      const style = window.getComputedStyle(viewport);
      const padBottom = Number.parseFloat(style.paddingBottom) || 0;
      // overflow:hidden clips at the padding edge; keep a one-line band above it.
      const clipFloor = copyBox.bottom;
      const safetyPx = Math.max(26, padBottom + 12);
      const softLimit = clipFloor - safetyPx;
      const fitsSoft = lastBottom <= softLimit + 0.5;
      const hardClipped = lastBottom > clipFloor + 0.5;

      // After the chapter pack plan locks, ignore soft overflow so page turns cannot rewrite totals.
      // Still unlock + shrink on hard clipping past the padding edge.
      if (packPlanRef.current.locked) {
        if (!hardClipped) return;
        const overflowPx = lastBottom - softLimit;
        const usable = Math.max(copyBox.height, 1);
        const ratio = Math.max(0.45, (usable - safetyPx - overflowPx) / usable);
        shrinkPackScale(ratio);
        return;
      }

      if (fitsSoft) {
        const gap = softLimit - lastBottom;
        // One-time tight-fit haircut so denser later pages are less likely to hard-clip.
        if (!packPlanRef.current.safetyApplied && gap < 56) {
          packPlanRef.current.safetyApplied = true;
          layoutRestoreRef.current = true;
          setPagePackScale((scale) => Math.max(0.3, Math.round(scale * 0.97 * 100) / 100));
          return;
        }
        packPlanRef.current.safetyApplied = true;
        packPlanRef.current.locked = true;
        layoutRestoreRef.current = false;
        return;
      }

      const overflowPx = lastBottom - softLimit;
      const usable = Math.max(copyBox.height, 1);
      // Shrink just enough to clear the clip; avoid the old *0.8 overshoot that re-underfilled pages.
      const ratio = Math.max(0.45, (usable - safetyPx - overflowPx) / usable);
      packPlanRef.current.safetyApplied = true;
      shrinkPackScale(ratio);
    }

    function scheduleMeasure() {
      frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          const pendingImages = [...track.querySelectorAll("img.page-image")].filter((img) => !img.complete);
          if (!pendingImages.length) {
            measureOverflow();
            return;
          }
          let remaining = pendingImages.length;
          const onReady = () => {
            remaining -= 1;
            if (remaining > 0 || cancelled) return;
            measureOverflow();
          };
          pendingImages.forEach((img) => {
            img.addEventListener("load", onReady, { once: true });
            img.addEventListener("error", onReady, { once: true });
          });
        });
      });
    }

    scheduleMeasure();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [currentPageParagraphs, pageWidth, pageHeight, pagePackScale, pageTurn]);

  useEffect(() => {
    if (!pageTurn) return undefined;
    const timeout = window.setTimeout(() => setPageTurn(""), 260);
    return () => window.clearTimeout(timeout);
  }, [pageTurn, pageIndex]);
  const progress = book ? Math.round(((chapterIndex + 1) / book.chapters.length) * 100) : 0;
  const visibleBook = activeCategory === "全部" || bookCategories.includes(activeCategory);
  const shelfBooks = useMemo(() => libraryBooks, [libraryBooks]);
  const shelfBookStates = useMemo(() => {
    const states = new Map();
    libraryBooks.forEach((item) => states.set(item.id, getBookShelfState(item)));
    return states;
  }, [libraryBooks, readPages, book?.id, chapterIndex, pageIndex]);
  const visibleShelfBooks = shelfBooks.filter((item) => {
    const matchesType = activeType === "全部类型" || item.bookType === activeType;
    const matchesCategory = activeCategory === "全部" || (item.id === book?.id && bookCategories.includes(activeCategory));
    return matchesType && matchesCategory;
  });
  const shelfSearchText = shelfSearchQuery.trim().toLowerCase();
  const searchedShelfBooks = shelfSearchText
    ? visibleShelfBooks.filter((item) => [item.title, item.creator, item.publisher, item.bookType, localFormatLabel(item)].filter(Boolean).join(" ").toLowerCase().includes(shelfSearchText))
    : visibleShelfBooks;
  const shelfSearchSuggestions = useMemo(() => {
    const typeItems = BOOK_TYPES.map((type) => ({ label: type.name, count: shelfBooks.filter((item) => item.bookType === type.name).length }))
      .filter((item) => item.count > 0)
      .slice(0, 4);
    const categoryItems = categories.map((category) => ({ label: category, count: bookCategories.includes(category) ? 1 : 0 }))
      .filter((item) => item.count > 0)
      .slice(0, 4);
    return [...typeItems, ...categoryItems].slice(0, 6);
  }, [shelfBooks, categories, bookCategories]);
  const shelfLabel = activeType !== "全部类型" ? activeType : activeCategory === "全部" ? "本地书架" : activeCategory;
  const bookMemory = useMemo(
    () => (analysisRecord?.bookMemory
      ? normalizeBookMemory(analysisRecord.bookMemory)
      : bookMemoryFromLegacy({ index: aiIndex, traceMemory: analysisRecord?.traceMemory }, { bookId: book?.id || book?.title || "book" })),
    [analysisRecord?.bookMemory, analysisRecord?.traceMemory, aiIndex, book?.id, book?.title],
  );
  const bookIndex = useMemo(
    () => normalizeReadingIndex(readingIndexFromBookMemory(bookMemory), book),
    [bookMemory],
  );
  const activeTraceProfile = useMemo(() => resolveTraceProfile(bookProfile?.category || book?.bookType, bookProfile?.facets || book?.indexSchema || []), [bookProfile, book?.bookType, book?.indexSchema]);
  const currentEvidenceCursor = {
    chapterIndex,
    paragraphIndex: selectedParagraph ?? (chapter?.paragraphs?.length ? chapter.paragraphs.length - 1 : 0),
  };
  // Search/evidence may use the current open page even before it is marked read on leave.
  const evidenceScopeCursor = laterCursor(getLatestReadCursor(), currentEvidenceCursor);
  const searchResults = useMemo(() => locateEvidence(memoryEvidenceStore, {
    query: searchQuery,
    scopeCursor: evidenceScopeCursor,
    currentCursor: { chapterIndex, paragraphIndex: selectedParagraph ?? 0 },
    traceIndex: bookIndex,
    topK: 12,
    // Reader search must show original-text hits only — never memory/entity/trace-only weak matches.
    requireTextMatch: true,
  }), [memoryEvidenceStore, searchQuery, evidenceScopeCursor?.chapterIndex, evidenceScopeCursor?.paragraphIndex, chapterIndex, selectedParagraph, bookIndex]);

  useEffect(() => {
    let cancelled = false;
    setMemoryEvidenceStore(null);
    if (!book?.chapters?.length) return undefined;
    const timer = window.setTimeout(async () => {
      await yieldToBrowser();
      if (cancelled) return;
      // Build from read-bounded paragraphs even before AI Trace has filled the index.
      const nextStore = buildMemoryEvidenceStore(book, bookIndex);
      if (!cancelled) setMemoryEvidenceStore(nextStore);
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [book?.id, bookIndex]);

  const activeSkillDomain = resolveSkillDomain(book?.bookType, bookCategories);
  const activeSkillConfig = getDomainConfig(activeSkillDomain);
  const activeDomainProgress = domainProgress(readingProgress, activeSkillDomain);
  const activeSpecialSkills = unlockedSpecialSkills(readingProgress, activeSkillDomain);
  useEffect(() => {
    if (screen !== "reader" || !book) return undefined;
    readingStartedAtRef.current = Date.now();
    const interval = window.setInterval(() => settleReadingTime(), 30000);
    return () => {
      window.clearInterval(interval);
      settleReadingTime();
    };
  }, [screen, book?.id]);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function recordProgress(delta) {
    setReadingProgress((current) => {
      const domain = activeSkillDomain;
      const previous = domainProgress(current, domain);
      const nextDomain = {
        seconds: previous.seconds + (delta.seconds || 0),
        pages: previous.pages + (delta.pages || 0),
        xp: previous.xp + (delta.xp || 0),
        evidenceJumps: previous.evidenceJumps + (delta.evidenceJumps || 0),
        bookmarks: previous.bookmarks + (delta.bookmarks || 0),
        notes: previous.notes + (delta.notes || 0),
      };
      return {
        ...current,
        totalSeconds: current.totalSeconds + (delta.seconds || 0),
        totalPages: current.totalPages + (delta.pages || 0),
        globalXp: current.globalXp + (delta.xp || 0),
        evidenceJumps: current.evidenceJumps + (delta.evidenceJumps || 0),
        bookmarks: current.bookmarks + (delta.bookmarks || 0),
        notes: current.notes + (delta.notes || 0),
        domains: { ...current.domains, [domain]: nextDomain },
      };
    });
  }

  function recordRecoveryInteraction(action, card = recoveryCard) {
    if (!book) return;
    const key = `shumai-recovery-metrics:${storageBookIdentity(book)}`;
    const current = loadStored(key, { shown: 0, continued: 0, skipped: 0, evidence: 0, hint: 0, answer: 0, remembered: 0, missed: 0, updatedAt: null });
    const next = {
      ...current,
      [action]: Number(current[action] || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(next));
    updateRecoveryMemoryState(book, card, action);
  }

  function settleReadingTime() {
    if (screen !== "reader" || document.visibilityState !== "visible") return;
    const elapsedSeconds = Math.min(120, Math.floor((Date.now() - readingStartedAtRef.current) / 1000));
    readingStartedAtRef.current = Date.now();
    if (elapsedSeconds < 15) return;
    recordProgress({ seconds: elapsedSeconds, xp: Math.max(1, Math.floor(elapsedSeconds / 60) * 4) });
  }

  function openReader() {
    setScreen("reader");
    setSelectedParagraph(null);
    setDrawerOpen(false);
  }

  function openShelfBook(nextBook) {
    const storageKey = readingPositionStorageKey(nextBook);
    const saved = loadStored(storageKey, { chapterIndex: 0, pageIndex: 0 });
    const lastActivity = loadStored(readingActivityStorageKey(nextBook), null);
    recoveryCardJobRef.current += 1;
    const jobId = recoveryCardJobRef.current;
    const sameBook = book && storageBookIdentity(book) === storageBookIdentity(nextBook);
    const commitReaderOpen = () => {
      if (!sameBook) setBook(nextBook);
      setChapterIndex(Math.min(Math.max(saved.chapterIndex || 0, 0), nextBook.chapters.length - 1));
      setPageIndex(Math.max(saved.pageIndex || 0, 0));
      setScreen("reader");
    };
    if (sameBook) flushSync(commitReaderOpen);
    else commitReaderOpen();
    setActivePanel("目录");
    setSelectedParagraph(null);
    setDrawerOpen(false);
    setRecoveryCard(null);
    scheduleRecoveryCardBuild(nextBook, { ...saved, pageWidth, pageHeight }, lastActivity, jobId);
  }

  function scheduleRecoveryCardBuild(nextBook, saved, lastActivity, jobId) {
    const lastActivityTime = Number(lastActivity || 0);
    if (lastActivityTime && Date.now() - lastActivityTime < RECOVERY_CARD_MIN_ABSENCE_MS) return;

    const run = async () => {
      if (recoveryCardJobRef.current !== jobId) return;
      const storedRecord = hydrateAnalysisRecord(loadStored(analysisStorageKey(nextBook), null), nextBook);
      const memoryState = loadStored(recoveryMemoryStorageKey(nextBook), {});
      const persistedMemory = storedRecord?.bookMemory
        ? normalizeBookMemory(storedRecord.bookMemory)
        : bookMemoryFromLegacy({ index: storedRecord?.index, traceMemory: storedRecord?.traceMemory }, { bookId: nextBook.id || nextBook.title || "book" });
      const cursor = { ...normalizeRecoveryCursor(nextBook, saved), pageWidth: saved.pageWidth, pageHeight: saved.pageHeight };
      const localCard = buildTraceRecoveryCard(nextBook, persistedMemory, cursor, lastActivity, persistedMemory, memoryState)
        || buildRecoveryCard(nextBook, [], cursor, lastActivity, memoryState);
      if (recoveryCardJobRef.current !== jobId) return;
      if (localCard) setRecoveryCard(localCard);
      else if (storedRecord?.recoveryCard) setRecoveryCard(normalizeRecoveryCard(storedRecord.recoveryCard, null));

      if (!hasBookMemoryContent(persistedMemory) && !(storedRecord?.index && Object.keys(storedRecord.index).length)) {
        return;
      }

      const indexForEvidence = normalizeReadingIndex(storedRecord?.index || readingIndexFromBookMemory(persistedMemory), nextBook);
      const evidenceStore = buildMemoryEvidenceStore(nextBook, indexForEvidence);
      const candidateQuery = [
        nextBook.title,
        nextBook.creator,
        storedRecord?.profile?.category || nextBook.bookType,
        ...(persistedMemory.entities || []).slice(0, 12).map((item) => item.name),
        ...(persistedMemory.episodic || []).slice(0, 6).map((item) => item.name || item.title),
      ].filter(Boolean).join(" ");
      const supportingEvidence = locateEvidence(evidenceStore, {
        query: candidateQuery,
        scopeCursor: cursor,
        currentCursor: cursor,
        traceIndex: indexForEvidence,
        topK: 12,
      }).map((item) => ({
        cite: item.cite,
        chapterIndex: item.chapterIndex,
        paragraphIndex: item.paragraphIndex,
        chapterTitle: item.chapterTitle,
        quote: item.cite?.quote || item.excerpt,
        score: Number(item.score.toFixed(3)),
        matchSources: item.matchSources,
      }));

      if (recoveryCardJobRef.current !== jobId) return;
      setTraceJob({ status: "running", message: "正在准备续读恢复…" });
      const modelCard = await requestModelRecoveryCard({
        targetBook: nextBook,
        cursor,
        traceProfile: storedRecord?.traceProfile || resolveTraceProfile(storedRecord?.profile?.category || nextBook.bookType, storedRecord?.profile?.facets || nextBook.indexSchema || []),
        bookMemory: persistedMemory,
        traceMemory: storedRecord?.traceMemory || compatibilityTraceMemory(persistedMemory),
        supportingEvidence,
        currentChapters: getRecoveryCurrentChapters(nextBook, cursor),
        memoryState,
        lastActivity,
        localFallback: localCard || normalizeRecoveryCard(storedRecord?.recoveryCard, null),
      });
      if (recoveryCardJobRef.current !== jobId) return;
      if (modelCard) {
        setRecoveryCard(modelCard);
        const nextRecord = {
          ...(storedRecord || {}),
          bookMemory: persistedMemory,
          index: indexForEvidence,
          profile: storedRecord?.profile || null,
          traceProfile: storedRecord?.traceProfile || null,
          traceMemory: storedRecord?.traceMemory || compatibilityTraceMemory(persistedMemory),
          recoveryCard: modelCard,
          summary: storedRecord?.summary || null,
          cursor: storedRecord?.cursor || cursor,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(analysisStorageKey(nextBook), JSON.stringify(nextRecord));
        if (storageBookIdentity(book) === storageBookIdentity(nextBook)) {
          setAnalysisRecord(nextRecord);
        }
        setTraceJob({ status: "done", message: "续读恢复已就绪" });
      } else {
        setTraceJob({ status: "done", message: localCard ? "已使用本地恢复材料" : "暂无续读恢复材料" });
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => { void run(); }, { timeout: 1800 });
      return;
    }
    window.setTimeout(() => { void run(); }, 600);
  }

  function selectParagraph(index) {
    if (window.getSelection()?.toString().trim()) return;
    setSelectedParagraph(index);
  }

  function selectChapter(index) {
    layoutRestoreRef.current = false;
    markCurrentPageRead();
    setChapterIndex(index);
    setPageIndex(0);
    setSelectedParagraph(null);
    setDrawerOpen(false);
  }

  function turnPage(direction) {
    layoutRestoreRef.current = false;
    markCurrentPageRead();
    setPageTurn(direction > 0 ? "next" : "previous");
    setSelectedParagraph(null);
    setSelectionBloom(null);
    setDrawerOpen(false);

    if (direction > 0) {
      if (pageIndex < pageCount - 1) {
        setPageIndex(pageIndex + 1);
        return;
      }
      if (chapterIndex < book.chapters.length - 1) {
        setChapterIndex(chapterIndex + 1);
        setPageIndex(0);
      }
      return;
    }

    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
      return;
    }
    if (chapterIndex > 0) {
      const previousChapter = book.chapters[chapterIndex - 1];
      const previousPageCount = Math.max(1, paginateChapterWindow(previousChapter, 0, pageWidth, pageHeight, pagePackScale).pageCount);
      setChapterIndex(chapterIndex - 1);
      setPageIndex(previousPageCount - 1);
    }
  }

  function openCurrentRecoveryCard() {
    if (!hasPriorReadingContext) {
      showNotice("还没有前文可回忆");
      return;
    }
    const cursor = { ...getReadCursor(), pageWidth, pageHeight };
    const memoryState = loadStored(recoveryMemoryStorageKey(book), {});
    const card = buildTraceRecoveryCard(book, bookMemory, cursor, null, bookMemory, memoryState) || buildRecoveryCard(book, [], cursor, null, memoryState) || buildRecoveryCard(book, readPages, cursor, null, memoryState);
    if (!card) {
      showNotice("当前页之前还没有足够内容可回忆");
      return;
    }
    setRecoveryCard(card);
  }

  function openSearchResult(result) {
    layoutRestoreRef.current = false;
    setChapterIndex(result.chapterIndex);
    setPageIndex(findPageForParagraphInChapter(book.chapters[result.chapterIndex], result.paragraphIndex, pageWidth, pageHeight, pagePackScale));
    setSelectedParagraph(result.paragraphIndex);
    setDrawerOpen(false);
    setSearchOpen(false);
    showNotice(`已定位到《${book.title}》· ${result.chapterTitle}`);
  }

  function jumpToParagraph(index) {
    layoutRestoreRef.current = false;
    setPageIndex(findPageForParagraphInChapter(chapter, index, pageWidth, pageHeight, pagePackScale));
    setSelectedParagraph(index);
    setDrawerOpen(false);
    showNotice(`已回到本章第 ${index + 1} 段`);
  }

  function goToParagraph(index) {
    setPageIndex(findPageForParagraphInChapter(chapter, index, pageWidth, pageHeight, pagePackScale));
  }

  function openRelationshipEvidence(relationship) {
    recordProgress({ evidenceJumps: 1, xp: 1 });
    const evidence = relationship.evidence;
    setChapterIndex(evidence.chapterIndex);
    setPageIndex(0);
    setSelectedParagraph(evidence.paragraphIndex);
    setDrawerOpen(false);
    window.setTimeout(() => goToParagraph(evidence.paragraphIndex), 30);
    showNotice(`已定位到“${relationship.relation}”的原文证据`);
  }

  function addCategory(event) {
    event.preventDefault();
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setCategories((items) => [...items, trimmed]);
    setBookCategories((items) => [...items, trimmed]);
    setNewCategory("");
  }

  function toggleBookCategory(category) {
    setBookCategories((items) => items.includes(category) ? items.filter((item) => item !== category) : [...items, category]);
  }

  async function importBook(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;

    const unsupported = files.filter((file) => !READABLE_IMPORT_FORMATS.has(getFileExtension(file)));
    const readableFiles = files.filter((file) => READABLE_IMPORT_FORMATS.has(getFileExtension(file)));
    if (!readableFiles.length) {
      const label = unsupported.length === 1
        ? PLANNED_BOOK_FORMATS.get(unsupported[0].name.split(".").pop()?.toLowerCase() || "") || unsupported[0].name.split(".").pop()?.toUpperCase() || "该格式"
        : "这些格式";
      showNotice(`${label} 导入解析待接入；当前可直接阅读 EPUB 和 PDF`);
      event.target.value = "";
      return;
    }

    setImportStatus({ total: readableFiles.length, current: 0, title: "", stage: "准备导入", classified: 0, failed: 0 });
    setLoadError("");
    try {
      const existingFingerprints = new Set(libraryBooks.map((item) => item.fingerprint).filter(Boolean));
      const importedBooks = [];
      const upgradedBooks = [];
      const duplicateBooks = [];
      let duplicateCount = 0;
      let upgradedCount = 0;
      let failedCount = 0;
      let classifiedCount = 0;
      let firstFailureMessage = "";

      for (const [fileIndex, file] of readableFiles.entries()) {
        try {
          setImportStatus((status) => ({ ...status, current: fileIndex + 1, title: file.name, stage: "解析书籍结构" }));
          const parsed = await parseImportedBook(file);
          const fingerprint = createBookFingerprint(parsed, file);
          const existingBook = libraryBooks.find((item) => item.fingerprint === fingerprint)
            || upgradedBooks.find((item) => item.fingerprint === fingerprint);
          if (existingFingerprints.has(fingerprint) && existingBook) {
            if (needsEpubContentReparse(existingBook) && getFileExtension(file) === "epub") {
              setImportStatus((status) => ({ ...status, title: parsed.title || file.name, stage: "升级插图解析" }));
              const upgraded = {
                ...existingBook,
                ...parsed,
                id: existingBook.id,
                fingerprint: existingBook.fingerprint,
                fileName: file.name,
                cover: parsed.cover || existingBook.cover || "",
                bookType: existingBook.bookType || "",
                indexSchema: existingBook.indexSchema || [],
                local: false,
                format: "EPUB",
                contentParseVersion: EPUB_CONTENT_PARSE_VERSION,
              };
              upgradedBooks.push(upgraded);
              upgradedCount += 1;
              continue;
            }
            duplicateCount += 1;
            duplicateBooks.push(existingBook);
            continue;
          }
          existingFingerprints.add(fingerprint);
          setImportStatus((status) => ({ ...status, title: parsed.title || file.name, stage: "调用大模型识别类型" }));
          const classification = await classifyImportedBook(parsed);
          if (classification) classifiedCount += 1;
          const profile = classification?.profile;
          const extension = getFileExtension(file);
          importedBooks.push({
            ...parsed,
            id: `import:${fingerprint}`,
            fingerprint,
            fileName: file.name,
            cover: parsed.cover || "",
            bookType: profile?.category || "",
            indexSchema: profile?.facets || [],
            local: false,
            format: extension === "pdf" ? "PDF" : "EPUB",
            ...(extension === "epub" ? { contentParseVersion: EPUB_CONTENT_PARSE_VERSION } : {}),
          });
          setImportStatus((status) => ({ ...status, classified: classifiedCount, stage: classification ? "完成分类" : "分类跳过，保留待识别" }));
        } catch (error) {
          failedCount += 1;
          if (!firstFailureMessage) firstFailureMessage = error?.message || `${file.name} 导入失败`;
          setImportStatus((status) => ({ ...status, failed: failedCount, stage: "这本导入失败，继续下一本" }));
        }
      }

      const shelfUpdates = [...importedBooks, ...upgradedBooks];
      if (shelfUpdates.length) {
        await Promise.all(shelfUpdates.map((item) => saveStoredLibraryBook(item)));
        setLibraryBooks((items) => {
          const upgradedIds = new Set(upgradedBooks.map((item) => item.id));
          const withoutUpgraded = items.filter((item) => !upgradedIds.has(item.id));
          return [...withoutUpgraded, ...importedBooks, ...upgradedBooks];
        });
        const latest = shelfUpdates[shelfUpdates.length - 1];
        setBook(latest);
        setBookCategories([categories[0]].filter(Boolean));
        setActiveCategory("全部");
        setActiveType("全部类型");
        setChapterIndex(0);
        setPageIndex(0);
        setScreen("shelf");
      } else if (duplicateBooks.length) {
        const existing = duplicateBooks[duplicateBooks.length - 1];
        setBook(existing);
        setActiveCategory("全部");
        setActiveType("全部类型");
        setScreen("shelf");
      }

      const messages = [];
      if (importedBooks.length) messages.push(`已导入 ${importedBooks.length} 本书`);
      if (upgradedCount) messages.push(`已升级 ${upgradedCount} 本插图解析`);
      if (classifiedCount) messages.push(`已识别 ${classifiedCount} 本类型`);
      if (duplicateCount) messages.push(`${duplicateCount} 本已在书架中`);
      if (unsupported.length) messages.push(`${unsupported.length} 个暂不支持的文件已跳过`);
      if (failedCount) messages.push(`${failedCount} 本导入失败`);
      if (!shelfUpdates.length && failedCount && firstFailureMessage) messages.push(firstFailureMessage);
      showNotice(messages.join("，") || "没有可导入的书籍");
    } catch (error) {
      setLoadError(error.message || "导入失败，请检查书籍文件");
    } finally {
      setImportStatus(null);
      event.target.value = "";
    }
  }

  async function classifyImportedBook(parsed) {
    try {
      const response = await fetch("/api/classify-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: analysisSettings.provider,
          model: analysisSettings.model,
          book: createClassificationPayload(parsed),
        }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function parseImportedBook(file) {
    const extension = getFileExtension(file);
    if (extension === "pdf") {
      const { parsePdf } = await import("./pdf.js");
      return parsePdf(file);
    }
    return parseEpubInWorker(file);
  }

  function requestDeleteBook(targetBook) {
    if (targetBook.local) {
      showNotice("内置示例书不能删除");
      return;
    }
    setDeleteCandidate(targetBook);
  }

  async function confirmDeleteBook() {
    if (!deleteCandidate) return;
    const nextBooks = libraryBooks.filter((item) => item.id !== deleteCandidate.id);
    try {
      await deleteStoredLibraryBook(deleteCandidate.id);
    } catch {
      showNotice("本地书库删除失败，请稍后重试");
      return;
    }
    setLibraryBooks(nextBooks);
    if (book?.id === deleteCandidate.id) {
      const fallbackBook = nextBooks[0] || null;
      setBook(fallbackBook);
      setChapterIndex(0);
      setPageIndex(0);
      setSelectedParagraph(null);
      setDrawerOpen(false);
      setScreen("shelf");
    }
    setDeleteCandidate(null);
    showNotice(`已删除《${deleteCandidate.title}》`);
  }

  async function analyzeBook(scope = "read", isAutomatic = false) {
    const cursor = scope === "full" ? getFullBookCursor(book) : getLatestReadCursor();
    if (!cursor && scope === "read") {
      setAnalysisState({ status: "idle", message: "请先完整读完至少一页，再进行分析" });
      setTraceJob({ status: "idle", message: "等待已读页" });
      return;
    }
    const newChapters = scope === "full" ? getFullBookContent(book.chapters) : getNewReadingContent(book.chapters, analysisRecord?.cursor, cursor);
    if (!newChapters.length) {
      setAnalysisState({ status: "done", message: "当前阅读位置没有新增内容可分析" });
      setTraceJob({ status: "done", message: "没有新增已读内容" });
      if (!isAutomatic && analysisRecord?.summary) {
        showNotice("阅读记忆已更新");
      }
      return;
    }
    const traceProfile = traceProfileForPrompt(activeTraceProfile);
    setTraceJob({ status: "running", message: "正在抽取候选锚点" });
    setAnalysisState({ status: "loading", message: "AI Trace 正在整理已读内容…" });
    try {
      await yieldToBrowser();
      const candidates = await buildMemoryCandidatesAsync(newChapters, traceProfile, (count) => {
        setTraceJob({ status: "running", message: `已整理候选锚点 ${count} 个` });
      });
      setTraceJob({ status: "running", message: `候选锚点 ${candidates.length} 个，正在检索证据` });
      const candidateQuery = [
        book.title,
        book.creator,
        traceProfile.category,
        ...candidates.slice(0, 18).map((item) => item.name),
        ...newChapters
          .flatMap((chapter) => (chapter.paragraphs || []).slice(0, 2).map((item) => typeof item === "object" ? item.text : item))
          .slice(0, 6),
      ].filter(Boolean).join(" ");
      await yieldToBrowser();
      const supportingEvidence = locateEvidence(memoryEvidenceStore, {
        query: candidateQuery,
        scopeCursor: cursor,
        currentCursor: cursor,
        traceIndex: bookIndex,
        topK: scope === "full" ? 18 : 12,
      }).map((item) => ({
        cite: item.cite,
        chapterIndex: item.chapterIndex,
        paragraphIndex: item.paragraphIndex,
        chapterTitle: item.chapterTitle,
        quote: item.cite?.quote || item.excerpt,
        score: Number(item.score.toFixed(3)),
        matchSources: item.matchSources,
      }));
      setTraceJob({ status: "running", message: "正在让模型判断主线相关性" });
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: analysisSettings.provider,
          model: analysisSettings.model,
          scope,
          previousBookMemory: scope === "full" ? null : analysisRecord?.bookMemory || null,
          previousIndex: scope === "full" ? null : analysisRecord?.index,
          previousTraceMemory: scope === "full" ? null : analysisRecord?.traceMemory,
          cursor,
          traceProfile,
          candidates,
          supportingEvidence,
          book: {
            id: book.id,
            title: book.title,
            creator: book.creator,
            bookType: bookProfile?.category || book.bookType,
            indexSchema: bookProfile?.facets || book.indexSchema,
            chapters: newChapters,
          },
        }),
      });
      await yieldToBrowser();
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "分析服务暂不可用");
      const nextBookMemory = normalizeBookMemory(result.bookMemory || {
        index: result.index,
        traceMemory: result.traceMemory,
        cursor,
        profile: result.profile,
        traceProfile: result.traceProfile || traceProfile,
      }, {
        bookId: book.id || book.title || "book",
        cursor,
        profile: result.profile,
        traceProfile: result.traceProfile || traceProfile,
        supportingEvidence,
      });
      const nextIndex = normalizeReadingIndex(result.index || readingIndexFromBookMemory(nextBookMemory), book);
      setAiIndex(nextIndex);
      setBookProfile(result.profile);
      setBook((current) => current ? { ...current, bookType: result.profile.category, indexSchema: result.profile.facets } : current);
      setLibraryBooks((items) => items.map((item) => item.id === book.id ? { ...item, bookType: result.profile.category, indexSchema: result.profile.facets } : item));
      let nextRecoveryCard = null;
      setTraceJob({ status: "running", message: "正在生成续读恢复卡" });
      nextRecoveryCard = await requestModelRecoveryCard({
        targetBook: book,
        cursor,
        traceProfile: result.traceProfile || traceProfile,
        bookMemory: nextBookMemory,
        supportingEvidence,
        currentChapters: newChapters,
      });
      const record = {
        bookMemory: nextBookMemory,
        index: nextIndex,
        profile: result.profile,
        traceProfile: result.traceProfile || traceProfile,
        traceMemory: result.traceMemory || compatibilityTraceMemory(nextBookMemory),
        recoveryCard: nextRecoveryCard,
        summary: normalizeAnalysisSummary(result.summary),
        cursor,
        updatedAt: new Date().toISOString(),
      };
      setAnalysisRecord(record);
      localStorage.setItem(analysisStorageKey(book), JSON.stringify(record));
      if (nextRecoveryCard && !isAutomatic) setRecoveryCard(nextRecoveryCard);
      setAnalysisState({ status: "done", message: `已由 ${result.model} 更新续读恢复材料` });
      setTraceJob({ status: "done", message: `恢复材料已更新到第 ${cursor.pageIndex + 1} 页` });
      showNotice(isAutomatic ? "已根据新增已读内容自动准备恢复材料" : "续读恢复材料已更新");
    } catch (error) {
      setAnalysisState({ status: "error", message: error.message || "大模型分析失败" });
      setTraceJob({ status: "error", message: error.message || "AI Trace 失败" });
    }
  }

  async function requestModelRecoveryCard({
    targetBook = book,
    cursor,
    traceProfile,
    bookMemory,
    traceMemory,
    supportingEvidence,
    currentChapters,
    memoryState = {},
    lastActivity = null,
    localFallback = null,
  }) {
    const fallback = localFallback
      || buildTraceRecoveryCard(targetBook, bookMemory || {}, cursor, lastActivity, bookMemory, memoryState)
      || buildRecoveryCard(targetBook, targetBook === book ? readPages : [], cursor, lastActivity, memoryState);
    if (!supportingEvidence?.length) return fallback;
    try {
      const response = await fetch("/api/recovery-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: analysisSettings.provider,
          model: RECOVERY_MODEL_BY_PROVIDER[analysisSettings.provider] || RECOVERY_MODEL_BY_PROVIDER.deepseek,
          thinking: analysisSettings.provider === "deepseek",
          book: {
            id: targetBook.id,
            title: targetBook.title,
            creator: targetBook.creator,
            bookType: targetBook.bookType || bookProfile?.category || book?.bookType,
          },
          cursor,
          traceProfile,
          bookMemory: bookMemory || null,
          traceMemory: traceMemory || (bookMemory ? compatibilityTraceMemory(bookMemory) : null),
          evidence: supportingEvidence,
          currentText: flattenRecoverySource(currentChapters).slice(-10),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Recovery card failed");
      return normalizeRecoveryCard(result.card, fallback) || fallback;
    } catch (error) {
      console.warn("Recovery card fallback:", error);
      return fallback;
    }
  }

  function getReadCursor() {
    const page = currentPageParagraphs || [];
    const paragraphIndices = page.map((item) => item.paragraphIndex).filter(Number.isInteger);
    return { chapterIndex, paragraphIndex: paragraphIndices.length ? Math.max(...paragraphIndices) : 0, pageIndex: visiblePageIndex, pageCount };
  }

  function closeDrawerOnBlank(event) {
    setSelectionBloom(null);
    const target = event.target;
    if (target === event.currentTarget || target.classList.contains("page-track")) {
      setSelectedParagraph(null);
    }
  }

  function openSelectionBloom() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const paragraphElement = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer.closest?.("p[id^='paragraph-']")
      : range.commonAncestorContainer?.parentElement?.closest?.("p[id^='paragraph-']");
    const paragraphId = paragraphElement?.id?.replace("paragraph-", "");
    const paragraphIndexFromSelection = Number(paragraphId);
    if (Number.isInteger(paragraphIndexFromSelection)) setSelectedParagraph(paragraphIndexFromSelection);
    let startOffset = null;
    let endOffset = null;
    const paragraphIndex = Number.isInteger(paragraphIndexFromSelection)
      ? paragraphIndexFromSelection
      : (selectedParagraph ?? null);
    if (Number.isInteger(paragraphIndex)) {
      const fullText = paragraphPlainText(chapter?.paragraphs?.[paragraphIndex] || "").trim();
      const found = fullText.indexOf(text);
      if (found >= 0) {
        startOffset = found;
        endOffset = found + text.length;
      } else if (paragraphElement) {
        try {
          const pre = range.cloneRange();
          pre.selectNodeContents(paragraphElement);
          pre.setEnd(range.startContainer, range.startOffset);
          const localStart = pre.toString().length;
          const pageItem = currentPageParagraphs.find((item) => item.paragraphIndex === paragraphIndex);
          const segmentStart = pageItem
            ? Math.max(0, fullText.indexOf(pageItem.text))
            : 0;
          startOffset = segmentStart + localStart;
          endOffset = startOffset + text.length;
        } catch {
          startOffset = null;
          endOffset = null;
        }
      }
    }
    const horizontalPadding = 190;
    const x = Math.min(Math.max(rect.left + rect.width / 2, horizontalPadding), window.innerWidth - horizontalPadding);
    const canFloatAbove = rect.top > 84;
    const y = canFloatAbove ? rect.top - 18 : Math.min(rect.bottom + 58, window.innerHeight - 76);
    setSelectionBloom({
      text: text.length > 20 ? `${text.slice(0, 20)}…` : text,
      fullText: text,
      x,
      y,
      placement: canFloatAbove ? "above" : "below",
      chapterIndex,
      pageIndex,
      paragraphIndex: Number.isInteger(paragraphIndex) ? paragraphIndex : null,
      startOffset,
      endOffset,
    });
  }

  function handleBloomAction(action) {
    if (action === "delete") {
      const bloom = selectionBloom;
      const matches = findExplainsForSelection(explains, {
        chapterIndex: Number.isInteger(bloom?.chapterIndex) ? bloom.chapterIndex : chapterIndex,
        paragraphIndex: Number.isInteger(bloom?.paragraphIndex) ? bloom.paragraphIndex : selectedParagraph,
        selection: bloom?.fullText || "",
        startOffset: bloom?.startOffset ?? null,
        endOffset: bloom?.endOffset ?? null,
      });
      if (matches.length) {
        deletePersistedExplain(matches.map((item) => item.id));
      }
      setSelectionBloom(null);
      return;
    }
    if (action === "note") {
      const bloom = selectionBloom;
      if (!bloom?.fullText) {
        showNotice("请先选中要记笔记的文字");
        return;
      }
      setNoteContext({
        selection: bloom.fullText,
        chapterIndex: Number.isInteger(bloom.chapterIndex) ? bloom.chapterIndex : chapterIndex,
        pageIndex: Number.isInteger(bloom.pageIndex) ? bloom.pageIndex : pageIndex,
        chapterTitle: chapter?.title || "",
        paragraphIndex: Number.isInteger(bloom.paragraphIndex) ? bloom.paragraphIndex : selectedParagraph,
        startOffset: Number.isInteger(bloom.startOffset) ? bloom.startOffset : null,
        endOffset: Number.isInteger(bloom.endOffset) ? bloom.endOffset : null,
      });
      setNoteDraft("");
      setNoteComposerOpen(true);
      setSelectionBloom(null);
      return;
    }
    if (action === "source") {
      const cites = selectedParagraph !== null ? locateEvidence(memoryEvidenceStore, {
        selectedText: selectionBloom?.fullText || paragraphPlainText(chapter.paragraphs[selectedParagraph]) || "",
        scopeCursor: evidenceScopeCursor,
        currentCursor: { chapterIndex, paragraphIndex: selectedParagraph },
        traceIndex: bookIndex,
        topK: 5,
      }) : [];
      const best = cites[0];
      if (best) {
        openSearchResult(best);
        showNotice("已跳转到相关出处");
      } else {
        setSearchQuery((selectionBloom?.fullText || "").slice(0, 40));
        setSearchOpen(true);
        showNotice("暂无直接出处，可搜索相关原文");
      }
    } else if (action === "relation") {
      if (!contextRelationships.length) {
        showNotice("当前页附近还没有可靠关系证据");
        setSelectionBloom(null);
        return;
      }
      setActivePanel("目录");
      setSidebarCollapsed(false);
      setRelationshipOpen(true);
      showNotice("已打开上下文关系");
    } else if (action === "recall") {
      openCurrentRecoveryCard();
    } else if (action === "question") {
      const text = selectionBloom?.fullText || "";
      const paragraphIndex = Number.isInteger(selectionBloom?.paragraphIndex)
        ? selectionBloom.paragraphIndex
        : selectedParagraph;
      const cites = paragraphIndex !== null && paragraphIndex !== undefined ? locateEvidence(memoryEvidenceStore, {
        selectedText: text || paragraphPlainText(chapter.paragraphs[paragraphIndex]) || "",
        scopeCursor: evidenceScopeCursor,
        currentCursor: { chapterIndex, paragraphIndex },
        traceIndex: bookIndex,
        topK: 4,
      }).slice(0, 4) : [];
      if (Number.isInteger(paragraphIndex)) {
        readingAnchorRef.current = {
          paragraphIndex,
          charOffset: Math.max(0, Number(selectionBloom?.startOffset) || 0),
        };
      }
      setSelectionAssist({
        text,
        mode: defaultExplainMode(text, bookProfile?.category || book?.bookType),
        cites,
        chapterIndex,
        pageIndex,
        paragraphIndex: Number.isInteger(paragraphIndex) ? paragraphIndex : 0,
        startOffset: selectionBloom?.startOffset ?? null,
        endOffset: selectionBloom?.endOffset ?? null,
      });
      setActivePanel("解惑");
      setSidebarCollapsed(false);
      setRelationshipOpen(false);
      showNotice("已打开选文解惑");
    } else if (action === "favorite") {
      toggleBookmark();
    }
    setSelectionBloom(null);
  }

  function persistSelectionExplain(payload) {
    if (!book || !payload?.selection) return;
    setExplains((current) => upsertExplain(current, {
      ...payload,
      bookId: book.id || book.title,
    }, book));
  }

  function openExplainFromMarker(records, preferred = null) {
    const record = preferred || records?.[0];
    if (!record) return;
    setExplainPreview(null);
    if (record.explainSpeed === "fast" || record.explainSpeed === "deep") {
      setAnalysisSettings((current) => ({
        ...current,
        explainSpeed: record.explainSpeed,
      }));
    }
    if (Number.isInteger(record.paragraphIndex)) {
      readingAnchorRef.current = {
        paragraphIndex: record.paragraphIndex,
        charOffset: Math.max(0, Number(record.startOffset) || 0),
      };
    }
    setSelectionAssist(buildAssistFromExplain(record));
    setSelectedParagraph(record.paragraphIndex);
    setActivePanel("解惑");
    setSidebarCollapsed(false);
    setRelationshipOpen(false);
  }

  function deletePersistedExplain(idOrIds) {
    if (!book) return;
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).map(String).filter(Boolean);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const closingOpenAssist = idSet.has(String(selectionAssist?.fromExplainId || ""));
    setExplains((current) => removeExplains(current, ids, book));
    setExplainPreview((preview) => {
      if (!preview?.records?.length) return null;
      const remaining = preview.records.filter((item) => !idSet.has(String(item.id)));
      if (!remaining.length) return null;
      const primary = remaining.find((item) => String(item.id) === String(preview.primary?.id)) || remaining[0];
      return { ...preview, records: remaining, primary };
    });
    if (closingOpenAssist) {
      setSelectionAssist(null);
      setActivePanel("目录");
    }
    showNotice("已删除解惑标注");
  }

  function scheduleExplainPreview(event, group) {
    const rect = event.currentTarget.getBoundingClientRect();
    const records = group.records || [];
    const primary = records[0];
    window.clearTimeout(scheduleExplainPreview.timer);
    scheduleExplainPreview.timer = window.setTimeout(() => {
      setExplainPreview({
        x: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
        y: Math.max(72, rect.top - 10),
        records,
        primary,
      });
    }, 500);
  }

  function clearExplainPreviewSoon() {
    window.clearTimeout(scheduleExplainPreview.timer);
    window.clearTimeout(clearExplainPreviewSoon.timer);
    clearExplainPreviewSoon.timer = window.setTimeout(() => setExplainPreview(null), 120);
  }

  function toggleReaderPanel(panel) {
    if (activePanel === panel && !sidebarCollapsed) {
      setSidebarCollapsed(true);
      return;
    }
    setActivePanel(panel);
    setSidebarCollapsed(false);
  }

  function closeNoteComposer() {
    setNoteComposerOpen(false);
    setNoteDraft("");
    setNoteContext(null);
  }

  function saveNote() {
    const content = noteDraft.trim();
    const context = noteContext;
    if (!content || !context?.selection || !book) return;
    const note = {
      id: `${Date.now()}`,
      chapterIndex: Number.isInteger(context.chapterIndex) ? context.chapterIndex : chapterIndex,
      pageIndex: Number.isInteger(context.pageIndex) ? context.pageIndex : pageIndex,
      chapterTitle: context.chapterTitle || chapter?.title || "",
      paragraphIndex: Number.isInteger(context.paragraphIndex) ? context.paragraphIndex : null,
      startOffset: Number.isInteger(context.startOffset) ? context.startOffset : null,
      endOffset: Number.isInteger(context.endOffset) ? context.endOffset : null,
      selection: context.selection,
      content,
      createdAt: Date.now(),
    };
    setNotes((items) => {
      const next = [...items, note];
      localStorage.setItem(notesStorageKey(book), JSON.stringify(next));
      return next;
    });
    closeNoteComposer();
    setActivePanel("笔记");
    setSidebarCollapsed(false);
    recordProgress({ notes: 1, xp: 5 });
    showNotice("笔记已保存");
  }

  function openNote(note) {
    markCurrentPageRead();
    setChapterIndex(note.chapterIndex);
    if (Number.isInteger(note.paragraphIndex) && book?.chapters?.[note.chapterIndex]) {
      const targetPage = findPageForParagraphInChapter(
        book.chapters[note.chapterIndex],
        note.paragraphIndex,
        pageWidth,
        pageHeight,
        pagePackScale,
        Number.isInteger(note.startOffset) ? note.startOffset : 0,
      );
      setPageIndex(Number.isInteger(targetPage) ? targetPage : note.pageIndex);
      setSelectedParagraph(note.paragraphIndex);
      readingAnchorRef.current = {
        paragraphIndex: note.paragraphIndex,
        charOffset: Math.max(0, Number(note.startOffset) || 0),
      };
    } else {
      setPageIndex(note.pageIndex);
      setSelectedParagraph(null);
    }
    setDrawerOpen(false);
    showNotice(`已跳转到笔记 · ${note.chapterTitle}`);
  }

  function removeNote(id) {
    setNotes((items) => {
      const next = items.filter((item) => item.id !== id);
      localStorage.setItem(notesStorageKey(book), JSON.stringify(next));
      return next;
    });
  }

  function markCurrentPageRead() {
    if (!book || screen !== "reader") return;
    settleReadingTime();
    const cursor = getReadCursor();
    const pageId = `${cursor.chapterIndex}:${cursor.pageIndex}`;
    localStorage.setItem(readingActivityStorageKey(book), JSON.stringify(Date.now()));
    const wasRead = readPages.some((page) => `${page.chapterIndex}:${page.pageIndex}` === pageId);
    if (!wasRead) recordProgress({ pages: 1, xp: 8 });
    setReadPages((pages) => {
      const next = [...pages.filter((page) => `${page.chapterIndex}:${page.pageIndex}` !== pageId), cursor];
      localStorage.setItem(readPagesStorageKey(book), JSON.stringify(next));
      return next;
    });
  }

  function getLatestReadCursor() {
    if (!readPages.length) return null;
    return [...readPages].sort((left, right) => right.chapterIndex - left.chapterIndex || right.pageIndex - left.pageIndex || right.paragraphIndex - left.paragraphIndex)[0];
  }

  function isPageRead(targetChapterIndex, targetPageIndex) {
    return readPages.some((page) => page.chapterIndex === targetChapterIndex && page.pageIndex === targetPageIndex);
  }

  function toggleBookmark() {
    const id = `${chapterIndex}:${pageIndex}`;
    setBookmarks((items) => {
      const exists = items.some((item) => item.id === id);
      const next = exists
        ? items.filter((item) => item.id !== id)
        : [...items, { id, chapterIndex, pageIndex, chapterTitle: chapter.title, excerpt: paragraphPlainText(chapter.paragraphs[0]).slice(0, 46) || (isImageParagraph(chapter.paragraphs[0]) ? "插图" : ""), createdAt: Date.now() }];
      localStorage.setItem(bookmarkStorageKey(book), JSON.stringify(next));
      if (!exists) recordProgress({ bookmarks: 1, xp: 2 });
      showNotice(exists ? "已取消书签" : "已添加书签");
      return next;
    });
  }

  function openBookmark(item) {
    markCurrentPageRead();
    setChapterIndex(item.chapterIndex);
    setPageIndex(item.pageIndex);
    setSelectedParagraph(null);
    setDrawerOpen(false);
    showNotice(`已跳转到书签 · ${item.chapterTitle}`);
  }

  function removeBookmark(id) {
    setBookmarks((items) => {
      const next = items.filter((item) => item.id !== id);
      localStorage.setItem(bookmarkStorageKey(book), JSON.stringify(next));
      return next;
    });
  }

  if (loadError && !book && !libraryBooks.length && screen !== "shelf") {
    return <main className="loading-screen"><div className="loader-mark"><FileText size={26} /></div><strong>无法打开这本书</strong><span>{loadError}</span><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> 选择书籍文件</button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></main>;
  }

  if (!book && screen !== "shelf") {
    return <main className="loading-screen"><div className="loader-mark"><BookOpen size={26} /></div><strong>书架还没有可阅读的书</strong><span>请先导入一本 EPUB 或 PDF。</span><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> 导入书籍</button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></main>;
  }

  if (screen === "skills") {
    return <SkillTreeScreen book={book} config={activeSkillConfig} domain={activeSkillDomain} progress={readingProgress} domainProgress={activeDomainProgress} onBack={() => setScreen("shelf")} />;
  }

  if (screen === "shelf") {
    return (
      <main className={typeBrowserExpanded ? "library-shell panel-open" : "library-shell"}>
        <header className="library-topbar">
          <div className="brand" title={`${APP_NAME} · ${APP_SLOGAN}`} aria-label={`${APP_NAME}，${APP_SLOGAN}`}><BrandMark size={24} /><span className="sr-only">{APP_NAME}</span></div>
          <label className={shelfSearchOpen ? "library-search active" : "library-search"} role="search" aria-label="搜索书架" title="搜索书架"><Search size={18} /><input value={shelfSearchQuery} placeholder="搜索" onFocus={() => setShelfSearchOpen(true)} onChange={(event) => { setShelfSearchQuery(event.target.value); setShelfSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setShelfSearchOpen(false); }} /><button type="button" title="图片搜索" aria-label="图片搜索"><Camera size={22} /></button></label>
          <div className="library-actions"><button className="text-action" title="管理分类" aria-label="管理分类" onClick={() => setCategoryModalOpen(true)}><Tag size={16} /><span>管理分类</span></button><button className="primary-button" title={importStatus ? "正在导入" : "导入书籍"} aria-label={importStatus ? "正在导入" : "导入书籍"} disabled={Boolean(importStatus)} onClick={() => inputRef.current?.click()}><Upload size={16} /><span>{importStatus ? "正在导入" : "导入书籍"}</span></button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></div>
        </header>
        <aside className="library-sidebar">
          <div className="library-nav-title">我的书架</div>
          <button className={activeCategory === "全部" ? "library-nav active" : "library-nav"} title={`全部图书（${shelfBooks.length}）`} aria-label={`全部图书（${shelfBooks.length}）`} onClick={() => setActiveCategory("全部")}><BookOpen size={17} /> 全部图书 <span>{shelfBooks.length}</span></button>
          <button className="library-nav" title="最近阅读" aria-label="最近阅读"><Clock3 size={17} /> 最近阅读</button>
          <div className="library-nav-title category-title">自定义标签 <button onClick={() => setCategoryModalOpen(true)} title="新建分类"><Plus size={15} /></button></div>
          {categories.map((category) => <button className={activeCategory === category ? "library-nav active" : "library-nav"} title={`${category}（${bookCategories.includes(category) ? 1 : 0}）`} aria-label={`${category}（${bookCategories.includes(category) ? 1 : 0}）`} key={category} onClick={() => setActiveCategory(category)}><span className="category-dot" />{category}<span>{bookCategories.includes(category) ? 1 : 0}</span></button>)}
          <div className="library-nav-title type-browser-title">图书类型 <span>{BOOK_TYPES.length}</span></div>
          <button className={typeBrowserExpanded ? "library-nav rail-settings active" : "library-nav rail-settings"} title="筛选与分类" aria-label="筛选与分类" onClick={() => setTypeBrowserExpanded((value) => !value)}><Settings2 size={22} /><span>筛选与分类</span></button>
        </aside>
        <aside className="library-filter-panel" aria-hidden={!typeBrowserExpanded}>
          <div className="filter-panel-head"><h2>筛选与分类</h2><button title="关闭" aria-label="关闭筛选与分类" onClick={() => setTypeBrowserExpanded(false)}><X size={22} /></button></div>
          <section><h3>书架</h3><button className={activeCategory === "全部" && activeType === "全部类型" ? "filter-row active" : "filter-row"} onClick={() => { setActiveCategory("全部"); setActiveType("全部类型"); }}>全部图书<span>{shelfBooks.length}</span></button><button className="filter-row">最近阅读<History size={16} /></button></section>
          <section><h3>自定义标签</h3>{categories.map((category) => <button className={activeCategory === category ? "filter-row active" : "filter-row"} key={category} onClick={() => setActiveCategory(category)}>{category}<span>{bookCategories.includes(category) ? 1 : 0}</span></button>)}<button className="filter-row muted" onClick={() => setCategoryModalOpen(true)}>管理分类<Tag size={15} /></button></section>
          <section><h3>图书类型</h3><button className={activeType === "全部类型" ? "filter-row active" : "filter-row"} onClick={() => setActiveType("全部类型")}>全部类型<span>{shelfBooks.length}</span></button>{BOOK_TYPES.map((type) => <button className={activeType === type.name ? "filter-row active" : "filter-row"} key={type.id} onClick={() => setActiveType(type.name)}><i /><span>{type.name}</span><small>{shelfBooks.filter((item) => item.bookType === type.name).length}</small></button>)}</section>
        </aside>
        <section className="library-content">
          <header className="library-heading"><div><p>{shelfLabel}</p><h1>{activeType !== "全部类型" ? "类型图书" : activeCategory === "全部" ? "正在阅读" : "分类图书"}</h1><small className="import-format-note">当前可直接阅读 EPUB、PDF；TXT、MOBI、AZW3 等格式将作为后续解析器接入。</small></div><button className="sort-button"><SlidersHorizontal size={16} /> 最近阅读 <ChevronDown size={15} /></button></header>
          {searchedShelfBooks.length ? <div className="book-grid">{searchedShelfBooks.map((shelfBook) => {
            const shelfState = shelfBookStates.get(shelfBook.id) || getBookShelfState(shelfBook);
            return <article className="book-card" key={shelfBook.id}><BookCover book={shelfBook} /><div className="book-info"><div className="book-card-actions">{!shelfBook.local && <button className="book-delete-button" onClick={() => requestDeleteBook(shelfBook)} title="删除书籍"><X size={14} /></button>}</div><div className="book-tags"><span>{shelfBook.bookType || "待 AI 识别"}</span></div><h2>{shelfBook.title}</h2><p>{shelfBook.creator}</p><p className="publisher">{shelfBook.publisher || localFormatLabel(shelfBook)}</p><div className="book-progress"><span><i style={{ width: `${shelfState.percent}%` }} /></span><b>{shelfState.hasRead ? `${shelfState.percent}%` : "未读"}</b><small>{shelfState.label}</small></div><button className="read-button" onPointerDown={(event) => { if (event.button === 0) openShelfBook(shelfBook); }} onClick={() => openShelfBook(shelfBook)}>打开阅读 <ChevronRight size={17} /></button></div></article>;
          })}</div> : <div className="empty-library"><ListFilter size={28} /><strong>这个分类还没有图书</strong><span>导入一本 EPUB 或 PDF 后就可以开始阅读。</span><button className="text-action" onClick={() => inputRef.current?.click()}>导入书籍</button></div>}
        </section>
        {shelfSearchOpen && <div className="library-search-panel"><div className="search-panel-head"><h2>{shelfSearchText ? "搜索结果" : "书架上的热门"}</h2><button onClick={() => setShelfSearchOpen(false)} aria-label="关闭搜索"><X size={20} /></button></div><div className="search-suggestion-grid">{(shelfSearchText ? searchedShelfBooks : shelfBooks).slice(0, 6).map((item) => <button className="search-suggestion-card" key={item.id} onClick={() => { setShelfSearchOpen(false); openShelfBook(item); }}><BookCover book={item} /><span>{item.title}</span><small>{item.bookType || localFormatLabel(item)}</small></button>)}{!shelfSearchText && shelfSearchSuggestions.map((item) => <button className="search-suggestion-card type-result" key={item.label} onClick={() => { setActiveType(item.label); setShelfSearchOpen(false); }}><i /><span>{item.label}</span><small>{item.count} 本</small></button>)}</div></div>}
        {categoryModalOpen && <CategoryModal categories={categories} selected={bookCategories} newCategory={newCategory} setNewCategory={setNewCategory} onAdd={addCategory} onToggle={toggleBookCategory} onClose={() => setCategoryModalOpen(false)} />}
        {deleteCandidate && <DeleteBookConfirmModal book={deleteCandidate} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmDeleteBook} />}
        {importStatus && <ImportProgressModal status={importStatus} />}
      </main>
    );
  }

  const currentPageRead = isPageRead(chapterIndex, pageIndex);
  const contextRelationships = contextualRelationships(bookIndex.relationships || [], {
    chapterIndex,
    pageParagraphs: currentPageParagraphs,
    selectedParagraph,
    index: bookIndex,
  });
  const pageMetrics = getLogicalPageMetrics(pageWidth, pageHeight, pagePackScale);
  return (
    <main className={`reader-shell theme-${readingTheme}${sidebarCollapsed ? " sidebar-collapsed" : ""}${relationshipOpen ? " relationship-open" : ""}`}>
      <header className="reader-topbar">
        <div className="book-title" title={`${book.title} · ${book.creator}`}><BookOpen size={17} /><span>{book.title}</span><small>{book.creator}</small>{bookProfile && <small>{bookProfile.category}</small>}</div>
        <div className="reader-status">
          <div className="reader-search-anchor">
            <button
              type="button"
              className={searchOpen ? "reader-search-trigger active" : "reader-search-trigger"}
              onClick={() => setSearchOpen((open) => !open)}
              title="搜索书内内容 (Ctrl K)"
              aria-label="搜索书内内容"
              aria-expanded={searchOpen}
              aria-controls="reader-search-dialog"
            >
              <Search size={18} />
            </button>
            {searchOpen && (
              <SearchDialog
                book={book}
                query={searchQuery}
                setQuery={setSearchQuery}
                results={searchResults}
                onSelect={(result) => {
                  rememberSearchQuery(book, searchQuery);
                  openSearchResult(result);
                }}
                onClose={() => setSearchOpen(false)}
              />
            )}
          </div>
          <TraceStatusPill job={traceJob} />
          <div className="reader-progress" title={`阅读进度 ${progress}%`} aria-label={`阅读进度 ${progress}%`}><i><b style={{ width: `${progress}%` }} /></i><span>{progress}%</span></div>
          <span title="本地阅读 · 无剧透" aria-label="本地阅读 · 无剧透"><ShieldCheck size={16} /></span>
        </div>
      </header>
      <aside className="reader-sidebar">
        <nav className="reader-tabs">
          <button className={activePanel === "主题" && !sidebarCollapsed ? "active theme-toolbar-trigger" : "theme-toolbar-trigger"} onClick={() => toggleReaderPanel("主题")} title="阅读主题" aria-label="阅读主题"><Palette size={20} /><span>主题</span></button>
          <button className={activePanel === "目录" && !sidebarCollapsed ? "active directory-tab" : "directory-tab"} title="目录" aria-label="目录" onClick={() => toggleReaderPanel("目录")}><ListFilter size={20} /><span>目录</span></button>
          <button className={activePanel === "书签" && !sidebarCollapsed ? "active reader-rail-button" : "reader-rail-button"} title="书签" aria-label={`书签（${bookmarks.length}）`} onClick={() => toggleReaderPanel("书签")}><Bookmark size={20} /><span>书签</span></button>
          <button className={activePanel === "笔记" && !sidebarCollapsed ? "active reader-rail-button" : "reader-rail-button"} title="笔记" aria-label={`笔记（${notes.length}）`} onClick={() => toggleReaderPanel("笔记")}><FileText size={20} /><span>笔记</span></button>
          <button className={activePanel === "AI 阅读" && !sidebarCollapsed ? "active analysis-settings-trigger ai-rail-trigger" : "analysis-settings-trigger ai-rail-trigger"} onClick={() => toggleReaderPanel("AI 阅读")} title="续读恢复" aria-label="续读恢复"><Bot size={21} /> <span>续读恢复</span></button>
          <button className="back-to-shelf" title="返回书架" aria-label="返回书架" onClick={() => setScreen("shelf")}><ArrowLeft size={20} /><span>书架</span></button>
        </nav>
        <div className="reader-side-content">
          {activePanel === "目录" && <div className="toc-list">{book.chapters.map((item, index) => <button className={index === chapterIndex ? "toc-row active" : "toc-row"} key={item.id} onClick={() => selectChapter(index)}><span>{index + 1}</span>{item.title}</button>)}</div>}
          {activePanel === "主题" && <ReaderThemePanel theme={readingTheme} onChange={setReadingTheme} />}
          {activePanel === "AI 阅读" && <ReaderAnalysisPanel settings={analysisSettings} setSettings={setAnalysisSettings} state={analysisState} onAnalyze={analyzeBook} />}
          {activePanel === "书签" && <BookmarkList items={bookmarks} onOpen={openBookmark} onRemove={removeBookmark} />}
          {activePanel === "笔记" && <NoteList items={notes} onOpen={openNote} onRemove={removeNote} />}
          {activePanel === "解惑" && <SelectionAssistPanel
            assist={selectionAssist}
            book={book}
            bookProfile={bookProfile}
            bookMemory={bookMemory}
            settings={analysisSettings}
            setSettings={setAnalysisSettings}
            cursor={getReadCursor()}
            onAssistChange={setSelectionAssist}
            onPersistExplain={persistSelectionExplain}
            onDeleteExplain={deletePersistedExplain}
            onEvidence={openSearchResult}
            onClose={() => { setSelectionAssist(null); setActivePanel("目录"); }}
          />}
        </div>
        <div className="side-book-meta"><span>共 {book.chapters.length} 节</span><span>{localFormatLabel(book)}</span></div>
      </aside>
      <section className="reading-stage">
        {recoveryCard && <div className="recall-sheet-overlay" role="presentation">
          <RecoveryCard
            card={recoveryCard}
            onTrack={recordRecoveryInteraction}
            onClose={(action = "continue") => {
              recordRecoveryInteraction(action, recoveryCard);
              setRecoveryCard(null);
            }}
            onEvidence={(evidence) => {
              recordRecoveryInteraction("evidence", recoveryCard);
              setRecoveryCard(null);
              openSearchResult(evidence);
            }}
          />
        </div>}
        <header className="chapter-toolbar"><button className="chapter-step" disabled={chapterIndex === 0} onClick={() => selectChapter(chapterIndex - 1)} title="上一章" aria-label="上一章"><ChevronsLeft size={18} /></button><span>{chapter.title}</span><button className="chapter-step" disabled={chapterIndex === book.chapters.length - 1} onClick={() => selectChapter(chapterIndex + 1)} title="下一章" aria-label="下一章"><ChevronsRight size={18} /></button></header>
        <article className="epub-page">
          <div className="page-title-row"><h1>{chapter.title}</h1><span>{hasPriorReadingContext && <button className="page-recall" onClick={openCurrentRecoveryCard} title="主动回忆当前页之前的内容" aria-label="主动回忆"><History size={15} /></button>}{pageIndex + 1} / {pageCount} 页 {currentPageRead && <b className="read-page-tag">已读</b>}<button className={bookmarks.some((item) => item.id === `${chapterIndex}:${pageIndex}`) ? "page-bookmark active" : "page-bookmark"} onClick={toggleBookmark} title={bookmarks.some((item) => item.id === `${chapterIndex}:${pageIndex}`) ? "取消书签" : "添加书签"} aria-label="切换书签"><Bookmark size={16} /></button></span></div>
          <div className={`page-copy ${pageTurn ? `turn-${pageTurn}` : ""}`} ref={pageCopyRef} onMouseDown={closeDrawerOnBlank} onMouseUp={openSelectionBloom}><div className="page-track" ref={pageTrackRef} style={{ "--page-width": `${pageWidth}px` }}>{currentPageParagraphs.map((item) => {
            const { text, paragraphIndex, segmentIndex, type, src, alt } = item;
            if (type === "image" || src) {
              return (
                <figure
                  id={`paragraph-${paragraphIndex}`}
                  key={`${chapter.id}-${paragraphIndex}-image`}
                  className="page-figure"
                >
                  <img className="page-image" src={src} alt={alt || ""} draggable={false} />
                </figure>
              );
            }
            const segmentStart = Math.max(0, (Number(segmentIndex) || 0) * pageMetrics.longSegmentSize);
            return (
              <p
                id={`paragraph-${paragraphIndex}`}
                key={`${chapter.id}-${paragraphIndex}-${segmentIndex}`}
                onClick={() => selectParagraph(paragraphIndex)}
              >
                <ParagraphWithExplainMarks
                  text={text}
                  chapterIndex={chapterIndex}
                  paragraphIndex={paragraphIndex}
                  segmentStart={segmentStart}
                  explains={explains}
                  notes={notes}
                  onPreviewEnter={scheduleExplainPreview}
                  onPreviewLeave={clearExplainPreviewSoon}
                  onOpen={openExplainFromMarker}
                />
              </p>
            );
          })}</div></div>
        </article>
        <footer className="reader-footer"><button className="page-step" disabled={pageIndex === 0 && chapterIndex === 0} onClick={() => turnPage(-1)} title="上一页" aria-label="上一页"><ChevronLeft size={17} /></button><span>第 {pageIndex + 1} / {pageCount} 页 <b className={currentPageRead ? "read-state read" : "read-state"}>{currentPageRead ? "已读" : "阅读中"}</b></span><button className="page-step" disabled={pageIndex === pageCount - 1 && chapterIndex === book.chapters.length - 1} onClick={() => turnPage(1)} title="下一页" aria-label="下一页"><ChevronRight size={17} /></button></footer>
      </section>
      {selectionBloom && <SelectionBloom selection={selectionBloom} theme={readingTheme} relationAvailable={contextRelationships.length > 0} canDeleteExplain={findExplainsForSelection(explains, selectionBloom).length > 0} onAction={handleBloomAction} onClose={() => setSelectionBloom(null)} />}
      {explainPreview?.primary && (
        <div
          className="explain-mark-preview"
          style={{ left: explainPreview.x, top: explainPreview.y }}
          onMouseEnter={() => window.clearTimeout(clearExplainPreviewSoon.timer)}
          onMouseLeave={clearExplainPreviewSoon}
          role="tooltip"
        >
          <div className="explain-mark-preview-head">
            <strong>{previewMetaLabel(explainPreview.primary)}</strong>
            <button
              type="button"
              className="explain-mark-preview-delete"
              title="删除此解惑标注"
              aria-label="删除此解惑标注"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                deletePersistedExplain(explainPreview.primary.id);
              }}
            >
              <X size={13} />
            </button>
          </div>
          {explainPreview.records.length > 1 && (
            <div className="explain-mark-preview-switch" role="tablist" aria-label="同段解惑">
              {explainPreview.records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  role="tab"
                  aria-selected={record.id === explainPreview.primary.id}
                  className={record.id === explainPreview.primary.id ? "active" : ""}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setExplainPreview((current) => current ? { ...current, primary: record } : current);
                  }}
                >
                  {explainModeLabel(record.mode)}
                </button>
              ))}
            </div>
          )}
          <p>{previewConclusion(explainPreview.primary)}</p>
          <button
            type="button"
            onClick={() => openExplainFromMarker(explainPreview.records, explainPreview.primary)}
          >
            依据 ×{(explainPreview.primary.evidence?.length || explainPreview.primary.cites?.length || 0)} · 点击展开
          </button>
        </div>
      )}
      {noteComposerOpen && noteContext && (
        <NoteComposer
          draft={noteDraft}
          setDraft={setNoteDraft}
          selection={noteContext.selection}
          onClose={closeNoteComposer}
          onSave={saveNote}
        />
      )}
      {relationshipOpen && <RelationshipWorkspace relationships={contextRelationships} onEvidence={openRelationshipEvidence} onClose={() => { setRelationshipOpen(false); setActivePanel("目录"); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function LegacySkillTreeScreen({ book, config, domain, progress, domainProgress: current, onBack }) {
  const earned = earnedBadges(progress, domain);
  const unlocked = unlockedSpecialSkills(progress, domain);
  const interactions = current.bookmarks + current.notes + current.evidenceJumps;
  const nextSkill = config.skills.find(([, , requirement]) => current.xp < requirement);
  const [selectedTalentIndex, setSelectedTalentIndex] = useState(0);
  const selectedTalent = config.skills[selectedTalentIndex] || config.skills[0];
  const selectedTalentUnlocked = current.xp >= selectedTalent[2];
  return <main className={`skill-shell domain-${config.accent}`}>
    <header className="skill-topbar"><div className="brand"><span className="brand-mark"><Sparkles size={18} /></span>{APP_NAME} <small>阅读能力</small></div><button className="text-action" onClick={onBack}><ArrowLeft size={16} /> 返回书架</button></header>
    <section className="skill-page">
      <header className="skill-heading"><div><span>{config.name}</span><h1>阅读能力树</h1><p>《{book.title}》正在积累此类型的阅读经验；通用技能始终可用，专属能力随深度阅读逐层开启。</p></div><div className="skill-xp"><span>类型经验</span><strong>{current.xp}</strong>{nextSkill ? <small>距「{nextSkill[0]}」还需 {nextSkill[2] - current.xp}</small> : <small>本类型天赋已全部开启</small>}</div></header>
      <div className="reading-archive"><article><Clock3 size={18} /><span>累计阅读</span><strong>{formatReadingTime(progress.totalSeconds)}</strong></article><article><BookOpen size={18} /><span>已读页面</span><strong>{progress.totalPages}</strong></article><article><Sparkles size={18} /><span>深度互动</span><strong>{interactions}</strong></article><article><Bookmark size={18} /><span>当前类型书签</span><strong>{current.bookmarks}</strong></article></div>
      <div className="skill-layout"><section className="universal-skill-panel"><header><span>通用技能</span><small>初始拥有</small></header>{UNIVERSAL_SKILLS.map((skill) => <article key={skill.id}><i><Check size={14} /></i><div><strong>{skill.name}</strong><span>{skill.detail}</span></div></article>)}</section><section className="talent-panel"><header><span>{config.name} · 专属天赋</span><small>可解锁天赋 {current.xp}</small></header><div className="talent-tree"><span className="constellation-line line-root" /><span className="constellation-line line-one" /><span className="constellation-line line-two" /><span className="constellation-line line-three" /><span className="talent-root-star" />{config.skills.map(([name, detail, requirement], index) => { const open = current.xp >= requirement; return <article className={`${open ? "unlocked" : "locked"}${selectedTalentIndex === index ? " selected" : ""}`} key={name}><button type="button" onClick={() => setSelectedTalentIndex(index)} aria-label={`${name}，${open ? "已解锁" : `需要 ${requirement} 类型经验`} `}><i>{open ? <Check size={15} /> : index + 1}</i></button></article>; })}</div><div className="talent-detail"><span>{selectedTalentUnlocked ? "已点亮" : `还需 ${Math.max(0, selectedTalent[2] - current.xp)} 类型经验`}</span><strong>{selectedTalent[0]}</strong><p>{selectedTalent[1]}</p></div></section></div>
      <section className="badge-panel"><header><div><span>馆藏名帖</span><h2>{config.name}勋章</h2></div><small>{earned.length} / {config.badges.length} 已获</small></header><div>{config.badges.map(([name, description], index) => { const badge = earned.some(([earnedName]) => earnedName === name); return <article className={badge ? "earned" : ""} key={name}><i>{badge ? <Check size={15} /> : index + 1}</i><strong>{name}</strong><span>{description}</span></article>; })}</div></section>
    </section>
  </main>;
}

function LegacySkillTreeScreenPixiLayout({ book, config, domain, progress, domainProgress: current, onBack }) {
  const earned = earnedBadges(progress, domain);
  const interactions = current.bookmarks + current.notes + current.evidenceJumps;
  const nextSkill = config.skills.find(([, , requirement]) => current.xp < requirement);
  const [selectedTalentIndex, setSelectedTalentIndex] = useState(0);
  const selectedTalent = config.skills[selectedTalentIndex] || config.skills[0];
  const selectedTalentUnlocked = current.xp >= selectedTalent[2];

  return <main className={`skill-shell domain-${config.accent}`}>
    <header className="skill-topbar">
      <div className="brand"><span className="brand-mark"><Sparkles size={18} /></span>{APP_NAME} <small>阅读能力</small></div>
      <button className="text-action" onClick={onBack}><ArrowLeft size={16} /> 返回书架</button>
    </header>
    <section className="skill-page">
      <header className="skill-heading">
        <div>
          <span>{config.name}</span>
          <h1>阅读能力树</h1>
          <p>《{book.title}》正在积累此类型的阅读经验；通用技能始终可用，专属天赋随着阅读页数、笔记、书签和证据回看逐步点亮。</p>
        </div>
        <div className="skill-xp">
          <span>类型经验</span>
          <strong>{current.xp}</strong>
          {nextSkill ? <small>距离「{nextSkill[0]}」还需 {nextSkill[2] - current.xp}</small> : <small>本类型天赋已全部点亮</small>}
        </div>
      </header>

      <div className="reading-archive">
        <article><Clock3 size={18} /><span>累计阅读</span><strong>{formatReadingTime(progress.totalSeconds)}</strong></article>
        <article><BookOpen size={18} /><span>已读页面</span><strong>{progress.totalPages}</strong></article>
        <article><Sparkles size={18} /><span>深度互动</span><strong>{interactions}</strong></article>
        <article><Bookmark size={18} /><span>当前类型书签</span><strong>{current.bookmarks}</strong></article>
      </div>

      <div className="skill-layout">
        <section className="universal-skill-panel">
          <header><span>通用技能</span><small>初始拥有</small></header>
          {UNIVERSAL_SKILLS.map((skill) => <article key={skill.id}><i><Check size={14} /></i><div><strong>{skill.name}</strong><span>{skill.detail}</span></div></article>)}
        </section>
        <section className="talent-panel">
          <header><span>{config.name} · 专属天赋</span><small>{config.skills.filter(([, , requirement]) => current.xp >= requirement).length} / {config.skills.length} 已点亮</small></header>
          <TalentConstellation skills={config.skills} domain={domain} xp={current.xp} selectedIndex={selectedTalentIndex} onSelect={setSelectedTalentIndex} />
          <div className="talent-detail">
            <span>{selectedTalentUnlocked ? "已点亮" : `还需 ${Math.max(0, selectedTalent[2] - current.xp)} 类型经验`}</span>
            <strong>{selectedTalent[0]}</strong>
            <p>{selectedTalent[1]}</p>
          </div>
        </section>
      </div>

      <section className="badge-panel">
        <header><div><span>馆藏名帖</span><h2>{config.name}勋章</h2></div><small>{earned.length} / {config.badges.length} 已获</small></header>
        <div>{config.badges.map(([name, description], index) => {
          const badge = earned.some(([earnedName]) => earnedName === name);
          return <article className={badge ? "earned" : ""} key={name}><i>{badge ? <Check size={15} /> : index + 1}</i><strong>{name}</strong><span>{description}</span></article>;
        })}</div>
      </section>
    </section>
  </main>;
}

function SkillTreeScreen({ book, config, domain, progress, domainProgress: current, onBack }) {
  const earned = earnedBadges(progress, domain);
  const interactions = current.bookmarks + current.notes + current.evidenceJumps;
  const nextSkill = config.skills.find(([, , requirement]) => current.xp < requirement);
  const unlockedCount = config.skills.filter(([, , requirement]) => current.xp >= requirement).length;
  const [selectedTalentIndex, setSelectedTalentIndex] = useState(0);
  const selectedTalent = config.skills[selectedTalentIndex] || config.skills[0];
  const selectedTalentUnlocked = current.xp >= selectedTalent[2];
  const nextRequirement = nextSkill ? nextSkill[2] : Math.max(...config.skills.map(([, , requirement]) => requirement), 1);
  const xpPercent = Math.min(100, Math.round((current.xp / nextRequirement) * 100));

  return <main className={`skill-shell skill-shell-redesign domain-${config.accent}`}>
    <header className="skill-topbar">
      <div className="brand"><span className="brand-mark"><Sparkles size={18} /></span>{APP_NAME} <small>阅读能力</small></div>
      <button className="text-action" onClick={onBack}><ArrowLeft size={16} /> 返回书架</button>
    </header>
    <section className="skill-page skill-page-redesign">
      <header className="skill-hero">
        <div className="skill-hero-copy">
          <span>{config.name}</span>
          <h1>阅读能力树</h1>
          <p>《{book.title}》的阅读行为会沉淀为能力经验。通用技能默认可用，专属天赋根据阅读页数、书签、笔记和证据回看逐步点亮。</p>
        </div>
        <aside className="skill-progress-card">
          <div><span>类型经验</span><strong>{current.xp}</strong></div>
          <div className="skill-progress-track"><i style={{ width: `${xpPercent}%` }} /></div>
          {nextSkill ? <small>下一项：{nextSkill[0]}，还需 {nextSkill[2] - current.xp}</small> : <small>本类型天赋已全部点亮</small>}
        </aside>
      </header>

      <div className="skill-workspace">
        <aside className="skill-side-panel">
          <section className="reading-archive compact">
            <article><Clock3 size={17} /><span>累计阅读</span><strong>{formatReadingTime(progress.totalSeconds)}</strong></article>
            <article><BookOpen size={17} /><span>已读页面</span><strong>{progress.totalPages}</strong></article>
            <article><Sparkles size={17} /><span>深度互动</span><strong>{interactions}</strong></article>
            <article><Bookmark size={17} /><span>本类书签</span><strong>{current.bookmarks}</strong></article>
          </section>
          <section className="universal-skill-panel">
            <header><span>通用技能</span><small>默认拥有</small></header>
            {UNIVERSAL_SKILLS.map((skill) => <article key={skill.id}><i><Check size={14} /></i><div><strong>{skill.name}</strong><span>{skill.detail}</span></div></article>)}
          </section>
        </aside>

        <section className="talent-panel talent-panel-focus">
          <header>
            <div><span>{config.name}</span><strong>专属天赋</strong></div>
            <small>{unlockedCount} / {config.skills.length} 已点亮</small>
          </header>
          <TalentConstellation skills={config.skills} domain={domain} xp={current.xp} selectedIndex={selectedTalentIndex} onSelect={setSelectedTalentIndex} />
          <div className="talent-detail">
            <span>{selectedTalentUnlocked ? "已点亮" : `还需 ${Math.max(0, selectedTalent[2] - current.xp)} 类型经验`}</span>
            <strong>{selectedTalent[0]}</strong>
            <p>{selectedTalent[1]}</p>
          </div>
        </section>
      </div>

      <section className="badge-panel badge-panel-redesign">
        <header><div><span>馆藏名帖</span><h2>{config.name}勋章</h2></div><small>{earned.length} / {config.badges.length} 已获</small></header>
        <div>{config.badges.map(([name, description], index) => {
          const badge = earned.some(([earnedName]) => earnedName === name);
          return <article className={badge ? "earned" : ""} key={name}><i>{badge ? <Check size={15} /> : index + 1}</i><strong>{name}</strong><span>{description}</span></article>;
        })}</div>
      </section>
    </section>
  </main>;
}

function formatReadingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function RelationshipWorkspace({ relationships, onEvidence, onClose }) {
  const [view, setView] = useState("graph");
  const [selectedName, setSelectedName] = useState(relationships[0]?.source || "");
  useEffect(() => {
    setSelectedName(relationships[0]?.source || "");
    setView("graph");
  }, [relationships]);
  const visibleRelationships = useMemo(() => view === "organization"
    ? relationships.filter((item) => item.relationKind === "command" || item.relationKind === "belongs")
    : relationships, [relationships, view]);
  const graph = useMemo(() => layoutRelationshipGraph(visibleRelationships, view === "organization" ? "TB" : "LR"), [visibleRelationships, view]);
  const selectedRelationship = visibleRelationships.find((item) => item.source === selectedName || item.target === selectedName) || visibleRelationships[0];
  const entities = useMemo(() => uniqueRelationshipEntities(visibleRelationships), [visibleRelationships]);

  return <section className="relationship-workspace context-relationship-workspace" aria-label="上下文关系">
    <header className="relationship-header"><div><span>当前页辅助</span><h2>上下文关系</h2><small>{visibleRelationships.length} 条可追溯关系</small></div><button onClick={onClose} title="关闭上下文关系"><X size={18} /></button></header>
    <div className="relationship-view-switch" role="tablist"><button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>局部关系</button>{relationships.length >= 3 && <button className={view === "organization" ? "active" : ""} onClick={() => setView("organization")}>组织层级</button>}{relationships.length >= 4 && <button className={view === "matrix" ? "active" : ""} onClick={() => setView("matrix")}>矩阵</button>}</div>
    <div className="relationship-canvas">
      {view === "matrix" ? <RelationshipMatrix entities={entities} relationships={visibleRelationships} onSelect={setSelectedName} /> : visibleRelationships.length ? <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable onNodeClick={(_event, node) => setSelectedName(node.data.entityName)} onEdgeClick={(_event, edge) => setSelectedName(edge.data.relationship.source)}><Background gap={18} size={1} color="#e3ebe2" /><Controls showInteractive={false} /></ReactFlow> : <div className="relationship-empty">当前页附近还没有可靠关系证据。选中人物或组织后再查看，会更准确。</div>}
    </div>
    {selectedRelationship && <footer className="relationship-detail"><div><span>{selectedRelationship.source} <i>·</i> {selectedRelationship.relation} <i>·</i> {selectedRelationship.target}</span><small>第 {selectedRelationship.evidence.chapterIndex + 1} 节 · 原文证据</small></div><button onClick={() => onEvidence(selectedRelationship)}>查看原文 <ChevronRight size={15} /></button></footer>}
  </section>;
}

function RelationshipMatrix({ entities, relationships, onSelect }) {
  const matrixEntities = entities.slice(0, 8);
  return <div className="relationship-matrix"><div className="matrix-grid" style={{ "--matrix-columns": matrixEntities.length + 1 }}><span className="matrix-corner">关系</span>{matrixEntities.map((entity) => <span className="matrix-head" key={`head-${entity.id}`}>{entity.name}</span>)}{matrixEntities.flatMap((row) => [<button className="matrix-row" key={`row-${row.id}`} onClick={() => onSelect(row.name)}>{row.name}</button>, ...matrixEntities.map((column) => { const relation = relationships.find((item) => (item.source === row.name && item.target === column.name) || (item.source === column.name && item.target === row.name)); return <button className={relation ? "matrix-cell linked" : "matrix-cell"} key={`${row.id}-${column.id}`} title={relation ? `${relation.source} · ${relation.relation} · ${relation.target}` : "无可靠关系"} onClick={() => relation && onSelect(relation.source)}>{relation ? relation.relation : ""}</button>; })])}</div></div>;
}

function uniqueRelationshipEntities(relationships) {
  const entities = new Map();
  relationships.forEach((item) => {
    entities.set(`${item.sourceType}:${item.source}`, { id: `${item.sourceType}:${item.source}`, name: item.source, type: item.sourceType });
    entities.set(`${item.targetType}:${item.target}`, { id: `${item.targetType}:${item.target}`, name: item.target, type: item.targetType });
  });
  return [...entities.values()];
}

function layoutRelationshipGraph(relationships, direction) {
  const entities = uniqueRelationshipEntities(relationships);
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 44, ranksep: 72, marginx: 34, marginy: 34 });
  entities.forEach((entity) => graph.setNode(entity.id, { width: 138, height: 48 }));
  relationships.forEach((relationship) => graph.setEdge(`${relationship.sourceType}:${relationship.source}`, `${relationship.targetType}:${relationship.target}`));
  dagre.layout(graph);
  return {
    nodes: entities.map((entity) => {
      const position = graph.node(entity.id);
      return { id: entity.id, position: { x: position.x - 69, y: position.y - 24 }, data: { label: entity.name, entityName: entity.name, entityType: entity.type }, className: `relationship-node ${entity.type}` };
    }),
    edges: relationships.map((relationship) => ({ id: relationship.id, source: `${relationship.sourceType}:${relationship.source}`, target: `${relationship.targetType}:${relationship.target}`, label: relationship.relation, data: { relationship }, type: "smoothstep", animated: relationship.importance === "primary", style: { stroke: relationship.importance === "primary" ? "#4d8460" : "#a8b8aa", strokeWidth: relationship.importance === "primary" ? 1.7 : 1.1 }, labelStyle: { fill: "#637568", fontSize: 10 }, labelBgStyle: { fill: "#fff", fillOpacity: .88 } })),
  };
}

function relationshipNodeColor(type) {
  return type === "organization" ? "#b89066" : type === "event" ? "#8e789d" : "#5b9070";
}

function SelectionBloom({ selection, theme, relationAvailable = true, canDeleteExplain = false, onAction, onClose }) {
  const actions = [
    { id: "question", label: "解惑", icon: Sparkles, className: "question" },
    { id: "recall", label: "回忆", icon: History, className: "recall" },
    { id: "source", label: "出处", icon: FileText, className: "source" },
    relationAvailable && { id: "relation", label: "关系", icon: Network, className: "relation" },
    { id: "note", label: "笔记", icon: Lightbulb, className: "note" },
    { id: "favorite", label: "收藏", icon: Bookmark, className: "favorite" },
    canDeleteExplain && { id: "delete", label: "删除", icon: Trash2, className: "delete" },
  ].filter(Boolean);
  return <div className={`selection-bloom selection-popover theme-${theme} ${selection.placement || "above"}`} style={{ left: selection.x, top: selection.y }} role="dialog" aria-label="选中文本辅助" onMouseDown={(event) => event.stopPropagation()}>
    <div className="selection-popover-bar" role="toolbar" aria-label={`针对“${selection.text}”的阅读操作`}>
      {actions.map((action, index) => { const Icon = action.icon; return <button className={`bloom-petal ${action.className}`} style={{ "--petal-index": index }} key={action.label} type="button" onClick={() => onAction(action.id)} title={action.label} aria-label={action.label}><Icon size={17} /><span>{action.label}</span></button>; })}
      <button className="bloom-core" type="button" onClick={onClose} title="收起辅助选项" aria-label="收起辅助选项"><span>{selection.text}</span><X size={13} /></button>
    </div>
  </div>;
}

function SelectionAssistPanel({
  assist,
  book,
  bookProfile,
  bookMemory,
  settings,
  setSettings,
  cursor,
  onAssistChange,
  onPersistExplain,
  onDeleteExplain,
  onEvidence,
  onClose,
}) {
  const text = summaryText(assist?.text);
  const mode = assist?.mode || "source";
  const explainRequest = resolveExplainRequest(settings);
  const speed = explainRequest.speed;
  const cacheKey = explainCacheKey(mode, speed);
  const cites = Array.isArray(assist?.cites) ? assist.cites : [];
  const explanation = assist?.explanations?.[cacheKey] || null;
  const status = assist?.statusByMode?.[cacheKey] || (mode === "source" ? "ready" : "idle");
  const error = assist?.errorByMode?.[cacheKey] || "";
  const [evidenceOpen, setEvidenceOpen] = useState(mode === "source");
  const persistStampRef = useRef("");

  useEffect(() => {
    setEvidenceOpen(mode === "source");
  }, [mode, text]);

  useEffect(() => {
    if (!assist?.text || mode === "source") return;
    if (assist?.explanations?.[cacheKey]?.answer) return;
    if (!cites.length) {
      onAssistChange?.((current) => current ? {
        ...current,
        statusByMode: { ...current.statusByMode, [cacheKey]: "empty" },
        errorByMode: { ...current.errorByMode, [cacheKey]: "暂无可用原文证据，可先看「书内出处」。" },
      } : current);
      return;
    }
    let cancelled = false;
    onAssistChange?.((current) => current ? {
      ...current,
      statusByMode: { ...current.statusByMode, [cacheKey]: "loading" },
      errorByMode: { ...current.errorByMode, [cacheKey]: "" },
    } : current);
    (async () => {
      try {
        const response = await fetch("/api/explain-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: explainRequest.provider,
            model: explainRequest.model,
            thinking: explainRequest.thinking,
            mode,
            selection: assist.text,
            book: {
              id: book?.id,
              title: book?.title,
              creator: book?.creator,
              bookType: bookProfile?.category || book?.bookType,
            },
            cursor,
            bookMemory: bookMemory || null,
            evidence: cites,
          }),
        });
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok || !result.explanation?.answer) {
          throw new Error(result.error || "解惑生成失败");
        }
        onAssistChange?.((current) => current ? {
          ...current,
          explanations: { ...current.explanations, [cacheKey]: result.explanation },
          statusByMode: { ...current.statusByMode, [cacheKey]: "ready" },
          errorByMode: { ...current.errorByMode, [cacheKey]: "" },
        } : current);
      } catch (err) {
        if (cancelled) return;
        onAssistChange?.((current) => current ? {
          ...current,
          statusByMode: { ...current.statusByMode, [cacheKey]: "error" },
          errorByMode: { ...current.errorByMode, [cacheKey]: err.message || "解惑暂不可用，可先查看原文依据。" },
        } : current);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, speed, cacheKey, assist?.text, cites.length, explainRequest.provider, explainRequest.model, explainRequest.thinking]);

  useEffect(() => {
    if (!text || !onPersistExplain) return;
    const stamp = `${text}|${mode}|${speed}|${mode === "source" ? cites.length : (explanation?.answer || "")}`;
    if (persistStampRef.current === stamp) return;

    if (mode === "source") {
      if (!cites.length) return;
      persistStampRef.current = stamp;
      onPersistExplain({
        selection: assist.text,
        mode,
        explainSpeed: speed,
        chapterIndex: assist.chapterIndex ?? cursor?.chapterIndex ?? 0,
        pageIndex: assist.pageIndex ?? cursor?.pageIndex ?? 0,
        paragraphIndex: assist.paragraphIndex ?? cursor?.paragraphIndex ?? 0,
        startOffset: assist.startOffset ?? null,
        endOffset: assist.endOffset ?? null,
        title: "书内出处",
        answer: `已读范围内找到 ${cites.length} 处相关原文。`,
        highlights: [],
        evidence: cites,
        cites,
        explanations: {
          ...(assist.explanations || {}),
          [cacheKey]: {
            mode: "source",
            title: "书内出处",
            answer: `已读范围内找到 ${cites.length} 处相关原文。`,
            evidence: cites,
          },
        },
        createdAt: Date.now(),
      });
      return;
    }

    if (status !== "ready" || !explanation?.answer) return;
    persistStampRef.current = stamp;
    onPersistExplain({
      selection: assist.text,
      mode,
      explainSpeed: speed,
      chapterIndex: assist.chapterIndex ?? cursor?.chapterIndex ?? 0,
      pageIndex: assist.pageIndex ?? cursor?.pageIndex ?? 0,
      paragraphIndex: assist.paragraphIndex ?? cursor?.paragraphIndex ?? 0,
      startOffset: assist.startOffset ?? null,
      endOffset: assist.endOffset ?? null,
      title: explanation.title || "",
      answer: explanation.answer,
      highlights: explanation.highlights || [],
      evidence: explanation.evidence?.length ? explanation.evidence : cites,
      cites,
      explanations: {
        ...(assist.explanations || {}),
        [cacheKey]: explanation,
      },
      createdAt: Date.now(),
    });
  }, [text, mode, speed, status, explanation, cites, cacheKey, assist, cursor, onPersistExplain]);

  function setMode(nextMode) {
    onAssistChange?.((current) => current ? { ...current, mode: nextMode } : current);
  }

  function setSpeed(nextSpeed) {
    setSettings?.((current) => ({
      ...current,
      explainSpeed: nextSpeed === "deep" ? "deep" : "fast",
    }));
  }

  const answerReady = mode !== "source" && status === "ready" && !!explanation?.answer;
  const answerBody = (() => {
    if (mode === "source") {
      return cites.length
        ? <p className="selection-assist-answer">以下是已读范围内与选文最相关的原文依据，可点选跳回。</p>
        : <p className="reader-panel-empty">暂无直接相关的原文证据。</p>;
    }
    if (status === "loading") {
      return <p className="selection-assist-status">{speed === "deep" ? "正在深思…" : "正在整理…"}</p>;
    }
    if (status === "empty" || status === "error") {
      return <p className="reader-panel-empty">{error || "暂无可用解释。"}</p>;
    }
    if (!explanation?.answer) return <p className="reader-panel-empty">切换模式后将生成说明。</p>;
    return <>
      <span className="selection-assist-well-kicker">豁然开朗</span>
      {explanation.title && <h3 className="selection-assist-answer-title">{explanation.title}</h3>}
      <p className="selection-assist-answer">{explanation.answer}</p>
      {!!explanation.highlights?.length && <ul className="selection-assist-highlights">
        {explanation.highlights.map((item) => <li key={item}>{item}</li>)}
      </ul>}
    </>;
  })();

  const evidenceItems = mode === "source"
    ? cites
    : (explanation?.evidence?.length ? explanation.evidence : cites);

  const wellClass = [
    "selection-assist-well",
    mode === "source" ? "is-source" : "",
    status === "loading" ? "is-loading" : "",
    answerReady ? "is-ready" : "",
    (status === "empty" || status === "error" || (!explanation?.answer && mode !== "source" && status !== "loading")) ? "is-quiet" : "",
  ].filter(Boolean).join(" ");

  return <section className="selection-assist-panel">
    <header className="selection-assist-header">
      <strong>选文解惑</strong>
      <div className="selection-assist-header-actions">
        {assist?.fromExplainId && (
          <button
            type="button"
            className="selection-assist-delete"
            onClick={() => onDeleteExplain?.(assist.fromExplainId)}
            title="删除此解惑标注"
            aria-label="删除此解惑标注"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button type="button" className="icon-button" onClick={onClose} title="关闭解惑" aria-label="关闭解惑"><X size={16} /></button>
      </div>
    </header>
    <div className="selection-assist-toolbar">
      <div className="selection-assist-modes" role="tablist" aria-label="解惑方式">
        {EXPLAIN_MODES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              className={mode === item.id ? "active" : ""}
              title={`${item.label} · ${item.detail}`}
              aria-label={`${item.label}：${item.detail}`}
              onClick={() => setMode(item.id)}
            >
              <Icon size={17} strokeWidth={mode === item.id ? 2.15 : 1.85} />
            </button>
          );
        })}
      </div>
      <div className="selection-assist-speeds" role="group" aria-label="解惑速度">
        {EXPLAIN_SPEED_MODES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={speed === item.id ? "active" : ""}
              title={item.detail}
              aria-label={item.detail}
              aria-pressed={speed === item.id}
              onClick={() => setSpeed(item.id)}
            >
              <Icon size={15} strokeWidth={speed === item.id ? 2.15 : 1.85} />
            </button>
          );
        })}
      </div>
    </div>
    {!text ? <p className="reader-panel-empty">还没有选中文本。</p> : (
      <div
        key={`${cacheKey}:${explanation?.answer ? "ready" : status}`}
        className={wellClass}
        aria-live="polite"
      >
        <blockquote className="selection-assist-quote">{text}</blockquote>
        <div className="selection-assist-body">
          {answerBody}
        </div>
      </div>
    )}
    <div className="selection-assist-cites">
      <button
        type="button"
        className="selection-assist-evidence-toggle"
        onClick={() => setEvidenceOpen((value) => !value)}
        title={evidenceOpen ? "收起原文依据" : "展开原文依据"}
        aria-label={`${evidenceOpen ? "收起" : "展开"}原文依据，共 ${evidenceItems.length || 0} 条`}
        aria-expanded={evidenceOpen}
      >
        <FileText size={14} />
        <small>{evidenceItems.length || 0}</small>
        <ChevronDown size={14} className={evidenceOpen ? "open" : ""} />
      </button>
      {evidenceOpen && (evidenceItems.length ? evidenceItems.map((item) => (
        <button type="button" className="selection-assist-cite" key={item.id || `${item.chapterIndex}-${item.paragraphIndex}-${item.cite?.label}`} onClick={() => onEvidence(item)}>
          <small>{item.cite?.label || item.ref || "出处"} · {item.chapterTitle || `第 ${(item.chapterIndex || 0) + 1} 节`}</small>
          <span>{summaryText(item.excerpt || item.quote || item.cite?.quote)}</span>
        </button>
      )) : <p className="reader-panel-empty">暂无直接相关的原文证据。</p>)}
    </div>
  </section>;
}

function ParagraphWithExplainMarks({
  text,
  chapterIndex,
  paragraphIndex,
  segmentStart = 0,
  explains = [],
  notes = [],
  onPreviewEnter,
  onPreviewLeave,
  onOpen,
}) {
  const explainGroups = groupExplainMarkersForSegment(explains, {
    chapterIndex,
    paragraphIndex,
    segmentText: text,
    segmentStart,
  });
  const noteGroups = groupNoteMarksForSegment(notes, {
    chapterIndex,
    paragraphIndex,
    segmentText: text,
    segmentStart,
  });
  if (!explainGroups.length && !noteGroups.length) return text;

  const cuts = new Set([0, text.length]);
  explainGroups.forEach((group) => {
    cuts.add(group.start);
    cuts.add(group.end);
  });
  noteGroups.forEach((group) => {
    cuts.add(group.start);
    cuts.add(group.end);
  });
  const points = [...cuts].sort((left, right) => left - right);

  const nodes = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const slice = text.slice(start, end);
    const explainHit = explainGroups.find((group) => group.start <= start && group.end >= end);
    const noteHit = noteGroups.find((group) => group.start <= start && group.end >= end);
    const isExplainEnd = Boolean(explainHit && explainHit.end === end);

    if (!explainHit && !noteHit) {
      nodes.push(slice);
      continue;
    }

    const className = [
      noteHit ? "note-mark-span" : "",
      explainHit ? "explain-mark-span" : "",
    ].filter(Boolean).join(" ");

    nodes.push(
      <span className={className} key={`ann-${start}-${end}-${explainHit?.key || noteHit?.key || "x"}`}>
        {slice}
        {isExplainEnd && (
          <button
            type="button"
            className="explain-mark"
            title="查看解惑"
            aria-label={explainHit.records.length > 1 ? `解惑 ${explainHit.records.length} 条` : "解惑"}
            onMouseEnter={(event) => {
              event.stopPropagation();
              onPreviewEnter?.(event, explainHit);
            }}
            onMouseLeave={(event) => {
              event.stopPropagation();
              onPreviewLeave?.(event);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpen?.(explainHit.records);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {explainHit.records.length > 1
              ? `${markerShortLabel(explainHit.records)}·${explainHit.records.length}`
              : markerShortLabel(explainHit.records)}
          </button>
        )}
      </span>,
    );
  }
  return nodes;
}

function ReaderThemePanel({ theme, onChange }) {
  return <section className="reader-theme-panel reader-panel-list">
    {READING_THEMES.map((item) => { const Icon = item.icon; return <button className={theme === item.id ? "active" : ""} key={item.id} onClick={() => onChange(item.id)}><Icon size={17} /><span>{item.name}</span><small>{item.detail}</small></button>; })}
  </section>;
}

function TraceStatusPill({ job }) {
  if (!job || job.status === "idle") return null;
  const label = job.status === "queued" ? "排队中" : job.status === "running" ? "Trace 中" : job.status === "error" ? "Trace 异常" : "已同步";
  const title = job.message || label;
  return <span className={`trace-status-pill ${job.status}`} title={title} aria-label={title} role="status"><Bot size={16} /><i className="trace-status-dot" aria-hidden="true" /></span>;
}

function ReaderAnalysisPanel({ settings, setSettings, state, onAnalyze }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isAnalyzing = state.status === "loading";
  const updateProvider = (provider) => setSettings((current) => ({
    ...current,
    provider,
    model: provider === "deepseek" ? "deepseek-v4-flash" : "gpt-4.1-mini",
  }));
  const adjustThreshold = (amount) => setSettings((current) => ({ ...current, autoPageThreshold: Math.max(1, Math.min(50, Number(current.autoPageThreshold || 5) + amount)) }));
  const toggleAuto = () => setSettings((current) => ({ ...current, analysisMode: current.analysisMode === "auto" ? "read" : "auto" }));
  return <section className="reader-analysis-panel">
    <header className="reader-ai-hero"><i><Bot size={22} /></i><div><strong>续读恢复</strong><span>整理已读范围的前文关键点、当前页前置理解和证据。</span></div></header>
    <div className="reader-panel-actions">
      <button className="active" disabled={isAnalyzing || !settings.model.trim()} onClick={() => { setSettings((current) => ({ ...current, analysisMode: "read" })); onAnalyze("read"); }}><Sparkles size={17} /><span>{isAnalyzing ? "正在整理" : "更新恢复卡"}</span><small>只处理已读范围</small></button>
      <button disabled={isAnalyzing || !settings.model.trim()} onClick={() => { setSettings((current) => ({ ...current, analysisMode: "full" })); onAnalyze("full"); }}><BookOpen size={17} /><span>重建材料</span><small>较慢，用于纠偏</small></button>
    </div>
    <div className={`reader-panel-state ${state.status}`}>{state.message || "续读恢复会优先帮助你回到前文情境，而不是展示更多索引。"}</div>
    <section className="reader-auto-card">
      <label className="reader-auto-row"><input type="checkbox" checked={settings.analysisMode === "auto"} onChange={toggleAuto} /><span>自动准备恢复卡</span></label>
      <div className="reader-stepper"><span>每读</span><button title="减少页数" onClick={() => adjustThreshold(-1)}><Minus size={14} /></button><b>{settings.autoPageThreshold}</b><button title="增加页数" onClick={() => adjustThreshold(1)}><Plus size={14} /></button><span>页</span></div>
    </section>
    <button className="reader-panel-toggle" onClick={() => setAdvancedOpen((value) => !value)}><span>模型设置</span><ChevronDown size={14} /></button>
    {advancedOpen && <div className="reader-model-panel">
      <div className="reader-provider-row"><button className={settings.provider === "deepseek" ? "active" : ""} onClick={() => updateProvider("deepseek")}>DeepSeek</button><button className={settings.provider === "openai" ? "active" : ""} onClick={() => updateProvider("openai")}>OpenAI</button></div>
      <label>分析模型<input value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} placeholder="deepseek-v4-flash" /></label>
      {settings.provider === "deepseek" && <div className="reader-model-chips" role="group" aria-label="常用 DeepSeek 模型">
        <button type="button" className={settings.model === "deepseek-v4-flash" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, model: "deepseek-v4-flash" }))}>v4-flash</button>
        <button type="button" className={settings.model === "deepseek-v4-pro" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, model: "deepseek-v4-pro" }))}>v4-pro</button>
      </div>}
      <small>回忆卡固定用 deepseek-v4-pro，并开启 thinking。分析可用 flash 或 pro。API Key 只从本机 .env 读取。</small>
    </div>}
  </section>;
}

function RecoveryCard({ card, onClose, onEvidence, onTrack }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const keyPoints = Array.isArray(card.keyPoints) ? card.keyPoints.slice(0, 3) : [];
  const prerequisites = Array.isArray(card.prerequisites) ? card.prerequisites.slice(0, 2) : [];
  const evidence = Array.isArray(card.evidence) ? card.evidence : [];
  useEffect(() => {
    onTrack?.("shown", card);
  }, [onTrack]);
  const hint = sanitizeRecoveryHint(card.question?.hint) || buildRecoveryQuestionHint(card.question?.evidence || evidence[0]);
  return <aside className={`recall-sheet ${card.intensity === "deep" ? "deep" : ""}`} role="dialog" aria-modal="true" aria-label="续读恢复卡">
    <header className="recall-sheet-head">
      <div className="recall-sheet-title">
        <span>{card.absenceLabel || "继续阅读前"}</span>
        <strong>记忆浮现</strong>
      </div>
      <button type="button" className="recall-icon" onClick={() => onClose("skipped")} title="跳过续读恢复" aria-label="跳过续读恢复"><X size={18} /></button>
    </header>

    <div className="recall-sheet-position"><History size={14} /><span>{card.positionLabel || "上次阅读位置"}</span></div>

    <div className="recall-sheet-body">
      <section className="recall-sheet-question" aria-label="主动回忆">
        <p className="recall-sheet-kicker">先想一件事</p>
        <p className="recall-sheet-prompt">{card.question?.prompt}</p>
        {hintOpen && !answerOpen && <div className="recall-sheet-hint">{hint}</div>}
        {answerOpen ? (
          <button type="button" className="recall-sheet-answer" onClick={() => card.question?.evidence && onEvidence(card.question.evidence)} title="跳转到答案出处" aria-label="跳转到答案出处">
            {card.question?.answer}
          </button>
        ) : (
          <div className="recall-sheet-actions">
            <button type="button" className={hintOpen ? "recall-icon active" : "recall-icon"} onClick={() => { onTrack?.("hint", card); setHintOpen(true); }} title="查看提示" aria-label="查看提示"><Lightbulb size={16} /></button>
            <button type="button" className="recall-icon" onClick={() => { onTrack?.("answer", card); setAnswerOpen(true); }} title="查看答案" aria-label="查看答案"><Eye size={16} /></button>
          </div>
        )}
      </section>

      {keyPoints.length > 0 && <section className="recall-sheet-anchors" aria-label="前文关键点">
        <h2>前文关键点</h2>
        <ol className="recall-sheet-steps">
          {keyPoints.map((item, index) => (
            <li key={item.id}>
              <button type="button" onClick={() => item.evidence && onEvidence(item.evidence)} title={item.title} aria-label={item.title}>
                <span className="recall-sheet-step-num" aria-hidden="true">{index + 1}</span>
                <span className="recall-sheet-step-copy">
                  <b>{item.title}</b>
                  <span>{item.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>}

      {prerequisites.length > 0 && <section className="recall-sheet-prereqs" aria-label="当前页前置">
        <h2>理解当前页前</h2>
        <ul>
          {prerequisites.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => item.evidence && onEvidence(item.evidence)} title={item.text} aria-label={item.text}>
                <Lightbulb size={14} />
                <span>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>}

      {evidenceOpen && <section className="recall-sheet-evidence" aria-label="原文证据">
        <h2>原文证据</h2>
        <div>
          {evidence.slice(0, 4).map((item) => (
            <button type="button" key={item.id} onClick={() => onEvidence(item)} title="跳转到原文" aria-label={`跳转到${item.chapterTitle}第${item.paragraphIndex + 1}段`}>
              <small>{item.chapterTitle} · 第 {item.paragraphIndex + 1} 段</small>
              <span>{item.excerpt}</span>
            </button>
          ))}
        </div>
      </section>}
    </div>

    <footer className="recall-sheet-footer">
      <div className="recall-sheet-footer-tools">
        <button
          type="button"
          className={evidenceOpen ? "recall-icon active" : "recall-icon"}
          onClick={() => { onTrack?.("evidence", card); setEvidenceOpen((value) => !value); }}
          title={evidenceOpen ? "收起证据" : "展开证据"}
          aria-label={evidenceOpen ? "收起证据" : "展开证据"}
          aria-pressed={evidenceOpen}
        >
          <Quote size={16} />
        </button>
        <button type="button" className="recall-icon" onClick={() => onTrack?.("remembered", card)} title="想起来了" aria-label="想起来了"><Check size={16} /></button>
        <button type="button" className="recall-icon" onClick={() => onTrack?.("missed", card)} title="还没想起" aria-label="还没想起"><CircleHelp size={16} /></button>
      </div>
      <button type="button" className="recall-icon recall-continue" onClick={() => onClose("continued")} title="继续阅读" aria-label="继续阅读"><BookOpen size={17} /></button>
    </footer>
  </aside>;
}

function buildRecoveryQuestionHint(evidence) {
  const excerpt = cleanRecoveryText(evidence?.excerpt || evidence?.quote || "");
  if (!excerpt || isIncidentalRecoveryText(excerpt)) {
    return "提示：先从上一段具体的主线变化开始想，不必回忆所有细节。";
  }
  const fromExcerpt = hintFromEvidenceExcerpt(excerpt);
  if (fromExcerpt && !isWeakRecoveryHint(fromExcerpt)) return fromExcerpt;
  return "提示：先从这段原文里刚发生的具体变化想起，不必背下全部细节。";
}

function sanitizeRecoveryHint(value) {
  const text = summaryText(value);
  if (!text) return "";
  if (looksTruncatedRecoveryHint(text)) return "";
  if (isWeakRecoveryHint(text)) return "";
  return text.slice(0, 96);
}

function looksTruncatedRecoveryHint(value) {
  const text = String(value || "")
    .replace(/^提示[：:]\s*/, "")
    .replace(/^回到这条线索[—\-–]+\s*/, "")
    .replace(/^先回想[—\-–]+\s*/, "")
    .trim();
  if (!text || text.length < 4) return true;
  if (/^(undefined|null|nan)$/i.test(text)) return true;
  // Peel a trailing stop so wrappers like 「……是清。」 still fail.
  const core = text.replace(/[。！？…]+$/g, "").trim();
  if (!core || core.length < 4) return true;
  if (/[，、：:；;（(\[\{「『《【]$/.test(core)) return true;
  if (/(?:其余的是|除了|以及|还有|就是|乃是|并非|不是)[\u4e00-\u9fff]?$/.test(core)) return true;
  if (/[的地得了着过与和及以于]$/.test(core)) return true;
  if (/(?:人外，|外，其余|是清|是湖|是四|是贵|是江)$/.test(core)) return true;
  const comma = Math.max(core.lastIndexOf("，"), core.lastIndexOf(","));
  if (comma >= 0) {
    const tail = core.slice(comma + 1).trim();
    if (tail.length > 0 && tail.length <= 6 && !/(什么|何处|哪|谁|如何|为何|哪一步)$/.test(tail)) return true;
  }
  return false;
}

function ReaderSearchPanel({ query, setQuery, results, onSelect, recent = [] }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const trimmed = query.trim();
  return <section className="reader-search-panel">
    <label className="reader-panel-search"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="人名、地名、事件或原文" /></label>
    {trimmed ? <div className="reader-search-results">{results.length ? results.map((result) => <button key={`${result.chapterIndex}-${result.paragraphIndex}`} onClick={() => onSelect(result)}><small>{result.chapterTitle} · 第 {result.paragraphIndex + 1} 段</small><span>{highlightMatch(result.excerpt, trimmed)}</span></button>) : <p className="reader-panel-empty">没有找到「{trimmed}」</p>}</div> : recent.length ? <div className="reader-search-results">{recent.map((term) => <button key={term} onClick={() => setQuery(term)}><small>最近搜索</small><span>{term}</span></button>)}</div> : <div className="reader-panel-start"><strong>查找书内原文</strong><span>输入关键词即可定位章节与出处。</span></div>}
  </section>;
}

function BookmarkList({ items, onOpen, onRemove }) {
  return <section className="bookmark-list">
    <header><span><Bookmark size={14} /> 书签</span><small>{items.length}</small></header>
    {items.length ? <div>{[...items].sort((left, right) => right.createdAt - left.createdAt).map((item) => <article key={item.id}><button onClick={() => onOpen(item)}><b>{item.chapterTitle}</b><span>第 {item.pageIndex + 1} 页 · {item.excerpt}</span></button><button className="remove-bookmark" onClick={() => onRemove(item.id)} title="删除书签" aria-label={`删除 ${item.chapterTitle} 的书签`}><X size={14} /></button></article>)}</div> : <p>在正文右上角添加书签。</p>}
  </section>;
}

function NoteList({ items, onOpen, onRemove }) {
  return <section className="bookmark-list note-list">
    <header><span><FileText size={14} /> 笔记</span><small>{items.length}</small></header>
    {items.length ? <div>{[...items].sort((left, right) => right.createdAt - left.createdAt).map((item) => (
      <article key={item.id}>
        <button onClick={() => onOpen(item)}>
          <b>{item.selection || item.content}</b>
          <span>{item.chapterTitle} · 第 {item.pageIndex + 1} 页</span>
          {item.selection ? <em className="note-list-body">{item.content}</em> : null}
        </button>
        <button className="remove-bookmark" onClick={() => onRemove(item.id)} title="删除笔记" aria-label={`删除 ${item.chapterTitle} 的笔记`}><X size={14} /></button>
      </article>
    ))}</div> : <p>选中文字后，可在辅助工具盘中添加笔记。</p>}
  </section>;
}

function NoteComposer({ draft, setDraft, selection, onClose, onSave }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="note-composer" role="dialog" aria-modal="true" aria-label="添加笔记" onMouseDown={(event) => event.stopPropagation()}><header><div><span>选中文本</span><strong>{selection}</strong></div><button onClick={onClose} title="关闭"><X size={18} /></button></header><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写下你的想法…" autoFocus /><footer><button className="text-action" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.trim()} onClick={onSave}>保存笔记</button></footer></section></div>;
}

function BookCover({ book }) {
  if (book.cover) return <img src={book.cover} alt={`《${book.title}》封面`} />;
  return <div className="fallback-book-cover"><span>{book.bookType || "本地书籍"}</span><strong>{book.title}</strong><small>{APP_NAME}</small></div>;
}

function DeleteBookConfirmModal({ book, onCancel, onConfirm }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}><section className="delete-book-modal" role="dialog" aria-modal="true" aria-label="确认删除书籍" onMouseDown={(event) => event.stopPropagation()}><header><div><span>删除书籍</span><h2>确认删除《{book.title}》？</h2></div><button onClick={onCancel} title="关闭"><X size={18} /></button></header><p>这会从当前书架移除这本书。你的本地原始文件不会被删除，但本应用内与该导入项关联的入口会消失。</p><footer><button className="text-action" onClick={onCancel}>取消</button><button className="danger-button" onClick={onConfirm}>确认删除</button></footer></section></div>;
}

function normalizeReadingIndex(index = {}, book = null) {
  const people = [];
  const organizations = [];
  const withEvidence = (items) => (Array.isArray(items) ? items : []).filter((item) => hasIndexEvidence(item, book));
  withEvidence(index.people).forEach((item) => {
    const name = summaryText(item?.name);
    if (!name) return;
    if (isOrganizationName(name)) organizations.push({ ...item, name, attributes: [] });
    else if (isReliablePersonName(name)) people.push({ ...item, name });
  });
  withEvidence(index.organizations).forEach((item) => {
    const name = summaryText(item?.name);
    if (name) organizations.push({ ...item, name, attributes: [] });
  });
  const uniqueByName = (items) => Array.from(new Map(items.map((item) => [item.name, item])).values());
  return {
    people: uniqueByName(people),
    organizations: uniqueByName(organizations),
    places: withEvidence(index.places).filter((item) => summaryText(item?.name)),
    timeline: normalizeTimelineItems(withEvidence(index.timeline)),
    relationships: withEvidence(index.relationships).filter((item) => summaryText(item?.source) && summaryText(item?.target) && summaryText(item?.relation)),
  };
}

function hasIndexEvidence(item, book = null) {
  const evidence = item?.evidence || item?.occurrence || item?.occurrences?.[0];
  if (evidence?.chapterIndex == null || evidence?.paragraphIndex == null) return false;
  const chapterIndex = Number(evidence.chapterIndex);
  const paragraphIndex = Number(evidence.paragraphIndex);
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex) || chapterIndex < 0 || paragraphIndex < 0) return false;
  if (!book?.chapters?.length) return true;
  const chapter = book.chapters.find((candidate, index) => (candidate.sourceChapterIndex ?? index) === chapterIndex)
    || book.chapters[chapterIndex];
  return Boolean(chapter && Array.isArray(chapter.paragraphs) && paragraphIndex < chapter.paragraphs.length);
}

function contextualRelationships(relationships = [], context = {}) {
  const pageParagraphIndexes = (context.pageParagraphs || [])
    .map((item) => item.paragraphIndex)
    .filter(Number.isInteger);
  const minParagraph = pageParagraphIndexes.length ? Math.min(...pageParagraphIndexes) : Number(context.selectedParagraph || 0);
  const maxParagraph = pageParagraphIndexes.length ? Math.max(...pageParagraphIndexes) : Number(context.selectedParagraph || 0);
  const entityNamesOnPage = new Set(["people", "organizations"]
    .flatMap((key) => context.index?.[key] || [])
    .filter((entry) => (entry.occurrences || []).some((occurrence) => (
      occurrence.chapterIndex === context.chapterIndex
      && occurrence.paragraphIndex >= minParagraph - 2
      && occurrence.paragraphIndex <= maxParagraph + 2
    )))
    .map((entry) => entry.name)
    .filter(Boolean));

  return (relationships || [])
    .filter(hasIndexEvidence)
    .map((relationship) => {
      const evidence = relationship.evidence || relationship.occurrence || relationship.occurrences?.[0] || {};
      return { ...relationship, evidence };
    })
    .filter((relationship) => {
      const evidence = relationship.evidence || {};
      if (Number(evidence.chapterIndex) > Number(context.chapterIndex)) return false;
      const sameChapter = Number(evidence.chapterIndex) === Number(context.chapterIndex);
      const nearPage = sameChapter
        && Number(evidence.paragraphIndex) >= minParagraph - 8
        && Number(evidence.paragraphIndex) <= maxParagraph + 8;
      const endpointOnPage = entityNamesOnPage.has(relationship.source) || entityNamesOnPage.has(relationship.target);
      return nearPage || endpointOnPage;
    })
    .sort((left, right) => {
      const leftPrimary = left.importance === "primary" ? 1 : 0;
      const rightPrimary = right.importance === "primary" ? 1 : 0;
      const leftDistance = Math.abs(Number(left.evidence?.paragraphIndex || 0) - maxParagraph);
      const rightDistance = Math.abs(Number(right.evidence?.paragraphIndex || 0) - maxParagraph);
      return rightPrimary - leftPrimary || leftDistance - rightDistance;
    })
    .slice(0, 5);
}

function hasReadingIndexContent(index = {}) {
  return ["people", "organizations", "places", "timeline", "relationships"].some((key) => Array.isArray(index[key]) && index[key].length > 0);
}

function isReliablePersonName(value) {
  const name = summaryText(value);
  if (!/^[\u4e00-\u9fff]{2,4}$/.test(name)) return false;
  if (COMMON_NON_PERSON_TERMS.has(name)) return false;
  if (/^(他们|她们|我们|你们|自己|这里|那里|这个|那个|一种|一个|一些|有人|没有|可以|已经|正在|需要|由于|因为|所以|但是|如果|后来|同时)/.test(name)) return false;
  if (/(知道|就是|报告|原文|证据|内容|地方|时候|方面|情况|问题|会议|命令|路线|战斗|政治|军事|历史)$/.test(name)) return false;
  return true;
}

function isOrganizationName(value) {
  const name = summaryText(value);
  return /(军团|方面军|集团军|红军|白军|桂军|黔军|川军|滇军|湘军|部队|纵队|支队|机关|总部|司令部|委员会|政府|军委|联军|联盟|公司|学校|大学|学院|协会|组织)$/.test(name)
    || /^(红|白|桂|黔|川|滇|湘|中央|南京|国民党|共产党|中共).*(军|党|政府|军委|委员会|机关|总部|司令部)$/.test(name);
}

const COMMON_NON_PERSON_TERMS = new Set([
  "他们知",
  "他知",
  "也就是",
  "报告",
  "原文",
  "证据",
  "红军",
  "白军",
  "部队",
  "军团",
  "方面",
  "地方",
  "情况",
  "问题",
  "会议",
  "命令",
  "地图",
  "路线",
  "战斗",
  "侦察",
  "政治",
  "军事",
  "群众",
  "历史",
]);
function normalizeTimelineItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const quote = summaryText(item?.evidenceQuote || item?.evidence?.quote);
    const rawName = summaryText(item?.name || item?.date || item?.title);
    const rawSubtitle = summaryText(item?.subtitle || item?.title || item?.summary);
    const rawDetail = summaryText(item?.detail || item?.summary || item?.subtitle);
    if (!rawName && !rawSubtitle && !rawDetail && !quote) return null;
    const name = rawName || `时间节点 ${index + 1}`;
    const subtitle = rawSubtitle || quote.slice(0, 24);
    const detail = rawDetail || quote;
    const occurrence = item?.occurrence || item?.occurrences?.[0] || { chapterIndex: 0, paragraphIndex: 0 };
    return {
      ...item,
      id: item?.id || `timeline-${index}-${name}`,
      name,
      subtitle,
      detail,
      occurrence,
      occurrences: Array.isArray(item?.occurrences) && item.occurrences.length ? item.occurrences : [occurrence],
    };
  }).filter(Boolean).sort((a, b) => {
    const aKey = Number.isFinite(a.sortKey) ? a.sortKey : Number.MAX_SAFE_INTEGER;
    const bKey = Number.isFinite(b.sortKey) ? b.sortKey : Number.MAX_SAFE_INTEGER;
    return aKey - bKey;
  });
}

function isImportantEntry(item, index, kind) {
  if (item.priority === "primary") return true;
  if (item.priority === "secondary") return false;
  if (kind === "timeline") return item.historicalWeight === "major";
  return item.importanceScore >= 3 || (!item.priority && index < 3 && item.importanceScore >= 2);
}

function getRecentIndexEntries(items, activeCursor) {
  const readable = activeCursor ? items.filter((item) => isEntryBeforeCursor(item, activeCursor)) : items;
  return readable
    .sort((left, right) => compareEntryPosition(right, left))
    .slice(0, 6);
}

function isEntryBeforeCursor(item, cursor) {
  const position = item.occurrence || item.occurrences?.[0];
  if (!position) return false;
  if (position.chapterIndex < cursor.chapterIndex) return true;
  if (position.chapterIndex > cursor.chapterIndex) return false;
  return position.paragraphIndex <= (cursor.paragraphIndex ?? Number.MAX_SAFE_INTEGER);
}

function compareIndexEntries(left, right) {
  const priorityDelta = priorityRank(right) - priorityRank(left);
  if (priorityDelta) return priorityDelta;
  return compareEntryPosition(left, right);
}

function priorityRank(item) {
  if (item.priority === "primary") return 3;
  if (item.historicalWeight === "major" || item.importanceScore >= 3) return 2;
  if (item.priority === "secondary") return 0;
  return 1;
}

function compareEntryPosition(left, right) {
  const leftPosition = left.occurrence || left.occurrences?.[0] || {};
  const rightPosition = right.occurrence || right.occurrences?.[0] || {};
  return (leftPosition.chapterIndex ?? 0) - (rightPosition.chapterIndex ?? 0) || (leftPosition.paragraphIndex ?? 0) - (rightPosition.paragraphIndex ?? 0);
}

function isNonNarrativeChapter(title) {
  return /^(序|序言|前言|引言|代序|后记|跋|再版序|出版说明|版权页|目录)/.test(title.trim());
}

function isPublicationMetadata(paragraph) {
  return /(ISBN|CIP|版权所有|版权|版次|印刷|印装|质量问题|销售中心|出版(?:社|日期|发行|信息)?|责任编辑|装帧|开本|定价|字数|邮编|网址|http|www\.|数据核字|图书馆|新华书店|印务|开本|印张|纪实文学|分类号|[ⅠⅡⅢⅣ]\.|第\s*\d+\s*版|第\s*\d+\s*次印刷|本书由)/i.test(paragraph);
}

function searchBook(chapters, query) {
  const keyword = query.trim();
  if (!keyword) return [];
  const results = [];
  chapters.forEach((chapter, chapterIndex) => {
    chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
      const text = paragraphPlainText(paragraph);
      if (!text) return;
      const matchIndex = text.indexOf(keyword);
      if (matchIndex < 0) return;
      const start = Math.max(0, matchIndex - 32);
      const end = Math.min(text.length, matchIndex + keyword.length + 54);
      results.push({ chapterIndex, chapterTitle: chapter.title, paragraphIndex, excerpt: `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}` });
    });
  });
  return results.slice(0, 50);
}

function createBookFingerprint(parsed, file) {
  const extension = getFileExtension(file) || String(parsed.format || "book").toLowerCase();
  const basis = [
    extension,
    parsed.title,
    parsed.creator,
    parsed.publisher,
    file?.name,
    file?.size,
    parsed.chapters?.length,
    parsed.chapters?.[0]?.title,
  ].map((part) => String(part || "").trim().toLowerCase()).join("|");
  return `${extension || "book"}:${basis}`;
}

function isEpubLibraryBook(book) {
  if (!book || book.format === "PDF") return false;
  if (book.builtIn || book.format === "EPUB") return true;
  if (String(book.fingerprint || "").startsWith("epub:")) return true;
  return String(book.fileName || "").toLowerCase().endsWith(".epub");
}

/** True when an IndexedDB EPUB was parsed before inline images were kept. */
function needsEpubContentReparse(book) {
  return isEpubLibraryBook(book) && book.contentParseVersion !== EPUB_CONTENT_PARSE_VERSION;
}

function createClassificationPayload(book) {
  return {
    title: book.title,
    creator: book.creator,
    publisher: book.publisher,
    language: book.language,
    tableOfContents: book.chapters.slice(0, 18).map((chapter) => chapter.title),
    sampleText: book.chapters.slice(0, 4).map((chapter) => ({
      title: chapter.title,
      paragraphs: chapter.paragraphs.slice(0, 4).map((paragraph) => paragraphPlainText(paragraph).slice(0, 360)).filter(Boolean),
    })),
  };
}

function getFileExtension(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "";
}

function localFormatLabel(book) {
  return `本地 ${book?.format || "EPUB"}`;
}

function SearchDialog({ book, query, setQuery, results, onSelect, onClose }) {
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState(() => loadSearchRecent(book));
  const trimmed = query.trim();
  const hasQuery = Boolean(trimmed);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmed, results.length]);

  useEffect(() => {
    const active = listRef.current?.querySelector?.("[aria-selected='true']");
    active?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, hasQuery, results.length]);

  function clearRecent() {
    saveSearchRecent(book, []);
    setRecent([]);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!hasQuery || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) onSelect(item);
    }
  }

  return <>
    <div className="reader-search-backdrop" role="presentation" onMouseDown={onClose} />
    <section
      id="reader-search-dialog"
      className="reader-search-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="搜索书内内容"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="reader-search-dialog-head">
        <Search size={17} aria-hidden="true" />
        <div className="reader-search-field">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="人名、地名、事件或原文"
            aria-label="搜索书内内容"
            autoComplete="off"
            spellCheck={false}
          />
          {hasQuery ? (
            <button
              type="button"
              className="reader-search-clear"
              onClick={() => setQuery("")}
              title="清空搜索词"
              aria-label="清空搜索词"
            >
              清空
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="reader-search-close"
          onClick={onClose}
          title="关闭搜索 (Esc)"
          aria-label="关闭搜索面板"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {hasQuery ? (
        <div className="reader-search-dialog-body" ref={listRef}>
          {results.length ? (
            <>
              <div className="reader-search-meta"><span>{results.length} 处出处</span><span className="reader-search-hint" title="方向键选择，回车打开">↑↓ Enter</span></div>
              <div className="reader-search-hit-list" role="listbox" aria-label="搜索结果">
                {results.map((result, index) => (
                  <button
                    key={`${result.chapterIndex}-${result.paragraphIndex}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? "active" : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelect(result)}
                  >
                    <small><span>{result.chapterTitle}</span><i>第 {result.paragraphIndex + 1} 段</i></small>
                    <b>{highlightMatch(result.excerpt, trimmed)}</b>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="reader-search-dialog-empty">
              <strong>没有找到「{trimmed}」</strong>
              <span>试试更短的词，或换一个称呼。</span>
            </div>
          )}
        </div>
      ) : (
        <div className="reader-search-dialog-body idle">
          {recent.length ? (
            <div className="reader-search-recent">
              <header>
                <span>最近搜索</span>
                <button type="button" onClick={clearRecent} title="清空最近搜索" aria-label="清空最近搜索">清空</button>
              </header>
              <ul>
                {recent.map((term) => (
                  <li key={term}>
                    <button type="button" onClick={() => setQuery(term)}>
                      <Clock3 size={14} aria-hidden="true" />
                      <span>{term}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="reader-search-dialog-empty quiet">
              <strong>查找书内原文</strong>
              <span>输入关键词即可定位章节与出处。定位原文，不是回忆。</span>
            </div>
          )}
        </div>
      )}
    </section>
  </>;
}

function loadSearchRecent(book) {
  return loadStored(searchRecentStorageKey(book), []).filter((item) => typeof item === "string" && item.trim()).slice(0, 8);
}

function saveSearchRecent(book, items) {
  if (!book) return;
  localStorage.setItem(searchRecentStorageKey(book), JSON.stringify(items));
}

function rememberSearchQuery(book, query) {
  const trimmed = String(query || "").trim();
  if (!book || !trimmed) return;
  const next = [trimmed, ...loadSearchRecent(book).filter((item) => item !== trimmed)].slice(0, 8);
  saveSearchRecent(book, next);
}

function searchRecentStorageKey(book) {
  return `shumai-search-recent:${storageBookIdentity(book)}`;
}

function highlightMatch(text, query) {
  const source = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) return source;
  const lowerSource = source.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const nodes = [];
  let cursor = 0;
  let index = lowerSource.indexOf(lowerNeedle);
  let key = 0;
  while (index >= 0) {
    if (index > cursor) nodes.push(<span key={`t-${key++}`}>{source.slice(cursor, index)}</span>);
    nodes.push(<mark key={`m-${key++}`}>{source.slice(index, index + needle.length)}</mark>);
    cursor = index + needle.length;
    index = lowerSource.indexOf(lowerNeedle, cursor);
  }
  if (cursor < source.length) nodes.push(<span key={`t-${key++}`}>{source.slice(cursor)}</span>);
  return nodes;
}

function ImportProgressModal({ status }) {
  const progress = status.total ? Math.round((status.current / status.total) * 100) : 0;
  return <div className="import-progress-backdrop" role="status" aria-live="polite"><section className="import-progress-card"><div className="import-orbit" aria-hidden="true"><i /><i /><i /></div><div><span>导入书籍</span><h2>{status.stage}</h2><p>{status.title || "正在准备书籍文件"}</p></div><div className="import-progress-line"><i style={{ width: `${progress}%` }} /></div><footer><span>{status.current || 0} / {status.total || 1} 本</span><span>{status.classified || 0} 本已分类</span>{!!status.failed && <span>{status.failed} 本失败</span>}</footer></section></div>;
}

function CategoryModal({ categories, selected, newCategory, setNewCategory, onAdd, onToggle, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="category-modal" role="dialog" aria-modal="true" aria-label="管理图书分类" onMouseDown={(event) => event.stopPropagation()}><header><div><span>图书分类</span><h2>整理《长征》</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header><p>选择这本书所属的分类。分类与阅读进度只保存在当前浏览器。</p><div className="category-checks">{categories.map((category) => <label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={() => onToggle(category)} /><span>{category}</span><i><Check size={13} /></i></label>)}</div><form onSubmit={onAdd}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="新建分类，例如：长篇纪实" /><button className="text-action" type="submit"><FolderPlus size={16} /> 新建</button></form><footer><button className="primary-button" onClick={onClose}>完成</button></footer></section></div>;
}

function AnalysisSummaryModal({ summary, onClose }) {
  const safeSummary = normalizeAnalysisSummary(summary);
  const cursor = summary.cursor || {};
  const checkpointLabel = cursor.scope === "full" ? `已完成全书分析 · 至第 ${Number(cursor.chapterIndex || 0) + 1} 节末` : `已分析至 第 ${Number(cursor.chapterIndex || 0) + 1} 节 · 第 ${Number(cursor.pageIndex || 0) + 1} / ${cursor.pageCount || 1} 页`;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="analysis-summary-modal" role="dialog" aria-modal="true" aria-label="本轮阅读分析摘要" onMouseDown={(event) => event.stopPropagation()}><header><div><span>阅读记忆已更新</span><h2>本轮分析摘要</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header><div className="analysis-checkpoint">{checkpointLabel}</div><SummaryEntitySection title="人物" value={safeSummary.people} empty="本轮未确认新的核心人物" /><SummaryEntitySection title="组织" value={safeSummary.organizations} empty="本轮未确认新的关键组织" /><SummaryEntitySection title="地点" value={safeSummary.places} empty="本轮未确认新的关键地点" /><section><h3>关键事件</h3><ul>{safeSummary.events.length ? safeSummary.events.map((event) => <li key={event}>{event}</li>) : <li>本轮未确认新的主线事件</li>}</ul></section><footer><button className="primary-button" onClick={onClose}>继续阅读</button></footer></section></div>;
}

function SummaryEntitySection({ title, value, empty }) {
  const groups = normalizeSummaryGroups(value);
  return <section><h3>{title}</h3>{groups.primary.length ? <p><b>主要：</b>{groups.primary.join("、")}</p> : <p>{empty}</p>}{groups.recent.length > 0 && <p><b>最近：</b>{groups.recent.join("、")}</p>}{groups.secondary.length > 0 && <p><b>次级：</b>{groups.secondary.join("、")}</p>}</section>;
}

function normalizeAnalysisSummary(summary = {}) {
  return {
    ...summary,
    people: normalizeSummaryGroups(summary.people),
    organizations: normalizeSummaryGroups(summary.organizations),
    places: normalizeSummaryGroups(summary.places),
    events: normalizeSummaryEvents(summary.events),
  };
}

function normalizeSummaryGroups(value) {
  const fromList = (items) => (Array.isArray(items) ? items.map(summaryText).filter(Boolean) : []);
  if (Array.isArray(value)) return { primary: fromList(value), recent: [], secondary: [] };
  return {
    primary: fromList(value?.primary),
    recent: fromList(value?.recent),
    secondary: fromList(value?.secondary),
  };
}

function normalizeSummaryEvents(events) {
  return (Array.isArray(events) ? events : []).map(summaryText).filter(Boolean);
}

function normalizeRecoveryCard(card, fallback = null) {
  if (!card || typeof card !== "object") return fallback;
  const evidence = normalizeRecoveryEvidenceList(card.evidence?.length ? card.evidence : fallback?.evidence);
  const resolveItemEvidence = (item) => normalizeRecoveryEvidence(item?.evidence);
  const keyPoints = (Array.isArray(card.keyPoints) ? card.keyPoints : [])
    .map((item, index) => ({
      id: item?.id || `ai-point-${index}`,
      memoryKey: item?.memoryKey || resolveItemEvidence(item)?.memoryKey || fallback?.keyPoints?.[index]?.memoryKey,
      title: summaryText(item?.title) || fallback?.keyPoints?.[index]?.title || `关键点 ${index + 1}`,
      detail: summaryText(item?.detail) || "",
      evidence: resolveItemEvidence(item),
    }))
    .filter((item) => {
      if (!item.detail || !item.evidence) return false;
      if (isBroadMegaTopic(item.title) && !hasConcreteEpisodeCue(`${item.title} ${item.detail}`)) return false;
      return true;
    })
    .slice(0, 3);
  if (keyPoints.length < 2) return fallback;
  const prerequisites = (Array.isArray(card.prerequisites) ? card.prerequisites : [])
    .map((item, index) => ({
      id: item?.id || `ai-prereq-${index}`,
      memoryKey: item?.memoryKey || resolveItemEvidence(item)?.memoryKey || fallback?.prerequisites?.[index]?.memoryKey,
      text: summaryText(item?.text) || "",
      evidence: resolveItemEvidence(item),
    }))
    .filter((item) => item.text && item.evidence)
    .slice(0, 2);
  const questionEvidence = resolveItemEvidence(card.question) || normalizeRecoveryEvidence(fallback?.question?.evidence);
  const chapterTitle = questionEvidence?.chapterTitle
    || keyPoints[0]?.evidence?.chapterTitle
    || fallback?.question?.prompt?.match(/《([^》]+)》/)?.[1]
    || "当前章节";
  const fallbackAnchor = preferQuestionAnchor(
    keyPoints.map((item) => ({
      name: item.title,
      title: item.title,
      summary: item.detail,
      detail: item.detail,
      kind: /概念|定义|机制/.test(`${item.title}${item.detail}`) ? "concept" : "event",
      priority: "primary",
      evidence: item.evidence,
    })),
  ) || {
    name: keyPoints[0]?.title,
    title: keyPoints[0]?.title,
    summary: keyPoints[0]?.detail || questionEvidence?.excerpt,
    detail: keyPoints[0]?.detail || questionEvidence?.excerpt,
    kind: "event",
  };
  const repaired = sanitizeModelRecoveryQuestion(
    {
      prompt: summaryText(card.question?.prompt) || fallback?.question?.prompt || "",
      hint: summaryText(card.question?.hint) || fallback?.question?.hint || "",
      answer: summaryText(card.question?.answer) || fallback?.question?.answer || "",
    },
    {
      chapterTitle,
      fallbackAnchor,
      evidenceExcerpt: questionEvidence?.excerpt || keyPoints[0]?.detail || "",
    },
  );
  const hint = sanitizeRecoveryHint(repaired.hint) || "";
  const prompt = summaryText(repaired.prompt)
    || (!isWeakRecoveryQuestion(fallback?.question?.prompt, { answer: fallback?.question?.answer })
      ? summaryText(fallback?.question?.prompt)
      : "")
    || questionFromEpisodeAnchor(fallbackAnchor, chapterTitle);
  return {
    intensity: ["light", "medium", "deep", "fresh"].includes(card.intensity) ? card.intensity : fallback?.intensity || "medium",
    absenceLabel: summaryText(card.absenceLabel) || fallback?.absenceLabel || "继续阅读前",
    positionLabel: summaryText(card.positionLabel) || fallback?.positionLabel || "上次阅读位置",
    keyPoints,
    prerequisites: prerequisites.length ? prerequisites : fallback?.prerequisites || [],
    question: {
      memoryKey: card.question?.memoryKey || questionEvidence?.memoryKey || fallback?.question?.memoryKey,
      prompt,
      hint,
      answer: summaryText(repaired.answer) || fallback?.question?.answer || "",
      evidence: questionEvidence || fallback?.question?.evidence || null,
    },
    evidence,
  };
}

function normalizeRecoveryEvidenceList(items = []) {
  return (Array.isArray(items) ? items : []).map(normalizeRecoveryEvidence).filter(Boolean).slice(0, 8);
}

function normalizeRecoveryEvidence(item) {
  if (!item || typeof item !== "object") return null;
  const cite = item.cite || {};
  const excerpt = summaryText(item.excerpt || item.quote || cite.quote);
  if (!excerpt) return null;
  const chapterIndex = Number(item.chapterIndex ?? cite.chapterIndex);
  const paragraphIndex = Number(item.paragraphIndex ?? cite.paragraphIndex);
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex) || chapterIndex < 0 || paragraphIndex < 0) return null;
  return {
    ...item,
    id: item.id || cite.id || `recovery-${chapterIndex}-${paragraphIndex}`,
    memoryKey: item.memoryKey || recoveryMemoryKey("evidence", excerpt, { chapterIndex, paragraphIndex }),
    chapterIndex,
    paragraphIndex,
    chapterTitle: summaryText(item.chapterTitle || cite.chapterTitle || cite.source) || "原文",
    excerpt,
    quote: excerpt,
    cite: {
      ...cite,
      label: cite.label || cite.id || "[C]",
      quote: excerpt,
    },
    matchSources: Array.isArray(item.matchSources) ? item.matchSources : ["contextcite"],
  };
}

function buildTraceRecoveryCard(book, indexOrMemory = {}, savedPosition = {}, lastActivity = null, bookMemoryOrTrace = null, memoryState = {}) {
  const bookMemory = normalizeBookMemory(
    hasBookMemoryContent(indexOrMemory) || indexOrMemory?.version
      ? indexOrMemory
      : bookMemoryOrTrace?.version || hasBookMemoryContent(bookMemoryOrTrace)
        ? bookMemoryOrTrace
        : bookMemoryFromLegacy({ index: indexOrMemory, traceMemory: bookMemoryOrTrace }),
    { bookId: book?.id || book?.title || "book" },
  );
  if (!book?.chapters?.length || !hasBookMemoryContent(bookMemory)) return null;
  const cursor = normalizeRecoveryCursor(book, savedPosition);
  const currentPageText = (book.chapters[cursor.chapterIndex]?.paragraphs || [])
    .slice(Math.max(0, (cursor.paragraphIndex || 0) - 2), (cursor.paragraphIndex || 0) + 1)
    .map((item) => (typeof item === "object" ? item.text : item))
    .filter(Boolean)
    .join("\n");
  const plan = buildRecoveryPlan({
    book,
    bookMemory,
    cursor,
    currentPageText,
    lastActivity,
    reader: memoryState?.reader || memoryState,
    minAbsenceMs: RECOVERY_CARD_MIN_ABSENCE_MS,
  });
  if (!plan || plan.suppressed) return null;
  return {
    intensity: plan.intensity,
    absenceLabel: plan.absenceLabel,
    positionLabel: plan.positionLabel,
    keyPoints: plan.keyPoints,
    prerequisites: plan.prerequisites,
    question: plan.question,
    evidence: plan.evidence,
  };
}

function normalizeRecoveryCursor(book, savedPosition = {}) {
  const chapterIndex = Math.min(Math.max(Number(savedPosition.chapterIndex || 0), 0), book.chapters.length - 1);
  const pageIndex = Math.max(Number(savedPosition.pageIndex || 0), 0);
  const pageWindow = paginateChapterWindow(
    book.chapters[chapterIndex],
    pageIndex,
    savedPosition.pageWidth || 900,
    savedPosition.pageHeight || 720,
  );
  const pageParagraphs = pageWindow.items.map((item) => item.paragraphIndex).filter(Number.isInteger);
  return {
    chapterIndex,
    pageIndex,
    paragraphIndex: Number.isInteger(savedPosition.paragraphIndex)
      ? savedPosition.paragraphIndex
      : pageParagraphs.length ? Math.max(...pageParagraphs) : Math.max(0, (book.chapters[chapterIndex]?.paragraphs || []).length - 1),
  };
}

function hasRecoverablePriorContext(book, cursor) {
  if (!book?.chapters?.length) return false;
  if (cursor.chapterIndex > 0 || cursor.pageIndex > 0) return true;
  return Number(cursor.paragraphIndex || 0) >= 2;
}

function collectTraceRecoveryAnchors(index = {}, cursor, bookMemoryOrTrace = null, memoryState = {}) {
  const bookMemory = normalizeBookMemory(
    bookMemoryOrTrace?.version || hasBookMemoryContent(bookMemoryOrTrace)
      ? bookMemoryOrTrace
      : bookMemoryFromLegacy({ index, traceMemory: bookMemoryOrTrace }),
  );
  const memoryAnchors = collectMemoryAnchors(bookMemory, cursor, {
    ...memoryState,
    lastActivityAt: memoryState?.lastActivityAt || null,
  }).map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    title: item.name,
    detail: item.summary,
    summary: item.summary,
    priority: item.priority,
    occurrence: item.evidence,
    evidence: item.evidence,
    memoryKey: item.id,
    score: item.score,
  }));
  const ordered = [
    ...memoryAnchors,
    ...traceEntries(index.timeline, "timeline"),
    ...traceEntries(index.relationships, "relationship"),
    ...traceEntries(index.organizations, "organization"),
    ...traceEntries(index.people, "person"),
    ...traceEntries(index.places, "place"),
  ].filter((item) => isTraceEntryBeforeCursor(item, cursor));
  return uniqueTraceAnchors(ordered)
    .sort((left, right) => {
      const leftScore = (left.score || 0) + recoveryAnchorScore(left, cursor, memoryState) + readerForgettingScore({ memoryKey: left.memoryKey || left.id, reader: memoryState }) * 0.2;
      const rightScore = (right.score || 0) + recoveryAnchorScore(right, cursor, memoryState) + readerForgettingScore({ memoryKey: right.memoryKey || right.id, reader: memoryState }) * 0.2;
      return rightScore - leftScore;
    })
    .slice(0, 6)
    .map(traceEntryToRecoveryAnchor)
    .filter((item) => item.title && item.detail && item.evidence);
}

function traceMemoryEntries(traceMemory = null) {
  return (traceMemory?.anchors || []).flatMap((anchor) => (anchor.items || []).map((item) => {
    const evidence = normalizeRecoveryEvidence(item.evidence || item);
    return {
      id: `${anchor.id}:${item.title || item.name || evidence?.id || Math.random()}`,
      kind: anchor.id || "memory",
      name: summaryText(item.title || item.name || anchor.label),
      title: summaryText(item.title || item.name || anchor.label),
      detail: summaryText(item.summary || item.detail || item.reason || evidence?.excerpt),
      summary: summaryText(item.summary || item.detail || item.reason || evidence?.excerpt),
      priority: item.priority || "primary",
      occurrence: evidence ? { chapterIndex: evidence.chapterIndex, paragraphIndex: evidence.paragraphIndex } : item.occurrence,
      evidence,
      cite: evidence?.cite,
    };
  })).filter((item) => item.title && item.detail && item.evidence);
}

function traceEntries(items = [], kind) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item, kind })).filter((item) => summaryText(item.name || item.title || item.source || item.target));
}

function isTraceEntryBeforeCursor(item, cursor) {
  const occurrence = item.occurrence || item.evidence || {};
  const chapterIndex = Number(occurrence.chapterIndex);
  const paragraphIndex = Number(occurrence.paragraphIndex);
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex)) return false;
  return chapterIndex < cursor.chapterIndex || (chapterIndex === cursor.chapterIndex && paragraphIndex <= cursor.paragraphIndex);
}

function recoveryAnchorScore(item, cursor, memoryState = {}) {
  const occurrence = item.occurrence || item.evidence || {};
  const primary = item.priority === "primary" || item.importance === "primary" ? 100 : item.priority === "recent" ? 78 : 25;
  const kindWeight = { events: 42, plot: 40, concepts: 38, mechanisms: 38, timeline: 36, relationship: 34, organizations: 28, organization: 28, people: 24, person: 24, places: 16, place: 16 }[item.kind] || 30;
  const detail = summaryText(item.detail || item.summary || item.subtitle || item.relation || item.evidenceQuote || item.evidence?.quote);
  const title = summaryText(item.name || item.title);
  const mainline = recoveryMainlineScore(detail);
  const chapterDistance = Math.max(0, cursor.chapterIndex - Number(occurrence.chapterIndex || 0));
  const proximity = Math.max(0, 24 - chapterDistance * 8);
  const memoryKey = recoveryMemoryKey(item.kind || "trace", item.name || item.title || `${item.source || ""}-${item.target || ""}`, occurrence);
  const memoryBoost = recoveryForgettingBoost(memoryState[memoryKey], occurrence, cursor);
  const broadPenalty = isBroadMegaTopic(title) && !hasConcreteEpisodeCue(`${title} ${detail}`) ? -40 : 0;
  return primary + kindWeight + mainline + proximity + memoryBoost + broadPenalty;
}

function uniqueTraceAnchors(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.kind}:${summaryText(item.name || item.title || `${item.source}-${item.target}`)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function traceEntryToRecoveryAnchor(item) {
  const occurrence = item.occurrence || item.evidence || {};
  const evidence = normalizeRecoveryEvidence({
    id: item.id,
    chapterIndex: occurrence.chapterIndex,
    paragraphIndex: occurrence.paragraphIndex,
    chapterTitle: item.chapterTitle || item.evidence?.chapterTitle,
    excerpt: item.evidenceQuote || item.evidence?.quote || item.detail || item.summary,
    quote: item.evidenceQuote || item.evidence?.quote || item.detail || item.summary,
    cite: item.cite,
    matchSources: ["trace"],
  });
  const title = recoveryAnchorTitle(item);
  const detail = recoveryAnchorDetail(item, evidence?.excerpt);
  return {
    kind: item.kind,
    memoryKey: recoveryMemoryKey(item.kind || "trace", title, occurrence),
    title,
    detail,
    prerequisite: recoveryPrerequisiteFromAnchor(item, title),
    evidence,
  };
}

function recoveryAnchorTitle(item) {
  if (item.kind === "relationship") return summaryText(`${item.source}—${item.target}`).slice(0, 18);
  if (item.kind === "timeline") return summaryText(item.subtitle || item.name || item.title).slice(0, 18);
  return summaryText(item.name || item.title).slice(0, 18);
}

function recoveryAnchorDetail(item, fallback = "") {
  if (item.kind === "relationship") {
    return summaryText(`${item.source}与${item.target}的关系是：${item.relation || "主线相关"}`).slice(0, 96);
  }
  return summaryText(item.detail || item.summary || item.subtitle || fallback).slice(0, 96);
}

function buildTracePrerequisites(anchors, chapterTitle = "当前章节") {
  return anchors.slice(0, 2).map((item, index) => ({
    id: `trace-prereq-${index}`,
    text: item.prerequisite || `继续读《${chapterTitle}》前，先接上：${item.title}。`,
    evidence: item.evidence,
  })).filter((item) => item.text && item.evidence);
}

function recoveryPrerequisiteFromAnchor(item, title) {
  if (item.kind === "timeline") return `当前页承接前文的关键事件：${title}。忘记它会影响对后续因果的理解。`;
  if (item.kind === "relationship") return `先想起这条关系变化：${title}。它会影响当前人物或组织行为的判断。`;
  if (item.kind === "organization") return `先记起这个组织在前文中的作用：${title}。当前页常在延续它的决策或行动。`;
  if (item.kind === "person") return `先记起这个人物为什么进入主线：${title}。不要只记名字，要记住他推动了什么。`;
  return `先记起这个地点和主线的关系：${title}。它通常代表行动空间或形势变化。`;
}

function recoveryQuestionFromAnchor(anchor, chapterTitle = "当前章节") {
  return questionFromEpisodeAnchor(anchor, chapterTitle);
}

function flattenRecoverySource(chapters = []) {
  return chapters.flatMap((chapter, localChapterIndex) => {
    const chapterIndex = chapter.sourceChapterIndex ?? chapter.chapterIndex ?? localChapterIndex;
    return (chapter.paragraphs || []).map((item, paragraphIndex) => ({
      chapterIndex,
      chapterTitle: chapter.title,
      paragraphIndex: typeof item === "object" && Number.isInteger(item.paragraphIndex) ? item.paragraphIndex : paragraphIndex,
      text: paragraphPlainText(item),
    }));
  }).filter((item) => summaryText(item.text));
}

function isImageParagraph(item) {
  return Boolean(item && typeof item === "object" && item.type === "image" && item.src);
}

function paragraphPlainText(item) {
  if (typeof item === "string") return item;
  if (isImageParagraph(item)) return String(item.alt || "").trim();
  if (item && typeof item === "object" && typeof item.text === "string") return item.text;
  return "";
}

function summaryText(item) {
  const clean = (value) => {
    const text = String(value || "").trim();
    return text && !/^(undefined|null|nan)$/i.test(text) ? text : "";
  };
  if (typeof item === "string") {
    const text = clean(item);
    return text && !/^undefined(?:s*[·路-]s*undefined)?$/i.test(text) ? text : "";
  }
  if (!item || typeof item !== "object") return "";
  if (item.type === "image") return clean(item.alt);
  return [item.name || item.date || item.title, item.subtitle || item.summary || item.detail]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getNewReadingContent(chapters, previousCursor, currentCursor) {
  if (!chapters?.length) return [];
  const previous = previousCursor || { chapterIndex: 0, paragraphIndex: -1 };
  if (currentCursor.chapterIndex < previous.chapterIndex || (currentCursor.chapterIndex === previous.chapterIndex && currentCursor.paragraphIndex <= previous.paragraphIndex)) return [];
  const source = [];
  for (let chapterIndex = previous.chapterIndex; chapterIndex <= currentCursor.chapterIndex; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    if (!chapter) continue;
    const start = chapterIndex === previous.chapterIndex ? previous.paragraphIndex + 1 : 0;
    const end = chapterIndex === currentCursor.chapterIndex ? currentCursor.paragraphIndex + 1 : chapter.paragraphs.length;
    const paragraphs = chapter.paragraphs
      .slice(Math.max(0, start), Math.max(0, end))
      .map((paragraph, offset) => ({
        paragraphIndex: Math.max(0, start) + offset,
        text: paragraphPlainText(paragraph),
        ...(isImageParagraph(paragraph) ? { type: "image", src: paragraph.src, alt: paragraph.alt || "" } : {}),
      }))
      .filter((item) => item.text || item.type === "image");
    if (paragraphs.length) source.push({ sourceChapterIndex: chapterIndex, title: chapter.title, paragraphs });
  }
  return source;
}

function getFullBookContent(chapters) {
  return chapters.map((chapter, sourceChapterIndex) => ({
    sourceChapterIndex,
    title: chapter.title,
    paragraphs: chapter.paragraphs.map((paragraph, paragraphIndex) => ({
      paragraphIndex,
      text: paragraphPlainText(paragraph),
      ...(isImageParagraph(paragraph) ? { type: "image", src: paragraph.src, alt: paragraph.alt || "" } : {}),
    })),
  }));
}

function getRecoveryCurrentChapters(book, cursor = {}) {
  const chapterIndex = Math.min(Math.max(Number(cursor.chapterIndex) || 0, 0), Math.max(0, (book?.chapters?.length || 1) - 1));
  const paragraphIndex = Math.max(0, Number(cursor.paragraphIndex) || 0);
  return getNewReadingContent(book?.chapters || [], { chapterIndex: 0, paragraphIndex: -1 }, { chapterIndex, paragraphIndex });
}

function getFullBookCursor(book) {
  const chapterIndex = Math.max(0, book.chapters.length - 1);
  const paragraphIndex = Math.max(0, book.chapters[chapterIndex]?.paragraphs.length - 1);
  return { chapterIndex, paragraphIndex, pageIndex: 0, pageCount: 1, scope: "full" };
}

function getLogicalPageMetrics(pageWidth = 900, pageHeight = 720, packScale = 1) {
  const width = Math.max(320, Number(pageWidth) || 900);
  const height = Math.max(200, Number(pageHeight) || 720);
  const scale = Math.min(1, Math.max(0.3, Number(packScale) || 1));
  // Match .epub-page: 18px / 1.68. Pack densely; the measure effect shrinks on overflow.
  // Do not stack extra density haircuts here — pageHeight already excludes page-copy padding,
  // and the overflow guard reserves a bottom safety band. A prior 0.8× factor left pages ~half empty.
  const fontSize = 18;
  const lineHeightPx = fontSize * 1.68;
  // CJK glyphs are ~1em; letter-spacing (.018em) is a small adder only.
  const charWidthPx = fontSize * 1.02;
  const charsPerLine = Math.max(18, Math.floor(width / charWidthPx));
  // One-line reserve in the estimate; padBottom + measure safetyPx cover the clip edge.
  const usableHeight = Math.max(160, height - lineHeightPx);
  const lines = Math.max(5, Math.floor(usableHeight / lineHeightPx));
  const estimated = Math.round(charsPerLine * lines * 1.06 * scale);
  const charBudget = Math.max(220, Math.min(2200, estimated));
  // Images are atomic; estimate ~48% of usable height so a figure can share a page with text.
  const imageHeightPx = Math.min(usableHeight * 0.48, lineHeightPx * 12);
  const imageLines = Math.max(4, Math.ceil(imageHeightPx / lineHeightPx) + 1);
  const paragraphOverhead = 14;
  return {
    charBudget,
    longSegmentSize: Math.max(160, Math.min(charBudget, Math.round(charBudget * 0.9))),
    paragraphOverhead,
    imageCharCost: Math.round(imageLines * charsPerLine) + paragraphOverhead,
  };
}

function paginateChapterWindow(chapter, pageIndex = 0, pageWidth = 900, pageHeight = 720, packScale = 1) {
  const paragraphs = chapter?.paragraphs || [];
  if (!paragraphs.length) return { pageCount: 1, items: [] };
  const targetPage = Math.max(0, Number(pageIndex) || 0);
  const { charBudget, longSegmentSize, paragraphOverhead, imageCharCost } = getLogicalPageMetrics(pageWidth, pageHeight, packScale);
  const items = [];
  let currentSize = 0;
  let currentPage = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (isImageParagraph(paragraph)) {
      const size = imageCharCost;
      if (currentSize && currentSize + size > charBudget) {
        currentPage += 1;
        currentSize = 0;
      }
      if (currentPage === targetPage) {
        items.push({
          type: "image",
          src: paragraph.src,
          alt: paragraph.alt || "",
          text: "",
          paragraphIndex,
          segmentIndex: 0,
        });
      }
      currentSize += size;
      if (currentSize >= charBudget * 0.92) {
        currentPage += 1;
        currentSize = 0;
      }
      return;
    }

    const text = paragraphPlainText(paragraph).trim();
    if (!text) return;
    for (let offset = 0; offset < text.length; offset += longSegmentSize) {
      const segment = text.slice(offset, offset + longSegmentSize);
      const size = segment.length + paragraphOverhead;
      if (currentSize && currentSize + size > charBudget) {
        currentPage += 1;
        currentSize = 0;
      }
      if (currentPage === targetPage) items.push({ text: segment, paragraphIndex, segmentIndex: Math.floor(offset / longSegmentSize) });
      currentSize += size;
      if (size >= charBudget) {
        currentPage += 1;
        currentSize = 0;
      }
    }
  });

  return { pageCount: Math.max(1, currentPage + (currentSize > 0 ? 1 : 0)), items };
}

function findPageForParagraphInChapter(chapter, paragraphIndex = 0, pageWidth = 900, pageHeight = 720, packScale = 1, charOffset = 0) {
  const paragraphs = chapter?.paragraphs || [];
  const target = Number(paragraphIndex) || 0;
  const targetOffset = Math.max(0, Number(charOffset) || 0);
  const { charBudget, longSegmentSize, paragraphOverhead, imageCharCost } = getLogicalPageMetrics(pageWidth, pageHeight, packScale);
  let currentSize = 0;
  let currentPage = 0;
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (isImageParagraph(paragraph)) {
      const size = imageCharCost;
      if (currentSize && currentSize + size > charBudget) {
        currentPage += 1;
        currentSize = 0;
      }
      if (index === target) return currentPage;
      currentSize += size;
      if (currentSize >= charBudget * 0.92) {
        currentPage += 1;
        currentSize = 0;
      }
      continue;
    }
    const text = paragraphPlainText(paragraph).trim();
    if (!text) continue;
    for (let offset = 0; offset < text.length; offset += longSegmentSize) {
      const segment = text.slice(offset, offset + longSegmentSize);
      const size = segment.length + paragraphOverhead;
      if (currentSize && currentSize + size > charBudget) {
        currentPage += 1;
        currentSize = 0;
      }
      if (index > target) return currentPage;
      if (index === target && offset + segment.length > targetOffset) return currentPage;
      currentSize += size;
      if (size >= charBudget) {
        currentPage += 1;
        currentSize = 0;
      }
    }
  }
  return Math.max(0, currentPage);
}

function buildRecoveryCard(book, readPages = [], savedPosition = {}, lastActivity = null, memoryState = {}) {
  if (!book?.chapters?.length) return null;
  const lastActivityTime = Number(lastActivity || 0);
  if (lastActivityTime && Date.now() - lastActivityTime < RECOVERY_CARD_MIN_ABSENCE_MS) return null;
  const cursor = normalizeRecoveryCursor(book, savedPosition);
  if (!hasRecoverablePriorContext(book, cursor) && !readPages.length) return null;
  const evidence = sortEvidenceByCursorProximity(collectRecoveryEvidence(book, cursor, memoryState), cursor);
  if (evidence.length < 2) return null;
  const absence = describeReadingAbsence(lastActivity);
  const keyPoints = evidence.slice(0, 3).map((item, index) => ({
    id: `point-${index}`,
    memoryKey: item.memoryKey,
    title: recoveryPointTitle(item.excerpt, index),
    detail: recoveryPointDetail(item.excerpt),
    evidence: item,
  }));
  const prerequisites = buildRecoveryPrerequisites(book, cursor, evidence);
  const questionEvidence = evidence[0];
  const questionAnchor = {
    name: keyPoints[0]?.title,
    title: keyPoints[0]?.title,
    summary: keyPoints[0]?.detail || questionEvidence?.excerpt,
    detail: keyPoints[0]?.detail || questionEvidence?.excerpt,
    kind: recoveryKindFromExcerpt(questionEvidence?.excerpt),
    priority: "recent",
  };
  return {
    intensity: absence.intensity,
    absenceLabel: absence.label,
    positionLabel: `上次读到 ${book.chapters[cursor.chapterIndex]?.title || `第 ${cursor.chapterIndex + 1} 节`} · 第 ${cursor.pageIndex + 1} 页`,
    keyPoints,
    prerequisites,
    question: {
      memoryKey: questionEvidence?.memoryKey,
      prompt: buildRecoveryQuestion(book, cursor, evidence, questionAnchor),
      hint: hintFromEvidenceExcerpt(questionEvidence?.excerpt || ""),
      answer: questionEvidence?.excerpt || "先回想上一阶段具体的主线变化，再继续阅读当前页。",
      evidence: questionEvidence,
    },
    evidence,
  };
}

function getLatestReadPage(readPages = []) {
  if (!readPages.length) return null;
  return [...readPages].sort((left, right) => right.chapterIndex - left.chapterIndex || right.pageIndex - left.pageIndex || right.paragraphIndex - left.paragraphIndex)[0];
}

function laterCursor(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  if (left.chapterIndex !== right.chapterIndex) return left.chapterIndex > right.chapterIndex ? left : right;
  return (left.paragraphIndex ?? 0) >= (right.paragraphIndex ?? 0) ? left : right;
}

function collectRecoveryEvidence(book, cursor, memoryState = {}) {
  const candidates = [];
  for (let chapterIndex = cursor.chapterIndex; chapterIndex >= 0; chapterIndex -= 1) {
    const chapter = book.chapters[chapterIndex];
    if (!chapter || isNonNarrativeChapter(chapter.title)) continue;
    const maxParagraph = chapterIndex === cursor.chapterIndex ? Math.min(cursor.paragraphIndex ?? chapter.paragraphs.length - 1, chapter.paragraphs.length - 1) : chapter.paragraphs.length - 1;
    for (let paragraphIndex = maxParagraph; paragraphIndex >= 0; paragraphIndex -= 1) {
      const text = cleanRecoveryText(paragraphPlainText(chapter.paragraphs[paragraphIndex]));
      if (!text || text.length < 24 || isPublicationMetadata(text) || isIncidentalRecoveryText(text)) continue;
      const occurrence = { chapterIndex, paragraphIndex };
      const memoryKey = recoveryMemoryKey("paragraph", recoveryPointTitle(text, candidates.length), occurrence);
      const score = scoreRecoveryParagraph(text, chapter.title, cursor, chapterIndex, paragraphIndex) + recoveryForgettingBoost(memoryState[memoryKey], occurrence, cursor);
      if (score <= 0) continue;
      candidates.push({
        id: `recovery-${chapterIndex}-${paragraphIndex}`,
        memoryKey,
        chapterIndex,
        chapterTitle: chapter.title,
        paragraphIndex,
        excerpt: text,
        score,
        cite: {
          label: `[R${candidates.length + 1}]`,
          source: `${chapter.title} · 第 ${paragraphIndex + 1} 段`,
          quote: text,
        },
        matchSources: ["mainline-recovery"],
      });
    }
  }
  return candidates
    .sort((left, right) => right.score - left.score || right.chapterIndex - left.chapterIndex || right.paragraphIndex - left.paragraphIndex)
    .slice(0, 5)
    .sort((left, right) => left.chapterIndex - right.chapterIndex || left.paragraphIndex - right.paragraphIndex);
}

function scoreRecoveryParagraph(text, chapterTitle, cursor, chapterIndex, paragraphIndex) {
  let score = recoveryMainlineScore(text);
  if (chapterIndex === cursor.chapterIndex) score += 12;
  const distance = Math.abs((cursor.paragraphIndex || 0) - paragraphIndex);
  score += Math.max(0, 16 - Math.floor(distance / 2));
  if (/第一章|第[一二三四五六七八九十]+章|chapter/i.test(chapterTitle || "")) score += 4;
  if (/出生|生于|逝世|享年|出版|印刷|译者|版权|ISBN|目录|序言/.test(text)) score -= 28;
  if (text.length > 45 && text.length < 160) score += 6;
  return score;
}

function recoveryMainlineScore(text) {
  let score = 0;
  const groups = [
    [18, /转折|决定|命令|部署|会议|冲突|突破|撤退|转移|进攻|防守|起义|谈判|分裂|危机|失败|胜利|牺牲|被俘|追击|战略|战役|形势|原因|导致|因此|于是|为了|实验|证明|推导|反驳|假设|成立|失效/],
    [12, /主张|观点|结论|概念|机制|模型|定义|原则|问题|矛盾|线索|铺垫|承接|关键|核心|重要|框架|例证/],
    [8, /司令|政委|军团|军委|部队|组织|政府|委员会|总部|议会|董事会|课题组|实验室|学派|同盟/],
    [4, /说|认为|指出|表示|要求|宣布|计划|准备|开始|继续/],
  ];
  groups.forEach(([weight, pattern]) => {
    if (pattern.test(text)) score += weight;
  });
  return score;
}

function isIncidentalRecoveryText(text) {
  if (/^(他|他们|她|这|那|也就是|报告|指出)$/.test(text)) return true;
  if (text.length < 18) return true;
  const hasMainline = recoveryMainlineScore(text) >= 12;
  const onlyEntityList = /^([一-鿿]{2,4}[、，,]){2,}[一-鿿]{2,4}/.test(text) && !hasMainline;
  return onlyEntityList;
}

function buildRecoveryPrerequisites(book, cursor, evidence) {
  const chapterTitle = book.chapters[cursor.chapterIndex]?.title || "当前章节";
  const previous = evidence[0];
  const current = evidence[1] || evidence[0];
  return [
    {
      id: "prereq-mainline",
      text: `继续读《${chapterTitle}》前，先接上前文主线：${recoveryPointTitle(previous?.excerpt || "", 0)}。`,
      evidence: previous,
    },
    {
      id: "prereq-cause",
      text: current ? `当前页更需要记住因果承接：${recoveryPointTitle(current.excerpt, 1)}。` : "先回到上次结束前的主线变化，再继续当前页。",
      evidence: current,
    },
  ].filter((item) => item.evidence);
}

function updateRecoveryMemoryState(book, card, action) {
  if (!book || !card || !["shown", "remembered", "missed", "hint", "answer"].includes(action)) return;
  const storageKey = recoveryMemoryStorageKey(book);
  const current = loadStored(storageKey, {});
  const now = new Date().toISOString();
  const keys = recoveryCardMemoryKeys(card);
  if (!keys.length) return;
  const next = { ...current };
  keys.forEach((key) => {
    const item = next[key] || { strength: 0, shown: 0, remembered: 0, missed: 0, hints: 0, answers: 0 };
    const updated = { ...item, updatedAt: now };
    if (action === "shown") {
      updated.shown = Number(updated.shown || 0) + 1;
      updated.lastShownAt = now;
    }
    if (action === "remembered") {
      updated.remembered = Number(updated.remembered || 0) + 1;
      updated.lastReviewedAt = now;
      updated.strength = Math.min(5, Number(updated.strength || 0) + 1);
    }
    if (action === "missed") {
      updated.missed = Number(updated.missed || 0) + 1;
      updated.lastReviewedAt = now;
      updated.strength = Math.max(0, Number(updated.strength || 0) - 1);
    }
    if (action === "hint") {
      updated.hints = Number(updated.hints || 0) + 1;
      updated.lastHintAt = now;
      updated.strength = Math.max(0, Number(updated.strength || 0) - 0.5);
    }
    if (action === "answer") {
      updated.answers = Number(updated.answers || 0) + 1;
      updated.lastAnswerAt = now;
      updated.strength = Math.max(0, Number(updated.strength || 0) - 1);
    }
    next[key] = updated;
  });
  next.reader = updateReaderMemory(current.reader || null, {
    lastActivityAt: Date.now(),
    rememberedKeys: action === "remembered" ? keys : [],
    missedKeys: action === "missed" ? keys : [],
    forgettingScores: Object.fromEntries(keys.map((key) => [
      key,
      readerForgettingScore({
        memoryKey: key,
        reader: {
          rememberedKeys: action === "remembered" ? keys : [],
          missedKeys: action === "missed" ? keys : [],
        },
      }),
    ])),
  });
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function recoveryCardMemoryKeys(card) {
  const keys = [
    ...(card.keyPoints || []).map((item) => item.memoryKey || item.evidence?.memoryKey),
    ...(card.prerequisites || []).map((item) => item.memoryKey || item.evidence?.memoryKey),
    card.question?.memoryKey,
    card.question?.evidence?.memoryKey,
    ...(card.evidence || []).map((item) => item.memoryKey),
  ];
  return [...new Set(keys.filter(Boolean))].slice(0, 8);
}

function recoveryMemoryKey(kind = "memory", title = "", occurrence = {}) {
  const chapterIndex = Number.isInteger(Number(occurrence.chapterIndex)) ? Number(occurrence.chapterIndex) : 0;
  const paragraphIndex = Number.isInteger(Number(occurrence.paragraphIndex)) ? Number(occurrence.paragraphIndex) : 0;
  const normalizedTitle = summaryText(title || "memory").replace(/\s+/g, "").slice(0, 32);
  return `${kind}:${chapterIndex}:${paragraphIndex}:${normalizedTitle}`;
}

function recoveryForgettingBoost(state = null, occurrence = {}, cursor = {}) {
  const chapterDistance = Math.max(0, Number(cursor.chapterIndex || 0) - Number(occurrence.chapterIndex || 0));
  const paragraphDistance = Number(cursor.chapterIndex || 0) === Number(occurrence.chapterIndex || 0)
    ? Math.max(0, Number(cursor.paragraphIndex || 0) - Number(occurrence.paragraphIndex || 0))
    : 0;
  const distanceBoost = Math.min(18, chapterDistance * 7 + Math.floor(paragraphDistance / 8));
  if (!state) return distanceBoost;
  const strength = Math.max(0, Number(state.strength || 0));
  const intervalHours = [8, 18, 36, 72, 120, 192][Math.min(5, Math.floor(strength))];
  const lastReviewed = Date.parse(state.lastReviewedAt || state.lastShownAt || state.updatedAt || "");
  const elapsedHours = Number.isFinite(lastReviewed) ? Math.max(0, (Date.now() - lastReviewed) / 3600000) : intervalHours;
  const overdueBoost = Math.min(24, Math.max(0, elapsedHours / intervalHours) * 10);
  const struggleBoost = Math.min(18, Number(state.missed || 0) * 8 + Number(state.answers || 0) * 6 + Number(state.hints || 0) * 3);
  const rememberedPenalty = Math.min(16, Number(state.remembered || 0) * 4 + strength * 3);
  return Math.max(0, Math.min(36, distanceBoost + overdueBoost + struggleBoost - rememberedPenalty));
}

function buildRecoveryQuestion(book, cursor, evidence, preferredAnchor = null) {
  const chapterTitle = book.chapters[cursor.chapterIndex]?.title || "当前章节";
  const first = evidence[0]?.excerpt || "";
  const anchor = preferredAnchor || {
    name: recoveryPointTitle(first, 0),
    title: recoveryPointTitle(first, 0),
    summary: recoveryPointDetail(first),
    detail: recoveryPointDetail(first),
    kind: recoveryKindFromExcerpt(first),
    priority: "recent",
  };
  const prompt = questionFromEpisodeAnchor(anchor, chapterTitle);
  if (!isWeakRecoveryQuestion(prompt, { answer: first, detail: first })) return prompt;
  if (/原因|因为|导致|因此|于是|为了/.test(first) && hasConcreteEpisodeCue(first)) {
    return `继续读《${chapterTitle}》前，上一阶段最具体的因果变化是什么？`;
  }
  if (/命令|决定|部署|会议|计划|准备/.test(first) && hasConcreteEpisodeCue(first)) {
    return `继续读《${chapterTitle}》前，前文哪个具体决定或部署正在影响当前局势？`;
  }
  if (/冲突|危机|失败|胜利|突破|撤退|转移/.test(first) && hasConcreteEpisodeCue(first)) {
    return `继续读《${chapterTitle}》前，上一阶段的冲突推进到了哪一步？`;
  }
  return `继续读《${chapterTitle}》前，前文留下的最具体主线变化是什么？`;
}

function recoveryKindFromExcerpt(text) {
  const clean = cleanRecoveryText(text);
  if (/概念|定义|机制|模型|原则/.test(clean)) return "concept";
  if (/主张|结论|判断|证明/.test(clean)) return "claim";
  if (/决定|命令|冲突|突破|撤退|转移|会议|部署|战役|战斗/.test(clean)) return "event";
  return "event";
}

function recoveryPointTitle(text, index) {
  const clean = cleanRecoveryText(text);
  const clause = pickRecoveryTitleClause(clean);
  if (clause && !isBroadMegaTopic(clause)) return clause;
  return `关键点 ${index + 1}`;
}

function pickRecoveryTitleClause(text) {
  const clean = cleanRecoveryText(text);
  if (!clean) return "";
  const sentence = (clean.split(/[。！？；]/).find((item) => item.trim().length >= 8 && hasConcreteEpisodeCue(item)) || "")
    .trim();
  if (!sentence) return "";
  // Prefer a short concrete span from the sentence, never book-specific slogans.
  const clipped = sentence.length <= 18 ? sentence : `${sentence.slice(0, 16)}…`;
  if (looksTruncatedRecoveryHint(clipped.replace(/…$/, ""))) return "";
  return clipped;
}

function recoveryPointDetail(text) {
  const clean = cleanRecoveryText(text);
  const sentence = clean.split(/[。！？；]/).find((item) => item.trim().length >= 12) || clean;
  return sentence.slice(0, 62) + (sentence.length > 62 ? "…" : "");
}

function cleanRecoveryText(value) {
  return summaryText(value)
    .replace(/s+/g, "")
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .slice(0, 140);
}

function describeReadingAbsence(lastActivity) {
  const timestamp = Number(lastActivity || 0);
  if (!timestamp) return { label: "继续阅读前", intensity: "fresh" };
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days <= 0) return { label: "刚刚读过", intensity: "fresh" };
  if (days <= 1) return { label: "隔了一天", intensity: "light" };
  if (days <= 3) return { label: `隔了 ${days} 天`, intensity: "medium" };
  if (days <= 7) return { label: `隔了 ${days} 天`, intensity: "deep" };
  return { label: "久违续读", intensity: "deep" };
}

function countReadPagesAfter(readPages, cursor) {
  if (!cursor) return readPages.length;
  return readPages.filter((page) => page.chapterIndex > cursor.chapterIndex || (page.chapterIndex === cursor.chapterIndex && page.pageIndex > cursor.pageIndex)).length;
}

function analysisStorageKey(book) {
  return `yuezhi-analysis:${TRACE_ANALYSIS_VERSION}:${storageBookIdentity(book)}`;
}

function hydrateAnalysisRecord(storedRecord, book = null) {
  if (!storedRecord) return null;
  const bookMemory = normalizeBookMemory(
    storedRecord.bookMemory || bookMemoryFromLegacy({
      index: storedRecord.index,
      traceMemory: storedRecord.traceMemory,
      cursor: storedRecord.cursor,
      profile: storedRecord.profile,
      traceProfile: storedRecord.traceProfile,
    }, { bookId: book?.id || book?.title || "book", cursor: storedRecord.cursor }),
    { bookId: book?.id || book?.title || "book", cursor: storedRecord.cursor, profile: storedRecord.profile, traceProfile: storedRecord.traceProfile },
  );
  const index = normalizeReadingIndex(storedRecord.index || readingIndexFromBookMemory(bookMemory), book);
  return {
    ...storedRecord,
    bookMemory,
    index,
    traceMemory: storedRecord.traceMemory || compatibilityTraceMemory(bookMemory),
    summary: normalizeAnalysisSummary(storedRecord.summary),
    recoveryCard: normalizeRecoveryCard(storedRecord.recoveryCard, null),
  };
}

function clearLegacyAnalysisStorage() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("yuezhi-analysis:") && !key.startsWith(`yuezhi-analysis:${TRACE_ANALYSIS_VERSION}:`))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage access failures; analysis can still run without cache.
  }
}

function readPagesStorageKey(book) {
  return `yuezhi-read-pages:${storageBookIdentity(book)}`;
}

function recoveryMemoryStorageKey(book) {
  return `shumai-recovery-memory:${storageBookIdentity(book)}`;
}

function readingPositionStorageKey(book) {
  return `yuezhi-reading-position:${book.id || book.title}:${book.creator || "unknown"}:${book.chapters.length}`;
}

function readingActivityStorageKey(book) {
  return `yuezhi-reading-activity:${storageBookIdentity(book)}`;
}

function storageBookIdentity(book) {
  return book.fingerprint || `${book.id || book.title}:${book.creator || "unknown"}:${book.chapters.length}`;
}

function getBookShelfState(book) {
  const readPages = loadStored(readPagesStorageKey(book), []);
  if (!readPages.length) return { hasRead: false, percent: 0, label: `${book.chapters.length} 节` };
  const latest = [...readPages].sort((left, right) => right.chapterIndex - left.chapterIndex || right.pageIndex - left.pageIndex || right.paragraphIndex - left.paragraphIndex)[0];
  const percent = Math.max(1, Math.min(100, Math.round(((latest.chapterIndex + 1) / book.chapters.length) * 100)));
  return { hasRead: true, percent, label: `读到第 ${latest.chapterIndex + 1} / ${book.chapters.length} 节` };
}

function bookmarkStorageKey(book) {
  return `yuezhi-bookmarks:${book.id || book.title}:${book.creator || "unknown"}:${book.chapters.length}`;
}

function notesStorageKey(book) {
  return `yuezhi-notes:${book.id || book.title}:${book.creator || "unknown"}:${book.chapters.length}`;
}
