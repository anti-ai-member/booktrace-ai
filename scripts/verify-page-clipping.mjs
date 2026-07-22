import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve("scripts/clipping-verify");
const BASE = "http://localhost:5173/";

async function measureClipping(page) {
  return page.evaluate(() => {
    const copy = document.querySelector(".page-copy");
    const track = document.querySelector(".page-track");
    if (!copy || !track) return { ok: false, reason: "missing .page-copy or .page-track" };
    const paragraphs = [...track.querySelectorAll("p")];
    if (!paragraphs.length) return { ok: false, reason: "no paragraphs" };
    const copyBox = copy.getBoundingClientRect();
    const style = getComputedStyle(copy);
    const padBottom = Number.parseFloat(style.paddingBottom) || 0;
    const last = paragraphs[paragraphs.length - 1];
    const lastBottom = last.getBoundingClientRect().bottom;
    const copyBottom = copyBox.bottom;
    const contentFloor = copyBottom - padBottom;
    // Match overflow:hidden clip against the padding edge (same as App.jsx clipFloor).
    const clipped = lastBottom > contentFloor + 0.5;
    const usableHeight = Math.max(copyBox.height - padBottom, 1);
    const filledHeight = Math.max(0, lastBottom - copyBox.top);
    const fillRatio = Number((filledHeight / usableHeight).toFixed(4));
    const gapPx = Number((contentFloor - lastBottom).toFixed(2));
    const pageLabel = document.querySelector(".reader-footer span")?.textContent?.trim() || "";
    const chapterTitle =
      document.querySelector(".page-title-row h2, .page-title-row strong")?.textContent?.trim() ||
      document.querySelector(".toc-row.active")?.textContent?.trim() ||
      "";
    return {
      ok: true,
      pageLabel,
      chapterTitle,
      paragraphCount: paragraphs.length,
      lastBottom: Number(lastBottom.toFixed(2)),
      copyBottom: Number(copyBottom.toFixed(2)),
      contentFloor: Number(contentFloor.toFixed(2)),
      padBottom,
      gapPx,
      fillRatio,
      clipped,
      overflowY: style.overflowY,
      lastTextPreview: (last.textContent || "").slice(-48),
    };
  });
}

async function openReader(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /打开阅读/ }).click({ timeout: 90000 });
  await page.locator(".page-copy").waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
}

async function openChapter(page, titleRe) {
  await page.locator('button.directory-tab, button[aria-label="目录"]').first().click();
  await page.waitForTimeout(250);
  await page.locator("button.toc-row").filter({ hasText: titleRe }).first().click();
  await page.locator(".page-copy p").first().waitFor({ timeout: 30000 });
  // Allow pack-scale overflow guard to settle (may need a couple frames + re-paginate)
  await page.waitForTimeout(1100);
}

async function nextPage(page) {
  const next = page.locator('button[aria-label="下一页"]');
  if (await next.isDisabled()) return false;
  await next.click();
  await page.waitForTimeout(900);
  return true;
}

async function captureBottom(page, filename) {
  const box = await page.locator(".page-copy").boundingBox();
  if (!box) return null;
  const file = path.join(OUT_DIR, filename);
  await page.screenshot({
    path: file,
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y + Math.max(0, box.height - 180)),
      width: box.width,
      height: Math.min(180, box.height),
    },
  });
  return file;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const results = [];

  try {
    await openReader(page);
    await openChapter(page, /第一章/);

    // Early chapter pages + denser mid-chapter flips
    const targets = [0, 1, 2, 3, 4, 5, 8, 12, 16, 20];
    let at = 0;
    for (const target of targets) {
      while (at < target) {
        const moved = await nextPage(page);
        if (!moved) break;
        at += 1;
      }
      await page.waitForTimeout(400);
      const metric = await measureClipping(page);
      metric.flipIndex = at;
      results.push(metric);
      console.log(JSON.stringify(metric));
    }

    // Screenshot densest page
    const okResults = results.filter((r) => r.ok);
    const densest = [...okResults].sort((a, b) => b.fillRatio - a.fillRatio)[0];
    if (densest) {
      await openReader(page);
      await openChapter(page, /第一章/);
      for (let i = 0; i < densest.flipIndex; i += 1) {
        if (!(await nextPage(page))) break;
      }
      await page.waitForTimeout(500);
      const fullPath = path.join(OUT_DIR, "full-page-dense.png");
      await page.locator(".epub-page").screenshot({ path: fullPath });
      const bottomPath = await captureBottom(page, "page-bottom-crop.png");
      const finalMetric = await measureClipping(page);
      console.log(JSON.stringify({ screenshot: fullPath, bottomCrop: bottomPath, densestTarget: densest, finalMetric }));
    }

    // Also sample mid-book chapter (第七章) for density
    await openChapter(page, /第七章/);
    for (let i = 0; i < 6; i += 1) {
      const metric = await measureClipping(page);
      metric.flipIndex = i;
      metric.sample = "ch7";
      results.push(metric);
      console.log(JSON.stringify(metric));
      if (i < 5 && !(await nextPage(page))) break;
    }

    const checked = results.filter((r) => r.ok);
    const clippedOnes = checked.filter((r) => r.clipped);
    const summary = {
      verdict: clippedOnes.length ? "FAIL" : "PASS",
      checked: checked.length,
      clippedCount: clippedOnes.length,
      maxFillRatio: Math.max(...checked.map((r) => r.fillRatio), 0),
      minGapPx: Math.min(...checked.map((r) => r.gapPx)),
      avgFillRatio: Number((checked.reduce((s, r) => s + r.fillRatio, 0) / Math.max(checked.length, 1)).toFixed(4)),
      results,
    };
    await writeFile(path.join(OUT_DIR, "metrics.json"), JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
