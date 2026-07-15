import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  FileText,
  Flower2,
  FolderPlus,
  History,
  Lightbulb,
  ListFilter,
  MapPin,
  Minus,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
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
  Upload,
  X,
} from "lucide-react";
import { parseEpub } from "./epub.js";
import { BOOK_TYPES, findBookType } from "./bookTaxonomy.js";
import { UNIVERSAL_SKILLS, createReadingProgress, domainProgress, earnedBadges, getDomainConfig, resolveSkillDomain, unlockedSpecialSkills } from "./skillSystem.js";
import { TalentConstellation } from "./TalentConstellation.jsx";

const BOOK_PATH = "/books/long-march.epub";
const COVER_PATH = "/books/long-march-cover.jpeg";
const APP_NAME = "书脉";
const APP_SLOGAN = "读得清脉络，记得住来处";
const SUPPORTED_IMPORT_ACCEPT = ".epub,.pdf,.txt,.html,.htm,.rtf,.doc,.docx,.mobi,.azw,.azw3,.fb2,.djvu,.cbz,.cbr,application/epub+zip,application/pdf,text/plain,text/html";
const READABLE_IMPORT_FORMATS = new Set(["epub", "pdf"]);
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
const DEFAULT_AI_SETTINGS = { provider: "deepseek", model: "deepseek-v4-flash", analysisMode: "read", autoPageThreshold: 5 };
const LIBRARY_DB_NAME = "shumai-library";
const LIBRARY_DB_VERSION = 1;
const LIBRARY_STORE = "books";
const READING_THEMES = [
  { id: "plain", name: "素笺", detail: "清透留白", icon: BookOpen },
  { id: "lotus", name: "荷花", detail: "淡青水色", icon: Flower2 },
  { id: "tea", name: "香茗", detail: "轻烟暖白", icon: Coffee },
  { id: "orchid", name: "兰花", detail: "幽绿清雅", icon: Sprout },
  { id: "flower", name: "花枝", detail: "微粉春意", icon: Flower2 },
  { id: "bamboo", name: "竹林", detail: "疏竹晨雾", icon: Trees },
];

function facetDescription(facet) {
  const descriptions = {
    "人物": "角色与关系", "地点": "关键空间", "时间线": "事件顺序", "组织": "参与主体", "关键事件": "主线转折", "原文证据": "定位出处",
    "人物关系": "关系变化", "场景": "发生场所", "情节线": "叙事推进", "章节回顾": "已读摘要", "主题意象": "反复母题",
    "案件": "案件进展", "线索": "可验证线索", "证据": "原文证据", "阵营": "角色阵营", "世界设定": "世界规则", "术语": "重要名词", "事件线": "事件推进",
    "关系变化": "关系变化", "情感节点": "情感转折", "冲突与转折": "冲突转折", "概念": "核心概念", "公司与人物": "主体与角色", "案例": "案例", "框架": "分析框架", "决策": "关键决策", "数据指标": "关键指标",
    "指标": "数据指标", "机构": "参与机构", "政策": "政策变化", "因果关系": "因果链", "理论": "理论框架", "论证": "论证结构", "出处": "引用出处", "命题": "核心命题", "思想家": "思想人物", "流派": "思想流派", "论证链": "推理链", "原典出处": "原典定位",
    "规律": "科学规律", "实验": "实验设计", "公式": "公式", "科学家": "相关人物", "架构": "系统架构", "流程": "实现流程", "依赖": "依赖关系", "代码示例": "代码片段", "常见问题": "问题排查",
    "知识点": "学习重点", "定义": "概念定义", "例题": "例题", "易错点": "易错提醒", "练习": "练习", "前置知识": "前置知识", "方法": "可用方法", "情境案例": "情境案例", "行动清单": "行动建议", "关键提问": "反思提问",
    "路线": "行进路线", "地理特征": "地理特征", "历史背景": "背景说明", "体验": "体验记录", "实用信息": "实用信息", "作品": "相关作品", "作者": "作者", "技法": "表达技法", "时期": "相关时期", "风格": "风格特征", "作品关联": "作品关联",
    "篇章": "篇章", "意象": "意象", "典故": "典故", "注释": "注释", "版本": "版本", "主题": "主题"
  };
  return descriptions[facet] || "阅读索引";
}

function loadStored(name, fallback) {
  try {
    const value = localStorage.getItem(name);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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
  if (!book || book.local) return;
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState(() => loadStored("yuezhi-categories", DEFAULT_CATEGORIES));
  const [bookCategories, setBookCategories] = useState(() => loadStored("yuezhi-book-categories", DEFAULT_CATEGORIES));
  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeType, setActiveType] = useState("全部类型");
  const [typeBrowserExpanded, setTypeBrowserExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [facetMenuOpen, setFacetMenuOpen] = useState(false);
  const [pageTurn, setPageTurn] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageWidth, setPageWidth] = useState(900);
  const [activePanel, setActivePanel] = useState("目录");
  const [selectedParagraph, setSelectedParagraph] = useState(null);
  const [selectionBloom, setSelectionBloom] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [analysisSettings, setAnalysisSettings] = useState(() => ({ ...DEFAULT_AI_SETTINGS, ...loadStored("yuezhi-ai-settings", DEFAULT_AI_SETTINGS) }));
  const [analysisSettingsOpen, setAnalysisSettingsOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [readingTheme, setReadingTheme] = useState(() => loadStored("yuezhi-reading-theme", "plain"));
  const [analysisSummaryOpen, setAnalysisSummaryOpen] = useState(false);
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [readingProgress, setReadingProgress] = useState(() => ({ ...createReadingProgress(), ...loadStored("yuezhi-reading-progress", createReadingProgress()) }));
  const [aiIndex, setAiIndex] = useState(null);
  const [bookProfile, setBookProfile] = useState(null);
  const [analysisRecord, setAnalysisRecord] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [readPages, setReadPages] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [analysisState, setAnalysisState] = useState({ status: "idle", message: "尚未使用大模型分析" });
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);
  const pageCopyRef = useRef(null);
  const pageTrackRef = useRef(null);
  const readingPositionRestoreRef = useRef(null);
  const readingStartedAtRef = useRef(Date.now());

  useEffect(() => { localStorage.setItem("yuezhi-categories", JSON.stringify(categories)); }, [categories]);
  useEffect(() => { localStorage.setItem("yuezhi-book-categories", JSON.stringify(bookCategories)); }, [bookCategories]);
  useEffect(() => {
    if (!book) return;
    const storageKey = readingPositionStorageKey(book);
    readingPositionRestoreRef.current = storageKey;
    const saved = loadStored(storageKey, loadStored("yuezhi-reading-position", { chapterIndex: 0, pageIndex: 0 }));
    setChapterIndex(Math.min(Math.max(saved.chapterIndex || 0, 0), book.chapters.length - 1));
    setPageIndex(Math.max(saved.pageIndex || 0, 0));
  }, [book?.id, book?.title, book?.creator, book?.chapters.length]);

  useEffect(() => {
    if (!book) return;
    const storageKey = readingPositionStorageKey(book);
    if (readingPositionRestoreRef.current === storageKey) {
      readingPositionRestoreRef.current = null;
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify({ chapterIndex, pageIndex }));
  }, [book, chapterIndex, pageIndex]);
  useEffect(() => { localStorage.setItem("yuezhi-ai-settings", JSON.stringify(analysisSettings)); }, [analysisSettings]);
  useEffect(() => { localStorage.setItem("yuezhi-reading-theme", JSON.stringify(readingTheme)); }, [readingTheme]);
  useEffect(() => { localStorage.setItem("yuezhi-reading-progress", JSON.stringify(readingProgress)); }, [readingProgress]);

  useEffect(() => {
    if (!book) return;
    const storageKey = analysisStorageKey(book);
    const record = loadStored(storageKey, loadStored(`yuezhi-analysis:${book.title}`, null));
    setReadPages(loadStored(readPagesStorageKey(book), []));
    setAnalysisRecord(record);
    setAiIndex(record?.index || null);
    setBookProfile(record?.profile || (book.bookType ? { category: book.bookType, facets: book.indexSchema || findBookType(book.bookType).facets } : null));
    setAnalysisState(record ? { status: "done", message: "已加载上次增量分析结果" } : { status: "idle", message: "尚未使用大模型分析" });
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
    if (analysisSettings.analysisMode !== "auto" || analysisState.status === "loading" || !book) return;
    const latestRead = getLatestReadCursor();
    const unreadSinceAnalysis = countReadPagesAfter(readPages, analysisRecord?.cursor);
    if (latestRead && unreadSinceAnalysis >= analysisSettings.autoPageThreshold) analyzeBook("read", true);
  }, [readPages, analysisSettings.analysisMode, analysisSettings.autoPageThreshold, analysisRecord, analysisState.status, book]);

  useEffect(() => {
    async function loadBuiltInBook() {
      try {
        const response = await fetch(BOOK_PATH);
        if (!response.ok) throw new Error("无法打开本地 EPUB 文件");
        const parsed = await parseEpub(await response.blob());
        const builtIn = { ...parsed, id: "long-march", fingerprint: "builtin:long-march", cover: COVER_PATH, bookType: "历史纪实 / 传记", indexSchema: findBookType("历史纪实 / 传记").facets, local: true };
        const storedBooks = await loadStoredLibraryBooks();
        const importedBooks = storedBooks.filter((item) => item.id !== builtIn.id && !item.local);
        const books = [builtIn, ...importedBooks];
        const activeBookId = loadStored("shumai-active-book-id", builtIn.id);
        const activeBook = books.find((item) => item.id === activeBookId) || builtIn;
        setLibraryBooks(books);
        setBook(activeBook);
        setChapterIndex((current) => Math.min(Math.max(current, 0), activeBook.chapters.length - 1));
      } catch (error) {
        setLoadError(error.message || "解析 EPUB 时出现问题");
      } finally {
        setIsLoading(false);
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

  const chapter = book?.chapters[chapterIndex];
  useEffect(() => {
    function updatePageCount() {
      const viewport = pageCopyRef.current;
      if (!viewport) return;
      const gap = 64;
      const step = viewport.clientWidth + gap;
      setPageWidth(viewport.clientWidth);
      const count = Math.max(1, Math.ceil((viewport.scrollWidth + gap) / step));
      setPageCount(count);
      setPageIndex((index) => Math.min(index, count - 1));
    }

    const frame = requestAnimationFrame(updatePageCount);
    const observer = new ResizeObserver(updatePageCount);
    if (pageCopyRef.current) observer.observe(pageCopyRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [chapter, pageWidth, screen]);

  useEffect(() => {
    const viewport = pageCopyRef.current;
    if (viewport) viewport.scrollLeft = pageIndex * (viewport.clientWidth + 64);
  }, [pageIndex, pageWidth]);

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
  const shelfLabel = activeType !== "全部类型" ? activeType : activeCategory === "全部" ? "本地书架" : activeCategory;
  const searchResults = useMemo(() => searchBook(book?.chapters || [], searchQuery), [book, searchQuery]);
  const fallbackIndex = useMemo(() => buildReadingIndex(book?.chapters || []), [book]);
  const bookIndex = aiIndex || fallbackIndex;
  const activeSkillDomain = resolveSkillDomain(book?.bookType, bookCategories);
  const activeSkillConfig = getDomainConfig(activeSkillDomain);
  const activeDomainProgress = domainProgress(readingProgress, activeSkillDomain);
  const activeSpecialSkills = unlockedSpecialSkills(readingProgress, activeSkillDomain);

  useEffect(() => {
    if (activePanel === "关系" && (bookIndex.relationships || []).length) setRelationshipOpen(true);
  }, [activePanel, bookIndex]);

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
    readingPositionRestoreRef.current = storageKey;
    setBook(nextBook);
    setChapterIndex(Math.min(Math.max(saved.chapterIndex || 0, 0), nextBook.chapters.length - 1));
    setPageIndex(Math.max(saved.pageIndex || 0, 0));
    setScreen("reader");
    setActivePanel("目录");
    setSelectedParagraph(null);
    setDrawerOpen(false);
  }

  function selectParagraph(index) {
    if (window.getSelection()?.toString().trim()) return;
    setSelectedParagraph(index);
    setDrawerOpen(true);
  }

  function selectChapter(index) {
    markCurrentPageRead();
    setChapterIndex(index);
    setPageIndex(0);
    setSelectedParagraph(null);
    setDrawerOpen(false);
  }

  function turnPage(direction) {
    markCurrentPageRead();
    setPageTurn(direction > 0 ? "next" : "previous");
    setPageIndex((index) => Math.min(Math.max(index + direction, 0), pageCount - 1));
    setSelectedParagraph(null);
    setSelectionBloom(null);
    setDrawerOpen(false);
  }

  function openSearchResult(result) {
    setChapterIndex(result.chapterIndex);
    setPageIndex(0);
    setSelectedParagraph(result.paragraphIndex);
    setDrawerOpen(false);
    setSearchOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const viewport = pageCopyRef.current;
      const target = document.getElementById(`paragraph-${result.paragraphIndex}`);
      if (!viewport || !target) return;
      setPageIndex(Math.round(target.offsetLeft / (viewport.clientWidth + 64)));
    }));
    showNotice(`已定位到《${book.title}》· ${result.chapterTitle}`);
  }

  function jumpToParagraph(index) {
    setSelectedParagraph(index);
    setDrawerOpen(false);
    window.setTimeout(() => goToParagraph(index), 30);
    showNotice(`已回到本章第 ${index + 1} 段`);
  }

  function goToParagraph(index) {
    const viewport = pageCopyRef.current;
    const target = document.getElementById(`paragraph-${index}`);
    if (!viewport || !target) return;
    setPageIndex(Math.round(target.offsetLeft / (viewport.clientWidth + 64)));
  }

  function openIndexEntry(entry) {
    recordProgress({ evidenceJumps: 1, xp: 1 });
    setChapterIndex(entry.occurrence.chapterIndex);
    setPageIndex(0);
    setSelectedParagraph(entry.occurrence.paragraphIndex);
    setDrawerOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => goToParagraph(entry.occurrence.paragraphIndex)));
    showNotice(`已定位到“${entry.name}”的原文证据`);
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
      const duplicateBooks = [];
      let duplicateCount = 0;
      let failedCount = 0;
      let classifiedCount = 0;
      let firstFailureMessage = "";

      for (const [fileIndex, file] of readableFiles.entries()) {
        try {
          setImportStatus((status) => ({ ...status, current: fileIndex + 1, title: file.name, stage: "解析书籍结构" }));
          const parsed = await parseImportedBook(file);
          const fingerprint = createBookFingerprint(parsed, file);
          if (existingFingerprints.has(fingerprint)) {
            duplicateCount += 1;
            const existingBook = libraryBooks.find((item) => item.fingerprint === fingerprint);
            if (existingBook) duplicateBooks.push(existingBook);
            continue;
          }
          existingFingerprints.add(fingerprint);
          setImportStatus((status) => ({ ...status, title: parsed.title || file.name, stage: "调用大模型识别类型" }));
          const classification = await classifyImportedBook(parsed);
          if (classification) classifiedCount += 1;
          const profile = classification?.profile;
          importedBooks.push({
            ...parsed,
            id: `import:${fingerprint}`,
            fingerprint,
            fileName: file.name,
            cover: parsed.cover || "",
            bookType: profile?.category || "",
            indexSchema: profile?.facets || [],
            local: false,
          });
          setImportStatus((status) => ({ ...status, classified: classifiedCount, stage: classification ? "完成分类" : "分类跳过，保留待识别" }));
        } catch (error) {
          failedCount += 1;
          if (!firstFailureMessage) firstFailureMessage = error?.message || `${file.name} 导入失败`;
          setImportStatus((status) => ({ ...status, failed: failedCount, stage: "这本导入失败，继续下一本" }));
        }
      }

      if (importedBooks.length) {
        await Promise.all(importedBooks.map((item) => saveStoredLibraryBook(item)));
        setLibraryBooks((items) => [...items, ...importedBooks]);
        const latest = importedBooks[importedBooks.length - 1];
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
      if (classifiedCount) messages.push(`已识别 ${classifiedCount} 本类型`);
      if (duplicateCount) messages.push(`${duplicateCount} 本已在书架中`);
      if (unsupported.length) messages.push(`${unsupported.length} 个暂不支持的文件已跳过`);
      if (failedCount) messages.push(`${failedCount} 本导入失败`);
      if (!importedBooks.length && failedCount && firstFailureMessage) messages.push(firstFailureMessage);
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
    return parseEpub(file);
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
      return;
    }
    const newChapters = scope === "full" ? getFullBookContent(book.chapters) : getNewReadingContent(book.chapters, analysisRecord?.cursor, cursor);
    if (!newChapters.length) {
      setAnalysisState({ status: "done", message: "当前阅读位置没有新增内容可分析" });
      if (!isAutomatic && analysisRecord?.summary) setAnalysisSummaryOpen(true);
      return;
    }
    setAnalysisState({ status: "loading", message: "正在分析主线人物、地点与事件…" });
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: analysisSettings.provider, model: analysisSettings.model, scope, previousIndex: scope === "full" ? null : analysisRecord?.index, cursor, book: { title: book.title, creator: book.creator, chapters: newChapters } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "分析服务暂不可用");
      setAiIndex(result.index);
      setBookProfile(result.profile);
      setBook((current) => current ? { ...current, bookType: result.profile.category, indexSchema: result.profile.facets } : current);
      setLibraryBooks((items) => items.map((item) => item.id === book.id ? { ...item, bookType: result.profile.category, indexSchema: result.profile.facets } : item));
      const record = { index: result.index, profile: result.profile, summary: result.summary, cursor, updatedAt: new Date().toISOString() };
      setAnalysisRecord(record);
      localStorage.setItem(analysisStorageKey(book), JSON.stringify(record));
      setAnalysisState({ status: "done", message: `已由 ${result.model} 提取主线索引` });
      setAnalysisSettingsOpen(false);
      if (isAutomatic) showNotice("已根据新增已读内容自动更新索引");
      else setAnalysisSummaryOpen(true);
      if (!isAutomatic) showNotice("本书索引已更新为大模型分析结果");
    } catch (error) {
      setAnalysisState({ status: "error", message: error.message || "大模型分析失败" });
    }
  }

  function getReadCursor() {
    const viewport = pageCopyRef.current;
    const pageBoundary = viewport ? (pageIndex + 1) * (viewport.clientWidth + 64) : Number.POSITIVE_INFINITY;
    const paragraphIndices = [...document.querySelectorAll(".page-track p[id^='paragraph-']")]
      .filter((element) => element.offsetLeft < pageBoundary)
      .map((element) => Number(element.id.replace("paragraph-", "")))
      .filter(Number.isInteger);
    return { chapterIndex, paragraphIndex: paragraphIndices.length ? Math.max(...paragraphIndices) : 0, pageIndex, pageCount };
  }

  function closeDrawerOnBlank(event) {
    setSelectionBloom(null);
    if (!drawerOpen) return;
    const target = event.target;
    if (target === event.currentTarget || target.classList.contains("page-track")) {
      setDrawerOpen(false);
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
    const horizontalPadding = 142;
    const x = Math.min(Math.max(rect.left + rect.width / 2, horizontalPadding), window.innerWidth - horizontalPadding);
    const y = Math.min(rect.bottom + 18, window.innerHeight - 112);
    setSelectionBloom({ text: text.length > 26 ? `${text.slice(0, 26)}…` : text, fullText: text, x, y });
  }

  function handleBloomAction(action) {
    if (action !== "note") {
      setSelectionBloom(null);
      return;
    }
    setNoteDraft("");
    setNoteComposerOpen(true);
  }

  function saveNote() {
    const content = noteDraft.trim();
    if (!content || !selectionBloom) return;
    const note = { id: `${Date.now()}`, chapterIndex, pageIndex, chapterTitle: chapter.title, selection: selectionBloom.fullText, content, createdAt: Date.now() };
    setNotes((items) => {
      const next = [...items, note];
      localStorage.setItem(notesStorageKey(book), JSON.stringify(next));
      return next;
    });
    setNoteComposerOpen(false);
    setSelectionBloom(null);
    recordProgress({ notes: 1, xp: 5 });
    showNotice("笔记已保存");
  }

  function openNote(note) {
    markCurrentPageRead();
    setChapterIndex(note.chapterIndex);
    setPageIndex(note.pageIndex);
    setSelectedParagraph(null);
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
        : [...items, { id, chapterIndex, pageIndex, chapterTitle: chapter.title, excerpt: chapter.paragraphs[0]?.slice(0, 46) || "", createdAt: Date.now() }];
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

  if (isLoading) {
    return <main className="loading-screen"><div className="loader-mark"><BookOpen size={26} /></div><strong>正在解析《长征》</strong><span>书籍只在此浏览器中处理</span><div className="loading-line"><i /></div></main>;
  }

  if (loadError || !book) {
    return <main className="loading-screen"><div className="loader-mark"><FileText size={26} /></div><strong>无法打开这本书</strong><span>{loadError}</span><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> 选择书籍文件</button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></main>;
  }

  if (screen === "skills") {
    return <SkillTreeScreen book={book} config={activeSkillConfig} domain={activeSkillDomain} progress={readingProgress} domainProgress={activeDomainProgress} onBack={() => setScreen("shelf")} />;
  }

  if (screen === "shelf") {
    return (
      <main className="library-shell">
        <header className="library-topbar">
          <div className="brand"><span className="brand-mark"><BookOpen size={18} /></span>{APP_NAME} <small>{APP_SLOGAN}</small></div>
          <div className="library-actions"><button className="text-action" onClick={() => setCategoryModalOpen(true)}><Tag size={16} /> 管理分类</button><button className="primary-button" disabled={Boolean(importStatus)} onClick={() => inputRef.current?.click()}><Upload size={16} /> {importStatus ? "正在导入" : "导入书籍"}</button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></div>
        </header>
        <aside className="library-sidebar">
          <div className="library-nav-title">我的书架</div>
          <button className={activeCategory === "全部" ? "library-nav active" : "library-nav"} onClick={() => setActiveCategory("全部")}><BookOpen size={17} /> 全部图书 <span>{shelfBooks.length}</span></button>
          <button className="library-nav"><History size={17} /> 最近阅读</button>
          <div className="library-nav-title category-title">自定义标签 <button onClick={() => setCategoryModalOpen(true)} title="新建分类"><Plus size={15} /></button></div>
          {categories.map((category) => <button className={activeCategory === category ? "library-nav active" : "library-nav"} key={category} onClick={() => setActiveCategory(category)}><span className="category-dot" />{category}<span>{bookCategories.includes(category) ? 1 : 0}</span></button>)}
          <div className="library-nav-title type-browser-title">图书类型 <span>{BOOK_TYPES.length}</span></div>
          <div className="type-browser"><button className={activeType === "全部类型" ? "type-chip active" : "type-chip"} onClick={() => setActiveType("全部类型")}>全部类型</button>{BOOK_TYPES.slice(0, typeBrowserExpanded ? BOOK_TYPES.length : 6).map((type) => <button className={activeType === type.name ? "type-chip active" : "type-chip"} key={type.id} onClick={() => { setActiveType(type.name); setTypeBrowserExpanded(true); }}><i /><span>{type.name}</span><small>{shelfBooks.filter((item) => item.bookType === type.name).length}</small></button>)}<button className="type-browser-more" onClick={() => setTypeBrowserExpanded((value) => !value)}>{typeBrowserExpanded ? "收起类型" : `展开其余 ${BOOK_TYPES.length - 6} 类`}</button></div>
        </aside>
        <section className="library-content">
          <header className="library-heading"><div><p>{shelfLabel}</p><h1>{activeType !== "全部类型" ? "类型图书" : activeCategory === "全部" ? "正在阅读" : "分类图书"}</h1><small className="import-format-note">当前可直接阅读 EPUB、PDF；TXT、MOBI、AZW3 等格式将作为后续解析器接入。</small></div><button className="sort-button"><SlidersHorizontal size={16} /> 最近阅读 <ChevronDown size={15} /></button></header>
          {visibleShelfBooks.length ? <div className="book-grid">{visibleShelfBooks.map((shelfBook) => {
            const shelfState = shelfBookStates.get(shelfBook.id) || getBookShelfState(shelfBook);
            return <article className="book-card" key={shelfBook.id}><BookCover book={shelfBook} /><div className="book-info"><div className="book-card-actions">{!shelfBook.local && <button className="book-delete-button" onClick={() => requestDeleteBook(shelfBook)} title="删除书籍"><X size={14} /></button>}</div><div className="book-tags"><span>{shelfBook.bookType || "待 AI 识别"}</span></div><h2>{shelfBook.title}</h2><p>{shelfBook.creator}</p><p className="publisher">{shelfBook.publisher || localFormatLabel(shelfBook)}</p><div className="book-progress"><span><i style={{ width: `${shelfState.percent}%` }} /></span><b>{shelfState.hasRead ? `${shelfState.percent}%` : "未读"}</b><small>{shelfState.label}</small></div><button className="read-button" onClick={() => openShelfBook(shelfBook)}>打开阅读 <ChevronRight size={17} /></button></div></article>;
          })}</div> : <div className="empty-library"><ListFilter size={28} /><strong>这个分类还没有图书</strong><span>你可以为《{book.title}》添加“{activeCategory}”标签。</span><button className="text-action" onClick={() => setCategoryModalOpen(true)}>管理分类</button></div>}
        </section>
        {categoryModalOpen && <CategoryModal categories={categories} selected={bookCategories} newCategory={newCategory} setNewCategory={setNewCategory} onAdd={addCategory} onToggle={toggleBookCategory} onClose={() => setCategoryModalOpen(false)} />}
        {deleteCandidate && <DeleteBookConfirmModal book={deleteCandidate} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmDeleteBook} />}
        {importStatus && <ImportProgressModal status={importStatus} />}
      </main>
    );
  }

  const contextualParagraphs = chapter.paragraphs.slice(Math.max(0, (selectedParagraph ?? 0) - 1), Math.min(chapter.paragraphs.length, (selectedParagraph ?? 0) + 2));
  const selectedIndexEntries = [...bookIndex.people, ...bookIndex.timeline, ...bookIndex.places]
    .filter((entry) => entry.occurrences.some((occurrence) => occurrence.chapterIndex === chapterIndex && occurrence.paragraphIndex === selectedParagraph));
  const currentPageRead = isPageRead(chapterIndex, pageIndex);
  const relationshipAvailable = (bookIndex.relationships || []).length > 0 && activeSpecialSkills.some(([name]) => /关系|指挥/.test(name));
  const readerTabs = ["目录", ...new Set([...(bookProfile?.facets || ["人物", "时间线", "地点"]).slice(0, 6), ...(relationshipAvailable ? ["关系"] : [])])];
  return (
    <main className={`reader-shell theme-${readingTheme}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <header className="reader-topbar">
        <button className="theme-toolbar-trigger" onClick={() => setThemeSettingsOpen(true)} title="阅读主题"><Palette size={16} /><span>主题</span></button>
        <button className="back-to-shelf" onClick={() => setScreen("shelf")}><ArrowLeft size={18} /> 书架</button>
        <div className="book-title"><BookOpen size={17} /><span>{book.title}</span><small>{book.creator}</small>{bookProfile && <small>{bookProfile.category}</small>}</div>
        <div className="reader-progress"><span>第 {chapterIndex + 1} 节</span><i><b style={{ width: `${progress}%` }} /></i><span>{progress}%</span></div>
        <div className="reader-status"><button className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={16} /> 搜索书内内容 <kbd>Ctrl K</kbd></button><button className="analysis-settings-trigger" onClick={() => setAnalysisSettingsOpen(true)} title="大模型分析设置"><Settings2 size={16} /> {analysisState.status === "done" ? "AI 索引" : "分析设置"}</button><button className="analysis-settings-trigger" onClick={() => setSidebarCollapsed((value) => !value)} title={sidebarCollapsed ? "展开阅读索引" : "收起阅读索引"}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button><span><ShieldCheck size={16} /> 本地阅读 · 无剧透</span></div>
      </header>
      <aside className="reader-sidebar">
        <nav className="reader-tabs"><button className={activePanel === "目录" ? "active directory-tab" : "directory-tab"} onClick={() => { setActivePanel("目录"); setFacetMenuOpen(false); }}>目录</button><div className="facet-picker"><button className={activePanel !== "目录" ? "facet-trigger active" : "facet-trigger"} onClick={() => setFacetMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={facetMenuOpen}><Sparkles size={14} /><span>{activePanel === "目录" ? "阅读索引" : activePanel}</span><ChevronDown size={14} /></button>{facetMenuOpen && <div className="facet-menu" role="menu">{readerTabs.filter((tab) => tab !== "目录").map((tab) => <button className={activePanel === tab ? "active" : ""} key={tab} role="menuitem" onClick={() => { setActivePanel(tab); setFacetMenuOpen(false); }}><span>{tab}</span><small>{facetDescription(tab)}</small></button>)}</div>}</div></nav>
        <div className="reader-side-content">
          {activePanel === "目录" && <><div className="toc-list">{book.chapters.map((item, index) => <button className={index === chapterIndex ? "toc-row active" : "toc-row"} key={item.id} onClick={() => selectChapter(index)}><span>{index + 1}</span>{item.title}</button>)}</div><BookmarkList items={bookmarks} onOpen={openBookmark} onRemove={removeBookmark} /><NoteList items={notes} onOpen={openNote} onRemove={removeNote} /></>}
          {activePanel === "人物" && <EntityIndexList title="人物" kind="person" items={bookIndex.people} icon={<Network size={16} />} activeCursor={getLatestReadCursor()} onItem={openIndexEntry} empty="尚未从正文结构中识别到可靠人物实体。" />}
          {activePanel === "时间线" && <TimelineList items={bookIndex.timeline} activeChapter={chapterIndex} activeCursor={getLatestReadCursor()} onItem={openIndexEntry} />}
          {activePanel === "地点" && <EntityIndexList title="地点" kind="place" items={bookIndex.places} icon={<MapPin size={16} />} activeCursor={getLatestReadCursor()} onItem={openIndexEntry} empty="尚未从正文结构中识别到可靠地点实体。" />}
          {activePanel !== "目录" && activePanel !== "人物" && activePanel !== "时间线" && activePanel !== "地点" && <FacetIndexPanel title={activePanel} category={bookProfile?.category} />}
        </div>
        <div className="side-book-meta"><span>共 {book.chapters.length} 节</span><span>{localFormatLabel(book)}</span></div>
      </aside>
      <section className="reading-stage">
        <header className="chapter-toolbar"><button disabled={chapterIndex === 0} onClick={() => selectChapter(chapterIndex - 1)}><ChevronLeft size={18} /></button><span>{chapter.title}</span><button disabled={chapterIndex === book.chapters.length - 1} onClick={() => selectChapter(chapterIndex + 1)}><ChevronRight size={18} /></button></header>
        <article className="epub-page">
          <div className="page-title-row"><h1>{chapter.title}</h1><span>{pageIndex + 1} / {pageCount} 页 {currentPageRead && <b className="read-page-tag">已读</b>}<button className={bookmarks.some((item) => item.id === `${chapterIndex}:${pageIndex}`) ? "page-bookmark active" : "page-bookmark"} onClick={toggleBookmark} title={bookmarks.some((item) => item.id === `${chapterIndex}:${pageIndex}`) ? "取消书签" : "添加书签"} aria-label="切换书签"><Bookmark size={16} /></button></span></div>
          <div className={`page-copy ${pageTurn ? `turn-${pageTurn}` : ""}`} ref={pageCopyRef} onMouseDown={closeDrawerOnBlank} onMouseUp={openSelectionBloom}><div className="page-track" ref={pageTrackRef} style={{ "--page-width": `${pageWidth}px` }}>{chapter.paragraphs.map((text, paragraphIndex) => <p className={selectedParagraph === paragraphIndex ? "is-selected" : ""} id={`paragraph-${paragraphIndex}`} key={`${chapter.id}-${paragraphIndex}`} onClick={() => selectParagraph(paragraphIndex)}>{text}{selectedParagraph === paragraphIndex && <span className="selection-tools" role="toolbar" aria-label="段落阅读辅助"><button onClick={(event) => { event.stopPropagation(); setDrawerOpen(true); }}><Clock3 size={14} /> 前文</button><button onClick={(event) => { event.stopPropagation(); setActivePanel("人物"); }}><Network size={14} /> 出处</button></span>}</p>)}</div></div>
        </article>
        <footer className="reader-footer"><button disabled={pageIndex === 0} onClick={() => turnPage(-1)}><ChevronLeft size={17} /> 上一页</button><span>第 {pageIndex + 1} / {pageCount} 页 <b className={currentPageRead ? "read-state read" : "read-state"}>{currentPageRead ? "已读" : "阅读中"}</b></span><button disabled={pageIndex === pageCount - 1} onClick={() => turnPage(1)}>下一页 <ChevronRight size={17} /></button></footer>
      </section>
      {drawerOpen && <section className="context-drawer"><div className="drawer-handle" /><header className="drawer-header"><div><span className="eyebrow">阅读上下文</span><strong>{chapter.title} · 第 {(selectedParagraph ?? 0) + 1} 段</strong></div><button onClick={() => setDrawerOpen(false)} title="收起阅读上下文"><X size={18} /></button></header><div className="context-grid"><section><h2><Sparkles size={17} /> 本地阅读提示</h2><p>这段内容位于《{book.title}》的“{chapter.title}”。选择其他段落后，可在此保留它与当前章节的上下文。</p>{selectedIndexEntries.length > 0 && <div className="context-entities">{selectedIndexEntries.map((entry) => <button key={entry.id} onClick={() => openIndexEntry(entry)}>{entry.name}</button>)}</div>}<span className="local-note">实体与日期均从本地原文识别，点击可回到其首个证据位置。</span></section><section><h2><Clock3 size={17} /> 相邻原文</h2>{contextualParagraphs.map((paragraph, index) => <button className="context-excerpt" key={paragraph} onClick={() => jumpToParagraph(Math.max(0, (selectedParagraph ?? 0) - 1) + index)}>{paragraph.slice(0, 86)}{paragraph.length > 86 ? "…" : ""}</button>)}</section><section><h2><FileText size={17} /> 出处</h2><dl className="source-data"><div><dt>书名</dt><dd>{book.title}</dd></div><div><dt>章节</dt><dd>{chapter.title}</dd></div><div><dt>位置</dt><dd>第 {(selectedParagraph ?? 0) + 1} 段</dd></div><div><dt>版本</dt><dd>{book.publisher || localFormatLabel(book)}</dd></div></dl><button className="source-jump" onClick={() => jumpToParagraph(selectedParagraph ?? 0)}>回到原文 <ChevronRight size={15} /></button></section></div></section>}
      {!drawerOpen && selectedParagraph !== null && <button className="open-context" onClick={() => setDrawerOpen(true)}><Lightbulb size={17} /> 打开阅读上下文</button>}
      {selectionBloom && <SelectionBloom selection={selectionBloom} theme={readingTheme} onAction={handleBloomAction} onClose={() => setSelectionBloom(null)} />}
      {noteComposerOpen && <NoteComposer draft={noteDraft} setDraft={setNoteDraft} selection={selectionBloom?.text || ""} onClose={() => setNoteComposerOpen(false)} onSave={saveNote} />}
      {searchOpen && <SearchDialog query={searchQuery} setQuery={setSearchQuery} results={searchResults} onSelect={openSearchResult} onClose={() => setSearchOpen(false)} />}
      {analysisSettingsOpen && <AnalysisSettingsModal settings={analysisSettings} setSettings={setAnalysisSettings} state={analysisState} onAnalyze={analyzeBook} onClose={() => setAnalysisSettingsOpen(false)} />}
      {analysisSummaryOpen && analysisRecord?.summary && <AnalysisSummaryModal summary={analysisRecord.summary} onClose={() => setAnalysisSummaryOpen(false)} />}
      {themeSettingsOpen && <ReadingThemeModal theme={readingTheme} onChange={setReadingTheme} onClose={() => setThemeSettingsOpen(false)} />}
      {relationshipOpen && <RelationshipWorkspace relationships={bookIndex.relationships || []} onEvidence={openRelationshipEvidence} onClose={() => { setRelationshipOpen(false); setActivePanel("目录"); }} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function ReadingThemeModal({ theme, onChange, onClose }) {
  return <div className="modal-backdrop theme-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="theme-modal" role="dialog" aria-modal="true" aria-label="阅读主题" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>阅读环境</span><h2>选择主题</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header>
      <p>主题仅调整纸色、强调色与阅读区边缘的极淡纹样，正文始终保持清晰。</p>
      <div className="theme-grid">
        {READING_THEMES.map((item) => { const Icon = item.icon; return <button className={theme === item.id ? "active" : ""} key={item.id} onClick={() => onChange(item.id)}><i className={`theme-swatch ${item.id}`}><Icon size={19} /></i><span><b>{item.name}</b><small>{item.detail}</small></span><Check size={15} /></button>; })}
      </div>
      <footer><button className="primary-button" onClick={onClose}>完成</button></footer>
    </section>
  </div>;
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
  const visibleRelationships = useMemo(() => view === "organization"
    ? relationships.filter((item) => item.relationKind === "command" || item.relationKind === "belongs")
    : relationships, [relationships, view]);
  const graph = useMemo(() => layoutRelationshipGraph(visibleRelationships, view === "organization" ? "TB" : "LR"), [visibleRelationships, view]);
  const selectedRelationship = visibleRelationships.find((item) => item.source === selectedName || item.target === selectedName) || visibleRelationships[0];
  const entities = useMemo(() => uniqueRelationshipEntities(visibleRelationships), [visibleRelationships]);

  return <section className="relationship-workspace" aria-label="关系图谱">
    <header className="relationship-header"><div><span>阅读图谱</span><h2>关系</h2><small>{visibleRelationships.length} 条可追溯关系</small></div><button onClick={onClose} title="关闭关系图谱"><X size={18} /></button></header>
    <div className="relationship-view-switch" role="tablist"><button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>关系图</button><button className={view === "organization" ? "active" : ""} onClick={() => setView("organization")}>组织架构</button><button className={view === "matrix" ? "active" : ""} onClick={() => setView("matrix")}>关系矩阵</button></div>
    <div className="relationship-canvas">
      {view === "matrix" ? <RelationshipMatrix entities={entities} relationships={visibleRelationships} onSelect={setSelectedName} /> : visibleRelationships.length ? <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable onNodeClick={(_event, node) => setSelectedName(node.data.entityName)} onEdgeClick={(_event, edge) => setSelectedName(edge.data.relationship.source)}><Background gap={18} size={1} color="#e3ebe2" /><MiniMap zoomable pannable nodeColor={(node) => relationshipNodeColor(node.data.entityType)} /><Controls showInteractive={false} /></ReactFlow> : <div className="relationship-empty">当前已读内容中，没有足以建立组织层级的可靠关系。</div>}
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

function SelectionBloom({ selection, theme, onAction, onClose }) {
  const actions = [
    { id: "question", label: "解惑", icon: Sparkles, className: "question" },
    { id: "recall", label: "回忆", icon: History, className: "recall" },
    { id: "note", label: "笔记", icon: FileText, className: "note" },
    { id: "people", label: "人物", icon: Network, className: "people" },
    { id: "timeline", label: "时间线", icon: Clock3, className: "timeline" },
    { id: "source", label: "出处", icon: Bookmark, className: "source" },
  ];
  return <div className={`selection-bloom theme-${theme}`} style={{ left: selection.x, top: selection.y }} role="dialog" aria-label="选中文本辅助" onMouseDown={(event) => event.stopPropagation()}>
    <div className="bloom-stem" />
    {actions.map((action, index) => { const Icon = action.icon; return <button className={`bloom-petal ${action.className}`} style={{ "--petal-index": index }} key={action.label} type="button" onClick={() => onAction(action.id)}><Icon size={15} /><span>{action.label}</span></button>; })}
    <button className="bloom-core" type="button" onClick={onClose} title="收起辅助选项"><i /><span>{selection.text}</span></button>
  </div>;
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
    {items.length ? <div>{[...items].sort((left, right) => right.createdAt - left.createdAt).map((item) => <article key={item.id}><button onClick={() => onOpen(item)}><b>{item.content}</b><span>{item.chapterTitle} · 第 {item.pageIndex + 1} 页</span></button><button className="remove-bookmark" onClick={() => onRemove(item.id)} title="删除笔记" aria-label={`删除 ${item.chapterTitle} 的笔记`}><X size={14} /></button></article>)}</div> : <p>选中文字后，可在莲花菜单中添加笔记。</p>}
  </section>;
}

function NoteComposer({ draft, setDraft, selection, onClose, onSave }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="note-composer" role="dialog" aria-modal="true" aria-label="添加笔记" onMouseDown={(event) => event.stopPropagation()}><header><div><span>选中文本</span><strong>{selection}</strong></div><button onClick={onClose} title="关闭"><X size={18} /></button></header><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写下你的想法…" autoFocus /><footer><button className="text-action" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.trim()} onClick={onSave}>保存笔记</button></footer></section></div>;
}

function IndexList({ title, items, icon, onItem, empty }) {
  return <div className="index-list"><h2>{icon}{title}</h2>{items.length ? items.map((item) => <button key={item.id} onClick={() => onItem(item)}><b>{item.name}</b><small>{item.subtitle}</small><span>{item.detail}</span></button>) : <p className="index-empty">{empty}</p>}</div>;
}

function BookCover({ book }) {
  if (book.cover) return <img src={book.cover} alt={`《${book.title}》封面`} />;
  return <div className="fallback-book-cover"><span>{book.bookType || "本地书籍"}</span><strong>{book.title}</strong><small>{APP_NAME}</small></div>;
}

function DeleteBookConfirmModal({ book, onCancel, onConfirm }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}><section className="delete-book-modal" role="dialog" aria-modal="true" aria-label="确认删除书籍" onMouseDown={(event) => event.stopPropagation()}><header><div><span>删除书籍</span><h2>确认删除《{book.title}》？</h2></div><button onClick={onCancel} title="关闭"><X size={18} /></button></header><p>这会从当前书架移除这本书。你的本地原始文件不会被删除，但本应用内与该导入项关联的入口会消失。</p><footer><button className="text-action" onClick={onCancel}>取消</button><button className="danger-button" onClick={onConfirm}>确认删除</button></footer></section></div>;
}

function FacetIndexPanel({ title, category }) {
  return <div className="facet-index"><span>{category || "阅读索引"}</span><h2>{title}</h2><p>本书将围绕“{title}”整理可追溯内容；完成模型分析后，这里会展示对应条目与原文证据。</p></div>;
}

function EntityIndexList({ title, kind, items, icon, activeCursor, onItem, empty }) {
  const grouped = prioritizeIndexEntries(items, activeCursor, kind);
  const featured = grouped.important.length ? grouped.important.slice(0, 4) : grouped.recent.slice(0, 4);
  const featuredIds = new Set(featured.map((item) => item.id));
  const recent = grouped.important.length ? grouped.recent.filter((item) => !featuredIds.has(item.id)).slice(0, 3) : [];
  const recentIds = new Set(recent.map((item) => item.id));
  const rest = [...grouped.important.slice(4), ...grouped.secondary].filter((item) => !featuredIds.has(item.id) && !recentIds.has(item.id));
  const heading = grouped.important.length ? `重大${title}` : `最近出现的${title}`;
  return <div className="entity-index"><header>{icon}<div><strong>{heading}</strong><span>{grouped.important.length} 个主线项 · {grouped.recent.length} 个最近项</span></div></header>{featured.length ? <div className="entity-group">{featured.map((item) => <EntityRow key={item.id} item={item} onItem={onItem} kind={kind} />)}</div> : <p className="index-empty">{empty}</p>}{recent.length > 0 && <section className="recent-entities"><h3>最近已读</h3>{recent.map((item) => <EntityRow key={item.id} item={item} onItem={onItem} kind={kind} compact />)}</section>}{rest.length > 0 && <details className="secondary-entities"><summary>展开其余{title} <span>{rest.length}</span></summary><div>{rest.map((item) => <EntityRow key={item.id} item={item} onItem={onItem} kind={kind} compact />)}</div></details>}</div>;
}

function EntityRow({ item, onItem, kind, compact = false }) {
  const description = kind === "place" && item.subtitle && !/^地点实体/.test(item.subtitle) ? item.subtitle : item.detail;
  return <button className={compact ? "entity-row compact" : "entity-row"} onClick={() => onItem(item)}><div className="entity-row-heading"><b>{item.name}</b>{kind === "person" && item.attributes?.length > 0 && <em className="entity-attributes">{item.attributes.map((attribute) => <i key={attribute}>{attribute}</i>)}</em>}</div><span>{description}</span></button>;
}

function TimelineList({ items, activeChapter, activeCursor, onItem }) {
  if (!items.length) return <div className="timeline-list"><header><Clock3 size={16} /><div><strong>正文时间线</strong><span>尚未识别到明确日期</span></div></header></div>;

  const grouped = prioritizeIndexEntries(items, activeCursor, "timeline");
  const featured = grouped.important.length ? grouped.important : grouped.recent.slice(0, 8);
  const featuredIds = new Set(featured.map((item) => item.id));
  const recent = grouped.important.length ? grouped.recent.filter((item) => !featuredIds.has(item.id)).slice(0, 4) : [];
  const rest = [...recent, ...grouped.secondary].filter((item, index, list) => !featuredIds.has(item.id) && list.findIndex((candidate) => candidate.id === item.id) === index);

  return <div className="timeline-list">
    <header><Clock3 size={16} /><div><strong>{grouped.important.length ? "重大时间线" : "最近时间线"}</strong><span>{grouped.important.length} 个历史节点 · {grouped.recent.length} 个最近项</span></div></header>
    <div className="timeline-track">
      {featured.map((item) => {
        const isCurrent = item.occurrence.chapterIndex === activeChapter;
        return <button className={isCurrent ? "timeline-event active" : "timeline-event"} key={item.id} onClick={() => onItem(item)}>
          <span className="timeline-node" aria-hidden="true" />
          <time>{item.name}</time>
          <strong>{item.subtitle}</strong>
          <p>{item.detail}</p>
          <small>第 {item.occurrence.chapterIndex + 1} 节 · 原文证据</small>
        </button>;
      })}
    </div>
    {rest.length > 0 && <details className="secondary-entities timeline-secondary"><summary>展开其余时间 <span>{rest.length}</span></summary><div>{rest.map((item) => <button className="entity-row compact" key={item.id} onClick={() => onItem(item)}><div className="entity-row-heading"><b>{item.name}</b></div><span>{item.subtitle}</span></button>)}</div></details>}
  </div>;
}

function prioritizeIndexEntries(items, activeCursor, kind) {
  const important = items
    .filter((item, index) => isImportantEntry(item, index, kind))
    .sort(compareIndexEntries);
  const importantIds = new Set(important.map((item) => item.id));
  const recent = getRecentIndexEntries(items, activeCursor)
    .filter((item) => !importantIds.has(item.id));
  const recentIds = new Set(recent.map((item) => item.id));
  const secondary = items
    .filter((item) => !importantIds.has(item.id) && !recentIds.has(item.id))
    .sort(compareIndexEntries);
  return { important, recent, secondary };
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

function buildReadingIndex(chapters) {
  const personEntries = buildEntityEntries("person", chapters);
  const placeEntries = buildEntityEntries("place", chapters);
  const timeline = [];
  const seenDates = new Set();

  chapters.forEach((chapter, chapterIndex) => {
    if (isNonNarrativeChapter(chapter.title)) return;
    chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
      if (isPublicationMetadata(paragraph)) return;
      const matches = paragraph.matchAll(/(?:(?:[12]\d{3}|[零〇一二三四五六七八九]{4})年(?:(?:\d{1,2}|[一二三四五六七八九十]{1,3})月(?:(?:\d{1,2}|[一二三四五六七八九十]{1,3})[日号])?)?)/g);
      [...matches].forEach((match) => {
        const name = match[0];
        if (seenDates.has(name) || timeline.length >= 60) return;
        seenDates.add(name);
        timeline.push({
          id: `time-${name}`,
          name,
          sortKey: parseTimelineDate(name),
          subtitle: chapter.title,
          detail: evidenceSnippet(paragraph, name),
          priority: isMajorTimelineParagraph(paragraph, chapter.title) ? "primary" : "secondary",
          historicalWeight: isMajorTimelineParagraph(paragraph, chapter.title) ? "major" : "minor",
          occurrence: { chapterIndex, paragraphIndex },
          occurrences: [{ chapterIndex, paragraphIndex }],
        });
      });
    });
  });

  timeline.sort((left, right) => left.sortKey - right.sortKey || left.occurrence.chapterIndex - right.occurrence.chapterIndex || left.occurrence.paragraphIndex - right.occurrence.paragraphIndex);
  return { people: personEntries, places: placeEntries, timeline };
}

function buildEntityEntries(type, chapters) {
  const candidates = new Map();
  chapters.forEach((chapter, chapterIndex) => chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
    extractEntityCandidates(type, paragraph).forEach((name) => {
      const occurrences = candidates.get(name) || [];
      occurrences.push({ chapterIndex, paragraphIndex, paragraph, chapterTitle: chapter.title });
      candidates.set(name, occurrences);
    });
  }));

  const names = new Set(candidates.keys());
  return [...candidates.entries()]
    .filter(([, occurrences]) => occurrences.length >= 2)
    .map(([name, occurrences]) => {
      const first = occurrences[0];
      const coMentioned = type === "person"
        ? extractEntityCandidates("person", first.paragraph).filter((candidate) => candidate !== name && names.has(candidate)).slice(0, 3)
        : [];
      return {
        id: `${type}-${name}`,
        name,
        subtitle: type === "person" ? `人物实体 · ${occurrences.length} 处` : `地点实体 · ${occurrences.length} 处`,
        detail: type === "place"
          ? describePlaceEntity(name, occurrences)
          : coMentioned.length ? `同段提及：${coMentioned.join("、")}` : `${first.chapterTitle} · 原文证据`,
        priority: classifyEntityPriority(type, occurrences),
        importanceScore: scoreEntityImportance(type, occurrences),
        occurrence: first,
        occurrences,
      };
    })
    .sort((left, right) => right.occurrences.length - left.occurrences.length || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, 40);
}

function classifyEntityPriority(type, occurrences) {
  return scoreEntityImportance(type, occurrences) >= 3 ? "primary" : "secondary";
}

function scoreEntityImportance(type, occurrences) {
  const text = occurrences.map((occurrence) => `${occurrence.chapterTitle || ""} ${occurrence.paragraph || ""}`).join("\n");
  const keywordPattern = type === "place"
    ? /(战役|会战|突破|渡|占领|抵达|进入|离开|转移|集结|会师|根据地|要地|路线|行军|驻扎|包围|封锁|进攻|撤退|牺牲|胜利|失败|会议|决策|命令)/
    : /(主席|司令|军长|政委|书记|将军|领导|指挥|命令|率领|决定|部署|会见|会议|谈判|牺牲|被俘|冲突|协作|反对|支持|关键|核心)/;
  const spread = new Set(occurrences.map((occurrence) => occurrence.chapterIndex)).size;
  let score = 0;
  if (occurrences.length >= 4) score += 2;
  else if (occurrences.length >= 2) score += 1;
  if (spread >= 2) score += 1;
  if (keywordPattern.test(text)) score += 2;
  return score;
}

function isMajorTimelineParagraph(paragraph, chapterTitle = "") {
  return /(战役|会战|会议|决定|命令|突破|转折|开始|结束|胜利|失败|牺牲|会师|渡江|渡河|进攻|撤退|包围|封锁|占领|抵达|转移|长征|红军)/.test(`${chapterTitle} ${paragraph}`);
}

function describePlaceEntity(name, occurrences) {
  const chapterTitles = [...new Set(occurrences.map((occurrence) => occurrence.chapterTitle).filter(Boolean))].slice(0, 2);
  const chapterText = chapterTitles.length ? `，集中出现在${chapterTitles.join("、")}等已读章节` : "";
  return `${name}是已读内容中反复出现的地点${chapterText}，可作为理解行动路径和事件发生空间的线索。`;
}

function evidenceSnippet(paragraph, keyword) {
  const index = paragraph.indexOf(keyword);
  const start = Math.max(0, index - 18);
  const end = Math.min(paragraph.length, index + keyword.length + 32);
  return `${start ? "…" : ""}${paragraph.slice(start, end)}${end < paragraph.length ? "…" : ""}`;
}

function extractEntityCandidates(type, paragraph) {
  const pattern = type === "person"
    ? /(?:^|[，。；：“”])([\u4e00-\u9fff]{2,3})(?=(?:同志|先生|女士|主席|将军|司令|书记|教授|说|道|表示|认为|回忆|指出|写道|问道|回答))/g
    : /(?:在|到达|抵达|进入|离开|来自|前往|穿过|经过|位于|返回)([\u4e00-\u9fff]{2,8}(?:省|市|县|镇|村|乡|州|国|岛|山|河|江|湖|桥|关|口|岭|湾|原|谷|城))/g;
  const candidates = new Set();
  [...paragraph.matchAll(pattern)].forEach((match) => {
    const candidate = match[1].trim();
    if (candidate.length >= 2 && !/^(我们|他们|你们|这里|那里|自己|中国|中央|红军|部队)$/.test(candidate)) candidates.add(candidate);
  });
  return [...candidates];
}

function isNonNarrativeChapter(title) {
  return /^(序|序言|前言|引言|代序|后记|跋|再版序|出版说明|版权页|目录)/.test(title.trim());
}

function isPublicationMetadata(paragraph) {
  return /(ISBN|版权所有|版权|版次|印刷|出版(?:社|日期|发行|信息)?|责任编辑|装帧|开本|定价|字数|第\s*\d+\s*版|第\s*\d+\s*次印刷|本书由)/i.test(paragraph);
}

function parseTimelineDate(value) {
  const arabic = value.match(/(\d{4})年(?:(\d{1,2})月)?(?:(\d{1,2})[日号])?/);
  if (arabic) return Date.UTC(Number(arabic[1]), Number(arabic[2] || 1) - 1, Number(arabic[3] || 1));

  const chinese = value.match(/([零〇一二三四五六七八九]{4})年(?:([一二三四五六七八九十]+)月)?(?:([一二三四五六七八九十]+)[日号])?/);
  if (!chinese) return Number.MAX_SAFE_INTEGER;
  const year = [...chinese[1]].map((digit) => ({ 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[digit]).join("");
  return Date.UTC(Number(year), chineseNumber(chinese[2]) - 1, chineseNumber(chinese[3]));
}

function chineseNumber(value) {
  if (!value) return 1;
  if (value === "十") return 10;
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!value.includes("十")) return digits[value] || 1;
  const [tens, units] = value.split("十");
  return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
}

function searchBook(chapters, query) {
  const keyword = query.trim();
  if (!keyword) return [];
  const results = [];
  chapters.forEach((chapter, chapterIndex) => {
    chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
      const matchIndex = paragraph.indexOf(keyword);
      if (matchIndex < 0) return;
      const start = Math.max(0, matchIndex - 32);
      const end = Math.min(paragraph.length, matchIndex + keyword.length + 54);
      results.push({ chapterIndex, chapterTitle: chapter.title, paragraphIndex, excerpt: `${start ? "…" : ""}${paragraph.slice(start, end)}${end < paragraph.length ? "…" : ""}` });
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

function createClassificationPayload(book) {
  return {
    title: book.title,
    creator: book.creator,
    publisher: book.publisher,
    language: book.language,
    tableOfContents: book.chapters.slice(0, 18).map((chapter) => chapter.title),
    sampleText: book.chapters.slice(0, 4).map((chapter) => ({
      title: chapter.title,
      paragraphs: chapter.paragraphs.slice(0, 4).map((paragraph) => paragraph.slice(0, 360)),
    })),
  };
}

function getFileExtension(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "";
}

function localFormatLabel(book) {
  return `本地 ${book?.format || "EPUB"}`;
}

function SearchDialog({ query, setQuery, results, onSelect, onClose }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return <div className="search-backdrop" role="presentation" onMouseDown={onClose}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索书内内容" onMouseDown={(event) => event.stopPropagation()}><header><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物、地点、事件或任意文字" /><button onClick={onClose} title="关闭搜索"><X size={18} /></button></header>{query.trim() ? <div className="search-results">{results.length ? results.map((result) => <button key={`${result.chapterIndex}-${result.paragraphIndex}`} onClick={() => onSelect(result)}><span><small>{result.chapterTitle} · 第 {result.paragraphIndex + 1} 段</small><b>{highlightMatch(result.excerpt, query.trim())}</b></span><ChevronRight size={16} /></button>) : <div className="search-empty"><Search size={24} /><strong>书内没有找到“{query}”</strong><span>试试人物、地点或更短的关键词。</span></div>}</div> : <div className="search-empty"><BookOpen size={25} /><strong>在《长征》中查找</strong><span>输入人物、地点、事件，或直接输入一段原文。</span><div className="search-suggestions"><button onClick={() => setQuery("湘江")}>湘江</button><button onClick={() => setQuery("遵义")}>遵义</button><button onClick={() => setQuery("红军")}>红军</button></div></div>}<footer><span>所有结果都来自本地图书</span><kbd>Esc</kbd> 关闭</footer></section></div>;
}

function highlightMatch(text, query) {
  const parts = text.split(query);
  return parts.map((part, index) => <span key={`${part}-${index}`}>{part}{index < parts.length - 1 && <mark>{query}</mark>}</span>);
}

function ImportProgressModal({ status }) {
  const progress = status.total ? Math.round((status.current / status.total) * 100) : 0;
  return <div className="import-progress-backdrop" role="status" aria-live="polite"><section className="import-progress-card"><div className="import-orbit" aria-hidden="true"><i /><i /><i /></div><div><span>导入书籍</span><h2>{status.stage}</h2><p>{status.title || "正在准备书籍文件"}</p></div><div className="import-progress-line"><i style={{ width: `${progress}%` }} /></div><footer><span>{status.current || 0} / {status.total || 1} 本</span><span>{status.classified || 0} 本已分类</span>{!!status.failed && <span>{status.failed} 本失败</span>}</footer></section></div>;
}

function CategoryModal({ categories, selected, newCategory, setNewCategory, onAdd, onToggle, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="category-modal" role="dialog" aria-modal="true" aria-label="管理图书分类" onMouseDown={(event) => event.stopPropagation()}><header><div><span>图书分类</span><h2>整理《长征》</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header><p>选择这本书所属的分类。分类与阅读进度只保存在当前浏览器。</p><div className="category-checks">{categories.map((category) => <label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={() => onToggle(category)} /><span>{category}</span><i><Check size={13} /></i></label>)}</div><form onSubmit={onAdd}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="新建分类，例如：长篇纪实" /><button className="text-action" type="submit"><FolderPlus size={16} /> 新建</button></form><footer><button className="primary-button" onClick={onClose}>完成</button></footer></section></div>;
}

function LegacyAnalysisSettingsModal({ settings, setSettings, state, onAnalyze, onClose }) {
  const isAnalyzing = state.status === "loading";
  const updateProvider = (provider) => setSettings((current) => ({
    provider,
    model: provider === "deepseek" ? "deepseek-v4-flash" : "gpt-4.1-mini",
  }));
  const selectMode = (analysisMode) => setSettings((current) => ({ ...current, analysisMode }));
  const adjustThreshold = (amount) => setSettings((current) => ({ ...current, autoPageThreshold: Math.max(1, Math.min(50, Number(current.autoPageThreshold || 5) + amount)) }));
  const analysisScope = settings.analysisMode === "full" ? "full" : "read";
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="analysis-modal" role="dialog" aria-modal="true" aria-label="大模型分析设置" onMouseDown={(event) => event.stopPropagation()}><header><div><span>阅读分析</span><h2>大模型设置</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header><p>模型只输出可追溯的主线人物、地点和事件。密钥仅从本机 <code>.env</code> 读取，不会进入浏览器。</p><fieldset><legend>分析模式</legend><div className="analysis-mode-control"><button className={settings.analysisMode === "auto" ? "active" : ""} onClick={() => selectMode("auto")}>自动</button><button className={settings.analysisMode === "read" ? "active" : ""} onClick={() => selectMode("read")}>已读</button><button className={settings.analysisMode === "full" ? "active" : ""} onClick={() => selectMode("full")}>全书</button></div></fieldset>{settings.analysisMode === "auto" && <div className="auto-analysis-options"><label className="auto-switch"><input type="checkbox" checked onChange={() => selectMode("read")} /><span>自动分析</span></label><div className="page-stepper"><span>每读</span><button title="减少页数" onClick={() => adjustThreshold(-1)}><Minus size={14} /></button><b>{settings.autoPageThreshold}</b><button title="增加页数" onClick={() => adjustThreshold(1)}><Plus size={14} /></button><span>页后分析</span></div></div>}{settings.analysisMode === "full" && <div className="full-analysis-note">将读取整本书并重新建立索引，耗时较长。</div>}<fieldset><legend>提供方</legend><div className="provider-options"><label><input type="radio" name="provider" checked={settings.provider === "deepseek"} onChange={() => updateProvider("deepseek")} /><span>DeepSeek</span><small>默认</small></label><label><input type="radio" name="provider" checked={settings.provider === "openai"} onChange={() => updateProvider("openai")} /><span>OpenAI</span></label></div></fieldset><label className="model-field">模型名称<input value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} placeholder="deepseek-v4-flash" /></label><div className={`analysis-state ${state.status}`}>{state.message}</div><footer><button className="text-action" onClick={onClose}>取消</button><button className="primary-button" disabled={isAnalyzing || !settings.model.trim()} onClick={() => onAnalyze(analysisScope)}>{isAnalyzing ? "正在分析" : settings.analysisMode === "full" ? "全书分析" : "分析已读内容"}</button></footer></section></div>;
}

function AnalysisSettingsModal({ settings, setSettings, state, onAnalyze, onClose }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isAnalyzing = state.status === "loading";
  const updateProvider = (provider) => setSettings((current) => ({
    ...current,
    provider,
    model: provider === "deepseek" ? "deepseek-v4-flash" : "gpt-4.1-mini",
  }));
  const adjustThreshold = (amount) => setSettings((current) => ({ ...current, autoPageThreshold: Math.max(1, Math.min(50, Number(current.autoPageThreshold || 5) + amount)) }));
  const runReadAnalysis = () => {
    setSettings((current) => ({ ...current, analysisMode: "read" }));
    onAnalyze("read");
  };
  const runFullAnalysis = () => {
    setSettings((current) => ({ ...current, analysisMode: "full" }));
    onAnalyze("full");
  };
  const toggleAuto = () => setSettings((current) => ({ ...current, analysisMode: current.analysisMode === "auto" ? "read" : "auto" }));

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="analysis-modal ai-reading-modal" role="dialog" aria-modal="true" aria-label="AI 阅读" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>AI 阅读</span><h2>更新阅读索引</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header>
      <p>围绕已读内容整理人物、地点、时间线和关系，并把每个结论回链到原文。默认只分析你已经读到的位置。</p>
      <div className="ai-quick-actions">
        <button className="primary-button" disabled={isAnalyzing || !settings.model.trim()} onClick={runReadAnalysis}><Sparkles size={16} /> {isAnalyzing ? "正在分析" : "分析已读内容"}</button>
        <button className="text-action" disabled={isAnalyzing || !settings.model.trim()} onClick={runFullAnalysis}><BookOpen size={16} /> 全书分析</button>
      </div>
      <div className={`analysis-state ${state.status}`}>{state.message}</div>
      <section className="ai-auto-row">
        <label className="auto-switch"><input type="checkbox" checked={settings.analysisMode === "auto"} onChange={toggleAuto} /><span>自动更新索引</span></label>
        <div className="page-stepper"><span>每读</span><button title="减少页数" onClick={() => adjustThreshold(-1)}><Minus size={14} /></button><b>{settings.autoPageThreshold}</b><button title="增加页数" onClick={() => adjustThreshold(1)}><Plus size={14} /></button><span>页</span></div>
      </section>
      <button className="ai-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>{advancedOpen ? "收起模型设置" : "模型设置"} <ChevronDown size={14} /></button>
      {advancedOpen && <div className="ai-advanced-panel">
        <fieldset><legend>提供方</legend><div className="provider-options"><label><input type="radio" name="provider" checked={settings.provider === "deepseek"} onChange={() => updateProvider("deepseek")} /><span>DeepSeek</span><small>默认</small></label><label><input type="radio" name="provider" checked={settings.provider === "openai"} onChange={() => updateProvider("openai")} /><span>OpenAI</span></label></div></fieldset>
        <label className="model-field">模型名称<input value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} placeholder="deepseek-v4-flash" /></label>
        <p className="ai-key-note">API Key 只从本机 .env 读取，不进入浏览器。</p>
      </div>}
      <footer><button className="text-action" onClick={onClose}>关闭</button></footer>
    </section>
  </div>;
}

function AnalysisSummaryModal({ summary, onClose }) {
  const cursor = summary.cursor || {};
  const checkpointLabel = cursor.scope === "full" ? `已完成全书分析 · 至第 ${Number(cursor.chapterIndex || 0) + 1} 节末` : `已分析至 第 ${Number(cursor.chapterIndex || 0) + 1} 节 · 第 ${Number(cursor.pageIndex || 0) + 1} / ${cursor.pageCount || 1} 页`;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="analysis-summary-modal" role="dialog" aria-modal="true" aria-label="本轮阅读分析摘要" onMouseDown={(event) => event.stopPropagation()}><header><div><span>阅读记忆已更新</span><h2>本轮分析摘要</h2></div><button onClick={onClose} title="关闭"><X size={19} /></button></header><div className="analysis-checkpoint">{checkpointLabel}</div><SummaryEntitySection title="人物" value={summary.people} empty="本轮未确认新的核心人物" /><SummaryEntitySection title="地点" value={summary.places} empty="本轮未确认新的关键地点" /><section><h3>关键事件</h3><ul>{summary.events?.length ? summary.events.map((event) => <li key={event}>{event}</li>) : <li>本轮未确认新的主线事件</li>}</ul></section><footer><button className="primary-button" onClick={onClose}>继续阅读</button></footer></section></div>;
}

function SummaryEntitySection({ title, value, empty }) {
  const groups = Array.isArray(value) ? { primary: value, recent: [], secondary: [] } : value || {};
  return <section><h3>{title}</h3>{groups.primary?.length ? <p><b>主要：</b>{groups.primary.join("、")}</p> : <p>{empty}</p>}{groups.recent?.length > 0 && <p><b>最近：</b>{groups.recent.join("、")}</p>}{groups.secondary?.length > 0 && <p><b>次级：</b>{groups.secondary.join("、")}</p>}</section>;
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
    const paragraphs = chapter.paragraphs.slice(Math.max(0, start), Math.max(0, end));
    if (paragraphs.length) source.push({ sourceChapterIndex: chapterIndex, title: chapter.title, paragraphs });
  }
  return source;
}

function getFullBookContent(chapters) {
  return chapters.map((chapter, sourceChapterIndex) => ({ sourceChapterIndex, title: chapter.title, paragraphs: chapter.paragraphs }));
}

function getFullBookCursor(book) {
  const chapterIndex = Math.max(0, book.chapters.length - 1);
  const paragraphIndex = Math.max(0, book.chapters[chapterIndex]?.paragraphs.length - 1);
  return { chapterIndex, paragraphIndex, pageIndex: 0, pageCount: 1, scope: "full" };
}

function countReadPagesAfter(readPages, cursor) {
  if (!cursor) return readPages.length;
  return readPages.filter((page) => page.chapterIndex > cursor.chapterIndex || (page.chapterIndex === cursor.chapterIndex && page.pageIndex > cursor.pageIndex)).length;
}

function analysisStorageKey(book) {
  return `yuezhi-analysis:${book.title}:${book.creator || "unknown"}:${book.chapters.length}`;
}

function readPagesStorageKey(book) {
  return `yuezhi-read-pages:${storageBookIdentity(book)}`;
}

function readingPositionStorageKey(book) {
  return `yuezhi-reading-position:${book.id || book.title}:${book.creator || "unknown"}:${book.chapters.length}`;
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
