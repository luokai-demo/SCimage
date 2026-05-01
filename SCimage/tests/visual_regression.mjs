import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:8765/";
const OUT_DIR = path.resolve("test-results/visual-regression");

async function waitForGalleryReady(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#galleryWindow");
  await page.waitForSelector("#workspacePanel");
  await page.waitForTimeout(500);
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(OUT_DIR, name),
    fullPage: false,
  });
}

async function dragFromZone(page, selector, deltaX, deltaY) {
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`截图回归无法读取拖拽区域：${selector}`);
  }
  await page.mouse.move(box.x + 24, box.y + Math.min(18, Math.max(8, box.height / 2)));
  await page.mouse.down();
  await page.mouse.move(box.x + 24 + deltaX, box.y + Math.min(18, Math.max(8, box.height / 2)) + deltaY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

  try {
    await waitForGalleryReady(page);
    await screenshot(page, "01-left-expanded.png");

    await page.locator("#panelToggleBtn").click();
    await page.waitForTimeout(700);
    await screenshot(page, "02-left-collapsed.png");

    await page.locator("#panelToggleBtn").click();
    await page.waitForTimeout(700);
    await dragFromZone(page, ".gallery-page-drag-zone-header", 470, 190);
    await screenshot(page, "03-batch-selection.png");

    await page.locator("#batchClearBtn").click();
    await page.waitForTimeout(250);
    await page.locator("#settingsToggleBtn").click();
    await page.waitForTimeout(250);
    await screenshot(page, "04-settings-menu.png");

    await page.locator("#settingsToggleBtn").click();
    await page.waitForTimeout(150);
    const firstCard = page.locator(".gallery-item[data-open-lightbox]").first();
    if (await firstCard.count()) {
      await firstCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      await firstCard.click();
      await page.waitForSelector("#lightbox.open");
      await page.waitForTimeout(250);
      await screenshot(page, "05-lightbox.png");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
