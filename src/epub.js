import JSZip from "jszip";

function normalisePath(base, href) {
  const fragmentFreeHref = href.split("#")[0];
  let cleanHref = fragmentFreeHref;
  try {
    cleanHref = decodeURIComponent(fragmentFreeHref);
  } catch {
    // Keep malformed escape sequences readable enough for ZIP lookup.
  }
  const parts = `${base}/${cleanHref}`.split("/");
  const resolved = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  });
  return resolved.join("/");
}

function imageHrefFromElement(element) {
  return element.getAttribute("src")
    || element.getAttribute("href")
    || element.getAttributeNS("http://www.w3.org/1999/xlink", "href")
    || element.getAttribute("xlink:href")
    || "";
}

async function resolveImageDataUrl(zip, chapterPath, src) {
  if (!src) return "";
  if (/^data:/i.test(src)) return src;
  if (/^(https?:|file:|blob:)/i.test(src)) return "";
  const chapterDir = chapterPath.split("/").slice(0, -1).join("/");
  const path = normalisePath(chapterDir, src.split("#")[0]);
  const entry = zip.file(path);
  if (!entry) return "";
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const mime = ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
        : ext === "svg" ? "image/svg+xml"
          : "image/jpeg";
  const base64 = await entry.async("base64");
  return `data:${mime};base64,${base64}`;
}

async function blocksFromDocument(source, zip, chapterPath) {
  const document = new DOMParser().parseFromString(source, "application/xhtml+xml");
  const heading = document.querySelector("h1, h2, h3")?.textContent?.trim() || "";
  const paragraphs = [];
  const seenSrc = new Set();

  const pushImage = async (element) => {
    const href = imageHrefFromElement(element);
    if (!href || seenSrc.has(href)) return;
    const dataUrl = await resolveImageDataUrl(zip, chapterPath, href);
    if (!dataUrl) return;
    seenSrc.add(href);
    paragraphs.push({
      type: "image",
      src: dataUrl,
      alt: element.getAttribute("alt") || "",
    });
  };

  for (const paragraph of document.querySelectorAll("p")) {
    for (const image of paragraph.querySelectorAll("img, image")) {
      await pushImage(image);
    }
    const text = (paragraph.textContent || "").replace(/\s+/g, " ").trim();
    // Keep short front-matter lines (title/author); drop empty / single-glyph junk.
    if (text.length >= 2) paragraphs.push(text);
  }

  const body = document.querySelector("body") || document.documentElement;
  for (const image of body.querySelectorAll("img, image")) {
    if (image.closest("p")) continue;
    await pushImage(image);
  }

  return { heading, paragraphs };
}

/** Pure page-number labels from PDF-reflow EPUBs (e.g. bare "3"). */
export function isPageNumberTitle(title) {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const unwrapped = clean.replace(/^[\s·.•\-—–_（()）\[\]]+|[\s·.•\-—–_（()）\[\]]+$/g, "");
  return /^\d{1,4}$/.test(unwrapped);
}

/** Reject page-number / trivial headings so TOC does not show bare "3". */
export function isUsableChapterTitle(title) {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  if (clean.length < 2) return false;
  if (isPageNumberTitle(clean)) return false;
  return true;
}

function addNavigationLabel(labels, basePath, href, label) {
  const cleanLabel = (label || "").replace(/\s+/g, " ").trim();
  if (!href || !isUsableChapterTitle(cleanLabel)) return;
  const path = normalisePath(basePath, href);
  if (!labels.has(path)) labels.set(path, cleanLabel);
}

function resolveChapterTitle(navigationLabel, heading, fallbackIndex) {
  if (isUsableChapterTitle(navigationLabel)) return String(navigationLabel).replace(/\s+/g, " ").trim();
  if (isUsableChapterTitle(heading)) return String(heading).replace(/\s+/g, " ").trim();
  return `第 ${fallbackIndex} 节`;
}

/**
 * True when a chapter has real reading prose.
 * Images alone do not count — empty / cover / image-only spines must not appear in the TOC.
 */
export function chapterHasReadableText(chapter) {
  return (Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : []).some(
    (item) => typeof item === "string" && item.trim().length >= 2,
  );
}

/** Cover / TOC / back-cover spine items that must not appear as reading chapters. */
export function isStructuralShellChapter(chapter) {
  const title = String(chapter?.title || "").replace(/\s+/g, " ").trim();
  const href = String(chapter?.href || "").replace(/\\/g, "/").toLowerCase();
  if (/^(封面|目录|封底)$/.test(title)) return true;
  if (/(?:^|\/)(?:cover_page|titlepage|toc|nav)[^/]*\.(?:xhtml|html)$/i.test(href)) return true;
  if (/cover_page|titlepage/.test(href)) return true;
  return false;
}

/** Hard rule: no readable prose → never a TOC row / reading chapter. */
export function shouldOmitFromToc(chapter) {
  return isStructuralShellChapter(chapter) || !chapterHasReadableText(chapter);
}

/** Fallback titles like「第 3 节」assigned before merges; renumber after TOC cleanup. */
export function isSyntheticChapterTitle(title) {
  return /^第\s*\d+\s*节$/.test(String(title || "").replace(/\s+/g, " ").trim());
}

/**
 * Drop cover/TOC/image-only spine items from the TOC.
 * Cover/shell images are discarded (shelf already has the cover) — never injected into body chapters.
 * Then merge Calibre page-number fragments (title "3") into the previous chapter.
 */
export function normalizeChapterList(chapters) {
  const source = Array.isArray(chapters) ? chapters : [];
  if (!source.length) return { chapters: [], indexMap: [], changed: false };

  const withText = [];
  const interimMap = [];
  let pendingImages = [];
  let changed = false;

  source.forEach((chapter, oldIndex) => {
    if (shouldOmitFromToc(chapter)) {
      // Keep only non-shell image-only fragments for the next prose chapter.
      if (!isStructuralShellChapter(chapter)) {
        pendingImages.push(...(chapter.paragraphs || []));
      }
      interimMap[oldIndex] = withText.length;
      changed = true;
      return;
    }
    const paragraphs = pendingImages.length
      ? [...pendingImages, ...(chapter.paragraphs || [])]
      : [...(chapter.paragraphs || [])];
    if (pendingImages.length) {
      pendingImages = [];
      changed = true;
    }
    interimMap[oldIndex] = withText.length;
    withText.push({
      ...chapter,
      paragraphs,
    });
  });

  if (pendingImages.length && withText.length) {
    const last = withText[withText.length - 1];
    last.paragraphs = [...last.paragraphs, ...pendingImages];
    pendingImages = [];
    changed = true;
  }

  for (let i = 0; i < interimMap.length; i += 1) {
    if (interimMap[i] >= withText.length) interimMap[i] = Math.max(0, withText.length - 1);
  }

  const merged = [];
  const indexMap = [];
  withText.forEach((chapter, midIndex) => {
    if (merged.length && isPageNumberTitle(chapter?.title)) {
      const prev = merged[merged.length - 1];
      prev.paragraphs = [...(prev.paragraphs || []), ...(chapter.paragraphs || [])];
      indexMap[midIndex] = merged.length - 1;
      changed = true;
      return;
    }
    indexMap[midIndex] = merged.length;
    merged.push({
      ...chapter,
      paragraphs: [...(chapter.paragraphs || [])],
    });
  });

  const normalized = merged.map((chapter, index) => {
    const rawTitle = String(chapter.title || "").replace(/\s+/g, " ").trim();
    const keepTitle = isUsableChapterTitle(rawTitle) && !isSyntheticChapterTitle(rawTitle);
    const title = keepTitle ? rawTitle : `第 ${index + 1} 节`;
    if (title !== chapter.title || chapter.id !== `chapter-${index}`) changed = true;
    return {
      ...chapter,
      id: `chapter-${index}`,
      title,
    };
  });

  const finalMap = interimMap.map((mid) => indexMap[mid] ?? mid);
  return { chapters: normalized, indexMap: finalMap, changed };
}

/** @deprecated use normalizeChapterList */
export function consolidatePageNumberChapters(chapters) {
  return normalizeChapterList(chapters);
}

async function chapterLabelsFromNavigation(zip, manifest, basePath) {
  const labels = new Map();
  const navigationItems = [...manifest.values()].filter((item) => item.properties.split(/\s+/).includes("nav"));
  const ncxItems = [...manifest.values()].filter((item) => item.type === "application/x-dtbncx+xml");

  for (const item of [...navigationItems, ...ncxItems]) {
    if (!item.href) continue;
    const navigationPath = normalisePath(basePath, item.href);
    const entry = zip.file(navigationPath);
    if (!entry) continue;
    const source = await entry.async("text");
    const document = new DOMParser().parseFromString(source, "application/xml");
    const navigationBase = navigationPath.split("/").slice(0, -1).join("/");

    if (item.type === "application/x-dtbncx+xml") {
      for (const point of document.getElementsByTagName("navPoint")) {
        const href = point.getElementsByTagName("content")[0]?.getAttribute("src") || "";
        const label = point.getElementsByTagName("text")[0]?.textContent || "";
        addNavigationLabel(labels, navigationBase, href, label);
      }
      continue;
    }

    for (const anchor of document.querySelectorAll("a[href]")) {
      addNavigationLabel(labels, navigationBase, anchor.getAttribute("href") || "", anchor.textContent || "");
    }
  }

  return labels;
}

export async function parseEpub(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const container = await zip.file("META-INF/container.xml").async("text");
  const containerDocument = new DOMParser().parseFromString(container, "application/xml");
  const opfPath = containerDocument.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("未找到 EPUB 书籍清单");

  const opfSource = await zip.file(opfPath).async("text");
  const opf = new DOMParser().parseFromString(opfSource, "application/xml");
  const basePath = opfPath.split("/").slice(0, -1).join("/");
  const manifest = new Map(
    [...opf.getElementsByTagName("item")].map((item) => [item.getAttribute("id"), {
      id: item.getAttribute("id"),
      href: item.getAttribute("href"),
      type: item.getAttribute("media-type"),
      properties: item.getAttribute("properties") || "",
    }]),
  );
  const title = opf.getElementsByTagName("dc:title")[0]?.textContent?.trim() || "未命名书籍";
  const creator = opf.getElementsByTagName("dc:creator")[0]?.textContent?.trim() || "未知作者";
  const publisher = opf.getElementsByTagName("dc:publisher")[0]?.textContent?.trim() || "";
  const spine = [...opf.getElementsByTagName("itemref")]
    .map((item) => manifest.get(item.getAttribute("idref")))
    .filter((item) => item?.type?.includes("xhtml") || item?.type?.includes("html"));
  const navigationLabels = await chapterLabelsFromNavigation(zip, manifest, basePath);

  const draftChapters = [];
  let pendingImages = [];
  for (let index = 0; index < spine.length; index += 1) {
    const item = spine[index];
    const path = normalisePath(basePath, item.href);
    const entry = zip.file(path);
    if (!entry) continue;
    const { heading, paragraphs } = await blocksFromDocument(await entry.async("text"), zip, path);
    if (!paragraphs.length) continue;

    const navLabel = navigationLabels.get(path);
    const hasNavTitle = isUsableChapterTitle(navLabel);
    const title = resolveChapterTitle(navLabel, heading, draftChapters.length + 1);
    const shell = isStructuralShellChapter({ title, href: item.href });
    const hasText = paragraphs.some((item) => typeof item === "string" && item.trim().length >= 2);

    // Cover / TOC / back-cover: omit entirely (do not inject cover art into body chapters).
    if (shell) continue;
    // Image-only non-shell fragments may prepend to the next prose chapter.
    if (!hasText) {
      pendingImages.push(...paragraphs);
      continue;
    }

    // PDF-reflow leftovers: <h2>3</h2> mid-chapter splits with no NCX label.
    if (!hasNavTitle && isPageNumberTitle(heading) && draftChapters.length) {
      const previous = draftChapters[draftChapters.length - 1];
      previous.paragraphs = [...previous.paragraphs, ...pendingImages, ...paragraphs];
      pendingImages = [];
      continue;
    }

    draftChapters.push({
      id: `chapter-${index}`,
      href: item.href,
      title,
      paragraphs: pendingImages.length ? [...pendingImages, ...paragraphs] : paragraphs,
    });
    pendingImages = [];
  }

  if (pendingImages.length && draftChapters.length) {
    const last = draftChapters[draftChapters.length - 1];
    last.paragraphs = [...last.paragraphs, ...pendingImages];
  }

  const { chapters } = normalizeChapterList(draftChapters);
  if (!chapters.length) throw new Error("这本 EPUB 没有可读正文");
  return { title, creator, publisher, cover: await extractCover(zip, opf, manifest, basePath), chapters };
}

async function extractCover(zip, opf, manifest, basePath) {
  const coverMeta = [...opf.getElementsByTagName("meta")].find((item) => item.getAttribute("name") === "cover");
  const coverId = coverMeta?.getAttribute("content");
  const coverItem = coverId ? manifest.get(coverId) : null;
  const fallbackItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes("cover-image"))
    || [...manifest.values()].find((item) => item.type?.startsWith("image/") && /cover/i.test(`${item.id || ""} ${item.href || ""}`));
  const item = coverItem || fallbackItem;
  if (!item?.href) return "";
  const entry = zip.file(normalisePath(basePath, item.href));
  if (!entry) return "";
  const base64 = await entry.async("base64");
  return `data:${item.type || "image/jpeg"};base64,${base64}`;
}
