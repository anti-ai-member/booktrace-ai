import JSZip from "jszip";

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
    if (text.length > 18) paragraphs.push(text);
  }

  const body = document.querySelector("body") || document.documentElement;
  for (const image of body.querySelectorAll("img, image")) {
    if (image.closest("p")) continue;
    await pushImage(image);
  }

  return { heading, paragraphs };
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

  const chapters = [];
  for (let index = 0; index < spine.length; index += 1) {
    const item = spine[index];
    const path = normalisePath(basePath, item.href);
    const entry = zip.file(path);
    if (!entry) continue;
    const { heading, paragraphs } = await blocksFromDocument(await entry.async("text"), zip, path);
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
