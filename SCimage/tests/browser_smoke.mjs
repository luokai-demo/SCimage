import { chromium } from "playwright";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:8765/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#galleryWindow");
  await page.waitForSelector("#workspacePanel");
  await page.locator("#togglePromptBankBtn").click();
  await page.waitForSelector("#savedPrompts", { state: "attached" });
  await page.waitForSelector(".prompt-bank-search input", { state: "attached" });
  await page.locator(".prompt-library-close").click();

  const before = await page.locator("#galleryWindow").boundingBox();
  await page.locator("#panelToggleBtn").click();
  await page.waitForTimeout(700);
  const collapsed = await page.locator("#galleryWindow").boundingBox();
  await page.locator("#panelToggleBtn").click();
  await page.waitForTimeout(700);
  const expanded = await page.locator("#galleryWindow").boundingBox();

  if (!before || !collapsed || !expanded) {
    throw new Error("图库容器尺寸读取失败。");
  }
  if (collapsed.width <= before.width) {
    throw new Error(`左侧收起后图库未变宽：before=${before.width}, collapsed=${collapsed.width}`);
  }
  if (expanded.width >= collapsed.width) {
    throw new Error(`左侧展开后图库未收回：collapsed=${collapsed.width}, expanded=${expanded.width}`);
  }

  await page.locator("[data-gallery-filter='tasks']").click();
  await page.waitForTimeout(250);
  await page.locator("[data-gallery-filter='all']").click();
  await page.waitForTimeout(250);
  await page.locator("#sortBtn").click();
  await page.waitForTimeout(250);

  const leftDragZone = await page.locator(".gallery-page-drag-zone-left").boundingBox();
  if (!leftDragZone || leftDragZone.width < 40) {
    throw new Error("图库左侧拖拽选择区过小或不存在。");
  }
  const topDragZone = await page.locator(".gallery-page-drag-zone-header").boundingBox();
  if (!topDragZone || topDragZone.height < 30) {
    throw new Error("图库顶部拖拽选择区过小或不存在。");
  }

  await page.mouse.move(topDragZone.x + 20, topDragZone.y + 12);
  await page.mouse.down();
  await page.mouse.move(topDragZone.x + 460, topDragZone.y + 190, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const selectedAfterDrag = await page.locator(".gallery-item.is-selected").count();
  if (selectedAfterDrag === 0) {
    throw new Error("顶部拖拽选择区未选中任何图片。");
  }
  await page.mouse.click(topDragZone.x + 20, topDragZone.y + 12);
  await page.waitForTimeout(250);
  const selectedAfterClear = await page.locator(".gallery-item.is-selected").count();
  if (selectedAfterClear !== 0) {
    throw new Error("单击顶部拖拽选择区没有清空已选图片。");
  }

  const firstCard = page.locator(".gallery-item[data-open-lightbox]").first();
  if (await firstCard.count()) {
    await firstCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const cardBox = await firstCard.boundingBox();
    if (!cardBox) {
      throw new Error("无法读取第一张图库卡片尺寸。");
    }
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.waitForTimeout(180);
    await page.mouse.move(cardBox.x + 21, cardBox.y + 21);
    await page.waitForTimeout(180);
    const overlayOpacity = await firstCard.locator(".gallery-overlay").evaluate((node) => (
      Number.parseFloat(window.getComputedStyle(node).opacity || "0")
    ));
    if (overlayOpacity < 0.9) {
      throw new Error("鼠标移动到选择按钮后图片悬浮操作层被隐藏。");
    }
    await firstCard.click();
    await page.waitForSelector("#lightbox.open");
    await page.locator("#lightboxClose").click();
    await page.waitForTimeout(150);
  }

  if (errors.length) {
    throw new Error(`浏览器控制台错误：${errors.join(" | ")}`);
  }
  await browser.close();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
