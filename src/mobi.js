import { unzlibSync } from "fflate";
import { MOBI, isMOBI } from "foliate-js/mobi.js";

/**
 * Parse a Mobipocket / Kindle (MOBI, AZW, AZW3) file into the shared book shape.
 * Uses foliate-js; images are resolved to data URLs for IndexedDB persistence.
 */
export async function parseMobi(file) {
  if (!(await isMOBI(file))) {
    throw new Error("不是有效的 MOBI / Kindle 文件");
  }

  const book = await new MOBI({ unzlib: unzlibSync }).open(file);
  try {
    const metadata = book.metadata || {};
    const title = cleanMeta(metadata.title) || cleanFileTitle(file.name) || "未命名书籍";
    const creator = Array.isArray(metadata.author)
      ? cleanMeta(metadata.author.filter(Boolean).join(" / ")) || "未知作者"
      : cleanMeta(metadata.author) || "未知作者";
    const publisher = cleanMeta(metadata.publisher) || "Local MOBI";
    const language = Array.isArray(metadata.language)
      ? cleanMeta(metadata.language[0])
      : cleanMeta(metadata.language);

    const tocTitles = await buildSectionTitleMap(book);
    const chapters = [];
    const sections = Array.isArray(book.sections) ? book.sections : [];

    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      if (!section || section.linear === "no" || typeof section.createDocument !== "function") continue;

      try {
        // Prefer createDocument over load()+XHTML re-parse: Kindle markup is often
        // not well-formed XML, and browsers reject it under application/xhtml+xml.
        const document = await section.createDocument();
        await resolveDocumentImages(book, document);
        const { heading, paragraphs } = blocksFromDocument(document);
        if (!paragraphs.length) continue;

        chapters.push({
          id: `mobi-section-${chapters.length + 1}`,
          href: `mobi-section-${index}`,
          title: tocTitles.get(index) || heading || `第 ${chapters.length + 1} 节`,
          paragraphs,
        });
      } catch (error) {
        console.warn(`MOBI section ${index} skipped`, error);
      }
    }

    if (!chapters.length) {
      throw new Error("这本 MOBI 没有可读正文（可能受 DRM 保护或文件损坏）");
    }

    const cover = await coverToDataUrl(book);
    const format = detectKindleFormat(file.name);
    return { title, creator, publisher, language, format, cover, chapters };
  } finally {
    try {
      book.destroy?.();
    } catch {
      // ignore cleanup failures
    }
  }
}

async function buildSectionTitleMap(book) {
  const titles = new Map();
  const items = flattenToc(book.toc);
  for (const item of items) {
    if (!item?.href || !item.label) continue;
    try {
      let index = -1;
      if (typeof book.resolveHref === "function") {
        const resolved = await book.resolveHref(item.href);
        index = Number(resolved?.index);
      } else if (typeof book.splitTOCHref === "function") {
        const parts = book.splitTOCHref(item.href);
        index = Number(parts?.[0]);
      }
      if (Number.isInteger(index) && index >= 0 && !titles.has(index)) {
        titles.set(index, cleanMeta(item.label));
      }
    } catch {
      // toc entries can point outside readable sections
    }
  }
  return titles;
}

function flattenToc(items, out = []) {
  for (const item of items || []) {
    out.push(item);
    if (item?.subitems?.length) flattenToc(item.subitems, out);
  }
  return out;
}

async function resolveDocumentImages(book, document) {
  const images = [...document.querySelectorAll("img[recindex], img[src], image")];
  for (const image of images) {
    const existing = image.getAttribute("src") || "";
    if (/^data:/i.test(existing)) continue;

    const recindex = image.getAttribute("recindex");
    if (recindex && typeof book.loadRecindex === "function") {
      let objectUrl = "";
      try {
        objectUrl = await book.loadRecindex(recindex);
        const dataUrl = await srcToDataUrl(objectUrl);
        if (dataUrl) image.setAttribute("src", dataUrl);
      } catch {
        // keep text even if one image fails
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
      continue;
    }

    if (/^(blob:|kindle:)/i.test(existing)) {
      const dataUrl = await srcToDataUrl(existing);
      if (dataUrl) image.setAttribute("src", dataUrl);
    }
  }
}

function blocksFromDocument(document) {
  const heading = document.querySelector("h1, h2, h3, title")?.textContent?.trim() || "";
  const paragraphs = [];
  const seenSrc = new Set();

  const pushImage = (element) => {
    const src = element.getAttribute("src")
      || element.getAttribute("href")
      || element.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      || element.getAttribute("xlink:href")
      || "";
    if (!src || !/^data:/i.test(src) || seenSrc.has(src)) return;
    seenSrc.add(src);
    paragraphs.push({
      type: "image",
      src,
      alt: element.getAttribute("alt") || "",
    });
  };

  for (const paragraph of document.querySelectorAll("p")) {
    for (const image of paragraph.querySelectorAll("img, image")) {
      pushImage(image);
    }
    const text = (paragraph.textContent || "").replace(/\s+/g, " ").trim();
    // Chinese MOBI often uses short dialogue lines; keep modest threshold.
    if (text.length > 8) paragraphs.push(text);
  }

  const body = document.querySelector("body") || document.documentElement;
  for (const image of body.querySelectorAll("img, image")) {
    if (image.closest("p")) continue;
    pushImage(image);
  }

  if (!paragraphs.some((item) => typeof item === "string")) {
    const fallback = (body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^。！？.!?]{8,}[。！？.!?]?/g);
    if (fallback?.length) {
      fallback.forEach((chunk) => {
        const text = chunk.trim();
        if (text.length > 8) paragraphs.push(text);
      });
    }
  }

  return { heading, paragraphs };
}

async function srcToDataUrl(src) {
  if (!src) return "";
  if (/^data:/i.test(src)) return src;
  try {
    const response = await fetch(src);
    if (!response.ok) return "";
    const blob = await response.blob();
    return blobToDataUrl(blob);
  } catch {
    return "";
  }
}

async function coverToDataUrl(book) {
  try {
    const cover = await book.getCover?.();
    if (!cover) return "";
    if (typeof cover === "string") {
      if (/^data:/i.test(cover)) return cover;
      return srcToDataUrl(cover);
    }
    if (cover instanceof Blob) return blobToDataUrl(cover);
  } catch {
    return "";
  }
  return "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("封面读取失败"));
    reader.readAsDataURL(blob);
  });
}

function detectKindleFormat(name) {
  const extension = String(name || "").split(".").pop()?.toLowerCase() || "mobi";
  if (extension === "azw3") return "AZW3";
  if (extension === "azw") return "AZW";
  return "MOBI";
}

function cleanMeta(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanFileTitle(name) {
  return String(name || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}
