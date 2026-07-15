import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PAGES_PER_CHAPTER = 8;

export async function parsePdf(file) {
  const buffer = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data: buffer }).promise;
  const metadata = await document.getMetadata().catch(() => ({}));
  const info = metadata.info || {};
  const title = cleanMeta(info.Title) || cleanFileTitle(file.name) || "未命名 PDF";
  const creator = cleanMeta(info.Author) || "未知作者";
  const publisher = cleanMeta(info.Producer) || cleanMeta(info.Creator) || "本地 PDF";
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const paragraphs = paragraphsFromTextItems(textContent.items);
    if (paragraphs.length) pages.push({ pageNumber, paragraphs });
  }

  if (!pages.length) throw new Error("这个 PDF 没有可提取的文字内容，可能是扫描版");

  const chapters = [];
  for (let index = 0; index < pages.length; index += PAGES_PER_CHAPTER) {
    const group = pages.slice(index, index + PAGES_PER_CHAPTER);
    const first = group[0].pageNumber;
    const last = group[group.length - 1].pageNumber;
    chapters.push({
      id: `pdf-section-${chapters.length + 1}`,
      href: `pdf-page-${first}`,
      title: first === last ? `PDF 第 ${first} 页` : `PDF 第 ${first}-${last} 页`,
      paragraphs: group.flatMap((page) => [`第 ${page.pageNumber} 页`, ...page.paragraphs]),
      sourcePageStart: first,
      sourcePageEnd: last,
    });
  }

  return { title, creator, publisher, language: "", format: "PDF", cover: "", chapters };
}

function paragraphsFromTextItems(items) {
  const lines = [];
  let currentLine = null;

  items.forEach((item) => {
    const text = String(item.str || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const y = Math.round(item.transform?.[5] || 0);
    const x = item.transform?.[4] || 0;
    if (!currentLine || Math.abs(currentLine.y - y) > 4) {
      currentLine = { y, parts: [{ x, text }] };
      lines.push(currentLine);
      return;
    }
    currentLine.parts.push({ x, text });
  });

  return lines
    .map((line) => line.parts.sort((left, right) => left.x - right.x).map((part) => part.text).join(" "))
    .join("\n")
    .split(/\n{2,}|(?<=。|！|？|\.|\?|!)\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 12);
}

function cleanMeta(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanFileTitle(name) {
  return String(name || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}
