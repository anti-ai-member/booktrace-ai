import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve("scripts/clipping-verify");

async function measure(page) {
  return page.evaluate(() => {
    const copy = document.querySelector(".page-copy");
    const track = document.querySelector(".page-track");
    if (!copy || !track) return { ok: false };
    const paragraphs = [...track.querySelectorAll("p")];
    if (!paragraphs.length) return { ok: false };
    const copyBox = copy.getBoundingClientRect();
    const padBottom = Number.parseFloat(getComputedStyle(copy).paddingBottom) || 0;
    const lastBottom = paragraphs.at(-1).getBoundingClientRect().bottom;
    const contentFloor = copyBox.bottom - padBottom;
    const usable = Math.max(copyBox.height - padBottom, 1);
    return {
      ok: true,
      pageLabel: document.querySelector(".reader-footer span")?.textContent?.trim() || "",
      lastBottom: +lastBottom.toFixed(2),
      contentFloor: +contentFloor.toFixed(2),
      gapPx: +(contentFloor - lastBottom).toFixed(2),
      fillRatio: +((lastBottom - copyBox.top) / usable).toFixed(4),
      clipped: lastBottom > contentFloor + 0.5,
      copyHeight: +copyBox.height.toFixed(2),
    };
  });
}

async function waitForSettled(page, timeoutMs = 4000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(300);
    last = await measure(page);
    if (last?.ok && !last.clipped && last.gapPx >= 4) return last;
  }
  return last;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1100, height: 650 },
]) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /打开阅读/ }).click({ timeout: 90000 });
  await page.locator(".page-copy").waitFor({ timeout: 60000 });
  await page.locator('button.directory-tab, button[aria-label="目录"]').first().click();
  await page.locator("button.toc-row").filter({ hasText: /第一章/ }).first().click();
  let metric = await waitForSettled(page);

  for (let i = 0; i < 12; i += 1) {
    metric = await waitForSettled(page);
    metric.viewport = viewport;
    metric.flipIndex = i;
    results.push(metric);
    console.log(JSON.stringify(metric));
    const next = page.locator('button[aria-label="下一页"]');
    if (await next.isDisabled()) break;
    await next.click();
  }

  await page.locator(".epub-page").screenshot({ path: path.join(OUT_DIR, `stress-${viewport.width}x${viewport.height}.png`) });
  await page.close();
}

const ok = results.filter((r) => r.ok);
const summary = {
  verdict: ok.some((r) => r.clipped) ? "FAIL" : "PASS",
  checked: ok.length,
  clippedCount: ok.filter((r) => r.clipped).length,
  maxFillRatio: Math.max(...ok.map((r) => r.fillRatio), 0),
  minGapPx: Math.min(...ok.map((r) => r.gapPx)),
  byViewport: [900, 720, 650].map((h) => {
    const subset = ok.filter((r) => r.viewport.height === h);
    return {
      height: h,
      maxFill: Math.max(...subset.map((r) => r.fillRatio), 0),
      minGap: Math.min(...subset.map((r) => r.gapPx), Infinity),
      clipped: subset.filter((r) => r.clipped).length,
      pageCounts: [...new Set(subset.map((r) => r.pageLabel))],
    };
  }),
};
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "stress-metrics.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
await browser.close();
