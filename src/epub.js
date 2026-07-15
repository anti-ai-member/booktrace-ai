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

function textFromDocument(source) {
  const document = new DOMParser().parseFromString(source, "application/xhtml+xml");
  const heading = document.querySelector("h1, h2, h3")?.textContent?.trim() || "";
  const paragraphs = [...document.querySelectorAll("p")]
    .map((paragraph) => paragraph.textContent.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 18);

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
      href: item.getAttribute("href"),
      type: item.getAttribute("media-type"),
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
    const { heading, paragraphs } = textFromDocument(await entry.async("text"));
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
  return { title, creator, publisher, chapters };
}
