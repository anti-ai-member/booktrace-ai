import JSZip from "jszip";

self.onmessage = async (event) => {
  try {
    const { id, buffer } = event.data || {};
    const parsed = await parseEpubBuffer(buffer);
    self.postMessage({ id, ok: true, parsed });
  } catch (error) {
    self.postMessage({ id: event.data?.id, ok: false, error: error.message || "EPUB 解析失败" });
  }
};

async function parseEpubBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const container = await zip.file("META-INF/container.xml").async("text");
  const opfPath = attr(container.match(/<rootfile\b[^>]*>/i)?.[0] || "", "full-path");
  if (!opfPath) throw new Error("未找到 EPUB 书籍清单");

  const opfSource = await zip.file(opfPath).async("text");
  const basePath = opfPath.split("/").slice(0, -1).join("/");
  const manifest = new Map([...opfSource.matchAll(/<item\b[^>]*>/gi)].map((match) => [attr(match[0], "id"), {
    id: attr(match[0], "id"),
    href: attr(match[0], "href"),
    type: attr(match[0], "media-type"),
    properties: attr(match[0], "properties"),
  }]));
  const title = tagText(opfSource, "dc:title") || "未命名书籍";
  const creator = tagText(opfSource, "dc:creator") || "未知作者";
  const publisher = tagText(opfSource, "dc:publisher") || "";
  const spineIds = [...opfSource.matchAll(/<itemref\b[^>]*>/gi)].map((match) => attr(match[0], "idref")).filter(Boolean);

  const chapters = [];
  for (let index = 0; index < spineIds.length; index += 1) {
    const item = manifest.get(spineIds[index]);
    if (!item?.href || !/x?html/i.test(item.type || "")) continue;
    const entryPath = normalisePath(basePath, item.href);
    const entry = zip.file(entryPath);
    if (!entry) continue;
    const { heading, paragraphs } = await blocksFromHtml(await entry.async("text"), zip, entryPath);
    if (paragraphs.length) {
      chapters.push({
        id: `chapter-${index}`,
        href: item.href,
        title: heading || `第 ${chapters.length + 1} 节`,
        paragraphs,
      });
    }
  }

  if (!chapters.length) throw new Error("这本 EPUB 没有可读正文");
  return { title, creator, publisher, cover: await extractCover(zip, opfSource, manifest, basePath), chapters };
}

async function blocksFromHtml(source, zip, chapterPath) {
  const heading = stripTags((source.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/i) || [])[0] || "").trim();
  const paragraphs = [];
  const seenSrc = new Set();

  const pushImage = async (tag) => {
    const href = imageHrefFromTag(tag);
    if (!href || seenSrc.has(href)) return;
    const dataUrl = await resolveImageDataUrl(zip, chapterPath, href);
    if (!dataUrl) return;
    seenSrc.add(href);
    paragraphs.push({
      type: "image",
      src: dataUrl,
      alt: attr(tag, "alt") || "",
    });
  };

  for (const match of source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const inner = match[1] || "";
    for (const imgMatch of inner.matchAll(/<img\b[^>]*>/gi)) {
      await pushImage(imgMatch[0]);
    }
    for (const imageMatch of inner.matchAll(/<image\b[^>]*>/gi)) {
      await pushImage(imageMatch[0]);
    }
    const text = stripTags(inner).replace(/\s+/g, " ").trim();
    if (text.length > 18) paragraphs.push(text);
  }

  const outside = source.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, " ");
  for (const imgMatch of outside.matchAll(/<img\b[^>]*>/gi)) {
    await pushImage(imgMatch[0]);
  }
  for (const imageMatch of outside.matchAll(/<image\b[^>]*>/gi)) {
    await pushImage(imageMatch[0]);
  }

  return { heading, paragraphs };
}

function imageHrefFromTag(tag) {
  return attr(tag, "src")
    || attr(tag, "href")
    || attr(tag, "xlink:href")
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

async function extractCover(zip, opfSource, manifest, basePath) {
  const coverId = attr((opfSource.match(/<meta\b[^>]*name=["']cover["'][^>]*>/i) || [])[0] || "", "content");
  const coverItem = coverId ? manifest.get(coverId) : null;
  const fallbackItem = [...manifest.values()].find((item) => String(item.properties || "").split(/\s+/).includes("cover-image"))
    || [...manifest.values()].find((item) => item.type?.startsWith("image/") && /cover/i.test(`${item.id || ""} ${item.href || ""}`));
  const item = coverItem || fallbackItem;
  if (!item?.href) return "";
  const entry = zip.file(normalisePath(basePath, item.href));
  if (!entry) return "";
  const base64 = await entry.async("base64");
  return `data:${item.type || "image/jpeg"};base64,${base64}`;
}

function attr(tag, name) {
  return (tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i")) || [])[1] || "";
}

function tagText(source, tag) {
  return stripTags((source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "").trim();
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalisePath(base, href) {
  const cleanHref = href.split("#")[0];
  const parts = `${base}/${cleanHref}`.split("/");
  const resolved = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  });
  return resolved.join("/");
}
