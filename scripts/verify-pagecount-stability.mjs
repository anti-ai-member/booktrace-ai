import { chromium } from "playwright";

const BASE = "http://localhost:5173/";

function parseTotal(label) {
  const match = String(label || "").match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/);
  return match ? { cur: Number(match[1]), total: Number(match[2]), label } : { cur: null, total: null, label };
}

async function openReader(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /打开阅读/ }).click({ timeout: 90000 });
  await page.locator(".page-copy").waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
}

async function openChapter(page, titleRe) {
  await page.locator('button.directory-tab, button[aria-label="目录"]').first().click();
  await page.waitForTimeout(250);
  await page.locator("button.toc-row").filter({ hasText: titleRe }).first().click();
  await page.locator(".page-copy p").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1400);
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    await openReader(page);
    await openChapter(page, /第一章/);

    const samples = [];
    for (let i = 0; i < 18; i += 1) {
      await page.waitForTimeout(280);
      const label = await page.locator(".reader-footer span").first().textContent();
      samples.push({ flip: i, ...parseTotal(label) });
      const next = page.locator('button[aria-label="下一页"]');
      if (await next.isDisabled()) break;
      await next.click();
      await page.waitForTimeout(750);
    }

    const totals = samples.map((item) => item.total).filter((n) => Number.isFinite(n));
    const unique = [...new Set(totals)];
    let oscillated = false;
    let sawDecrease = false;
    for (let i = 1; i < totals.length; i += 1) {
      if (totals[i] < totals[i - 1]) sawDecrease = true;
      if (sawDecrease && totals[i] > totals[i - 1]) {
        oscillated = true;
        break;
      }
    }
    // After initial settle (first 2 samples), totals must stay constant while flipping.
    const settled = totals.slice(2);
    const settledUnique = [...new Set(settled)];
    const summary = {
      verdict: !oscillated && settledUnique.length <= 1 ? "PASS" : "FAIL",
      uniqueTotals: unique,
      settledUnique,
      oscillated,
      samples,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.verdict !== "PASS") process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
