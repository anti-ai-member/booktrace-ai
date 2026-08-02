import assert from "node:assert/strict";
import {
  findExplainsByExactSelection,
  pickExplainForTextReuse,
  selectionOverlapsExplain,
} from "./explainMemory.js";

const base = {
  chapterIndex: 0,
  paragraphIndex: 1,
  mode: "entity",
  explainSpeed: "fast",
  answer: "人物简介",
};

const older = {
  ...base,
  id: "a",
  selection: "肖亚文",
  createdAt: 100,
};

const newer = {
  ...base,
  id: "b",
  selection: "肖亚文",
  mode: "meaning",
  createdAt: 200,
};

const other = {
  ...base,
  id: "c",
  selection: "肖亚文同志",
  createdAt: 300,
};

assert.deepEqual(
  findExplainsByExactSelection([older, newer, other], "  肖亚文  ").map((item) => item.id),
  ["b", "a"],
);
assert.deepEqual(findExplainsByExactSelection([older, other], "肖"), []);
assert.equal(pickExplainForTextReuse([older, newer], "肖亚文")?.id, "b");
assert.equal(pickExplainForTextReuse([older, newer], "肖亚文", "entity")?.id, "a");
assert.equal(pickExplainForTextReuse([older], "别人"), null);

assert.equal(
  selectionOverlapsExplain(
    { chapterIndex: 2, paragraphIndex: 5, selection: "肖亚文" },
    older,
  ),
  false,
);

console.log("explainMemory text reuse ok");
