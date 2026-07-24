import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIR = path.join(ROOT, "reports");
const REPORT_PATH = path.join(REPORT_DIR, "pagination-verification.json");
const VIEWPORTS = [
  { width: 1365, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const PAGE_SAMPLES = 12;

const vite = await createServer({
  root: ROOT,
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: false,
  },
});
await vite.listen();

const appUrl = vite.resolvedUrls?.local?.[0] || "http://127.0.0.1:4174/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator(".book-card").waitFor({ state: "visible", timeout: 60_000 });
    await page.locator(".book-card .read-button").click();
    await page.locator(".page-copy.is-pagination-ready").waitFor({ state: "visible", timeout: 60_000 });

    await page.locator('button[aria-label="目录"]').click();
    const tocRows = page.locator(".toc-row");
    await tocRows.first().waitFor({ state: "visible", timeout: 30_000 });
    if (await tocRows.count() < 4) throw new Error("Expected at least four table-of-contents rows.");
    await tocRows.nth(3).click();
    await page.locator(".page-copy.is-pagination-ready").waitFor({ state: "visible", timeout: 60_000 });

    // Start from the full-width canvas. The panel test below opens it again.
    await page.locator('button[aria-label="目录"]').click();
    await waitForPagination(page);

    const samples = [];
    let stablePageCount = null;
    for (let index = 0; index < PAGE_SAMPLES; index += 1) {
      if (index > 0) {
        await page.locator('button[aria-label="下一页"]').click();
        await page.waitForTimeout(230);
      }
      const metrics = await measureVisiblePage(page);
      stablePageCount ??= metrics.pageCount;
      samples.push(metrics);
      if (metrics.pageCount !== stablePageCount) {
        throw new Error(`Page count changed while turning: ${stablePageCount} -> ${metrics.pageCount}.`);
      }
      if (metrics.clippedFragments.length) {
        throw new Error(`Detected clipped fragments on page ${metrics.pageNumber}.`);
      }
      if (metrics.scrollHeight > metrics.clientHeight + 1) {
        throw new Error(`Detected vertical overflow on page ${metrics.pageNumber}.`);
      }
      if (metrics.pageNumber < metrics.pageCount && metrics.fillRatio < 0.78) {
        throw new Error(`Page ${metrics.pageNumber} is underfilled: ${(metrics.fillRatio * 100).toFixed(1)}%.`);
      }
    }

    await page.locator('button[aria-label="上一页"]').click();
    await page.waitForTimeout(230);
    const afterReverseTurn = await measureVisiblePage(page);
    if (afterReverseTurn.pageCount !== stablePageCount) {
      throw new Error(`Page count changed after reverse turn: ${stablePageCount} -> ${afterReverseTurn.pageCount}.`);
    }
    if (afterReverseTurn.clippedFragments.length) {
      throw new Error(`Detected clipped fragments after reverse turn on page ${afterReverseTurn.pageNumber}.`);
    }

    const beforePanel = await measureVisiblePage(page);
    const anchorCandidates = beforePanel.visibleParagraphs;
    await page.locator('button[aria-label="目录"]').click();
    await waitForWidthChange(page, beforePanel.clientWidth);
    const withPanel = await measureVisiblePage(page);
    const anchor = withPanel.visibleParagraphs.find((paragraphIndex) => anchorCandidates.includes(paragraphIndex));
    if (!Number.isInteger(anchor)) {
      throw new Error(`Sidebar reflow lost every visible paragraph anchor. Before: ${anchorCandidates.join(",")}; after: ${withPanel.visibleParagraphs.join(",")}.`);
    }

    await page.locator('button[aria-label="目录"]').click();
    await waitForWidthChange(page, withPanel.clientWidth);
    const afterPanel = await measureVisiblePage(page);
    if (!afterPanel.visibleParagraphs.includes(anchor)) {
      throw new Error(`Closing sidebar lost paragraph anchor ${anchor}. Before: ${beforePanel.visibleParagraphs.join(",")}; panel: ${withPanel.visibleParagraphs.join(",")}; after: ${afterPanel.visibleParagraphs.join(",")}.`);
    }

    const savedPage = afterPanel.pageNumber;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".book-card .read-button").click();
    await waitForPagination(page);
    const restored = await measureVisiblePage(page);
    if (restored.pageNumber !== savedPage) {
      throw new Error(`Saved page did not restore: expected ${savedPage}, got ${restored.pageNumber}.`);
    }
    if (!restored.visibleParagraphs.includes(anchor)) {
      throw new Error(`Saved paragraph anchor ${anchor} did not restore. Before: ${afterPanel.visibleParagraphs.join(",")}; after: ${restored.visibleParagraphs.join(",")}.`);
    }
    if (consoleErrors.length) {
      throw new Error(`Browser page errors: ${consoleErrors.join(" | ")}`);
    }

    results.push({
      viewport,
      pageCount: stablePageCount,
      minFillRatio: Math.min(...samples.map((item) => item.fillRatio)),
      maxBottomGap: Math.max(...samples.map((item) => item.bottomGap)),
      anchor,
      panelPage: withPanel.pageNumber,
      restoredPage: restored.pageNumber,
      clippedCount: samples.reduce((sum, item) => sum + item.clippedFragments.length, 0),
      consoleErrors,
    });
    await context.close();
  }
} finally {
  await browser.close();
  await vite.close();
}

const report = {
  verdict: "PASS",
  checkedAt: new Date().toISOString(),
  viewports: results,
};
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

async function waitForPagination(page) {
  await page.locator(".page-copy.is-pagination-ready").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(350);
}

async function waitForWidthChange(page, previousWidth) {
  await page.waitForTimeout(650);
  await page.locator(".page-copy.is-pagination-ready").waitFor({ state: "visible", timeout: 30_000 });
  const currentWidth = await page.locator(".page-copy").evaluate((copy) => copy.clientWidth);
  if (Math.abs(currentWidth - previousWidth) < 20) {
    throw new Error(`Reader width did not change after panel toggle: ${previousWidth} -> ${currentWidth}.`);
  }
}

async function measureVisiblePage(page) {
  return page.evaluate(() => {
    const copy = document.querySelector(".page-copy");
    const track = copy?.querySelector(".page-track");
    const footer = document.querySelector(".reader-footer");
    if (!copy || !track || !footer) throw new Error("Reader pagination surface is missing.");

    const copyBox = copy.getBoundingClientRect();
    const label = footer.textContent || "";
    const pageMatch = label.match(/第\s*(\d+)\s*\/\s*(\d+)/);
    const visible = [...track.querySelectorAll("[data-paragraph-index]")].flatMap((element) => {
      const paragraphIndex = Number(element.dataset.paragraphIndex);
      return [...element.getClientRects()]
        .filter((rect) => (
          rect.right > copyBox.left + 1
          && rect.left < copyBox.right - 1
          && rect.bottom > copyBox.top + 1
          && rect.top < copyBox.bottom - 1
        ))
        .map((rect) => ({
          paragraphIndex,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        }));
    });
    const clippedFragments = visible.filter((rect) => (
      rect.top < copyBox.top - 0.5 || rect.bottom > copyBox.bottom + 0.5
    ));
    const maxBottom = visible.length ? Math.max(...visible.map((rect) => rect.bottom)) : copyBox.top;
    const minTop = visible.length ? Math.min(...visible.map((rect) => rect.top)) : copyBox.top;

    return {
      pageNumber: Number(pageMatch?.[1] || 1),
      pageCount: Number(pageMatch?.[2] || 1),
      clientHeight: copy.clientHeight,
      scrollHeight: copy.scrollHeight,
      fillRatio: Number(((maxBottom - minTop) / Math.max(copy.clientHeight, 1)).toFixed(4)),
      bottomGap: Number((copyBox.bottom - maxBottom).toFixed(2)),
      visibleParagraphs: [...new Set(visible.map((rect) => rect.paragraphIndex))],
      clippedFragments,
    };
  });
}
