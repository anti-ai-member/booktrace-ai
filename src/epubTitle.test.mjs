import assert from "node:assert/strict";
import {
  chapterHasReadableText,
  isPageNumberTitle,
  isStructuralShellChapter,
  isSyntheticChapterTitle,
  isUsableChapterTitle,
  normalizeChapterList,
  shouldOmitFromToc,
} from "./epub.js";

assert.equal(isPageNumberTitle("3"), true);
assert.equal(isSyntheticChapterTitle("第 3 节"), true);
assert.equal(isSyntheticChapterTitle("第三章"), false);
assert.equal(isUsableChapterTitle("第一章"), true);
assert.equal(chapterHasReadableText({ paragraphs: [{ type: "image", src: "x" }] }), false);
assert.equal(shouldOmitFromToc({ title: "空", paragraphs: [{ type: "image", src: "x" }] }), true);
assert.equal(isStructuralShellChapter({ title: "目录", href: "Text/part0002.xhtml" }), true);
assert.equal(isStructuralShellChapter({ title: "第 1 节", href: "titlepage.xhtml" }), true);

const { chapters, changed } = normalizeChapterList([
  { id: "cover", title: "第 1 节", href: "titlepage.xhtml", paragraphs: [{ type: "image", src: "cover" }] },
  { id: "a", title: "第 3 节", paragraphs: ["正文甲"] },
  { id: "b", title: "3", paragraphs: ["正文乙"] },
  { id: "c", title: "第 5 节", paragraphs: ["正文丙"] },
  { id: "back", title: "封底", href: "part0021.xhtml", paragraphs: [{ type: "image", src: "back" }] },
]);

assert.equal(changed, true);
assert.deepEqual(chapters.map((item) => item.title), ["第 1 节", "第 2 节"]);
assert.deepEqual(chapters[0].paragraphs, ["正文甲", "正文乙"]);
assert.ok(!chapters[0].paragraphs.some((item) => item?.src === "cover"));

console.log("epub chapter normalize ok");
