import { chromium } from "playwright";
import { emptyQueuePayload, installRuntimeEventStreamMock } from "./vue_regression/helpers.mjs";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:5173/";
const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const now = Date.now();
const jobs = [
  {
    id: "smoke-running",
    status: "running",
    workflow: "generate",
    prompt: "烟测运行中任务",
    count: 2,
    created_at: new Date(now - 120000).toISOString(),
    updated_at: new Date(now - 60000).toISOString(),
    images: [
      { slot: 1, url: imageDataUrl, name: "running.png" },
    ],
  },
  {
    id: "smoke-completed",
    status: "completed",
    workflow: "generate",
    prompt: "烟测图库图片",
    count: 8,
    created_at: new Date(now - 240000).toISOString(),
    updated_at: new Date(now - 180000).toISOString(),
    images: Array.from({ length: 8 }, (_, index) => ({
      slot: index + 1,
      url: imageDataUrl,
      name: `smoke-${index + 1}.png`,
      width: 1024,
      height: index % 2 ? 768 : 1024,
    })),
  },
];

async function main() {
  let browser;
  let page;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      if (request.url().includes("/api/events")) return;
      errors.push(`请求失败：${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`.trim());
    });
    page.on("response", (response) => {
      if (response.status() >= 500) {
        errors.push(`HTTP ${response.status()}：${response.url()}`);
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await installSmokeMocks(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
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
  } finally {
    await browser?.close();
  }
}

async function installSmokeMocks(page) {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 500,
    json: {
      error: `浏览器烟测缺少 API mock：${route.request().method()} ${route.request().url()}`,
    },
  }));
  await installRuntimeEventStreamMock(page);
  await page.route("**/api/provider-profiles", (route) => route.fulfill({
    json: {
      active_profile_id: "smoke-profile",
      compat_profiles: [
        { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: true },
      ],
      profiles: [
        {
          id: "smoke-profile",
          name: "烟测配置",
          base_url: "http://127.0.0.1:18080",
          model: "smoke-model",
          compat_profile_id: "openai",
          supports_count_parameter: true,
          has_api_key: true,
          api_key_hint: "key****test",
        },
      ],
      active_profile: {
        id: "smoke-profile",
        name: "烟测配置",
        base_url: "http://127.0.0.1:18080",
        model: "smoke-model",
        compat_profile_id: "openai",
        supports_count_parameter: true,
        has_api_key: true,
        api_key: "mock-smoke-token",
      },
      is_ready: true,
    },
  }));
  await page.route("**/api/provider-profiles/models", (route) => route.fulfill({
    json: {
      normalized_base_url: "http://127.0.0.1:18080",
      models: [
        { id: "smoke-model", label: "smoke-model", category: "image" },
      ],
    },
  }));
  await page.route("**/api/workspace-state{,?*}", (route) => {
    if (route.request().method() === "PUT") return route.fulfill({ json: route.request().postDataJSON() });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/prompts{,?*}", (route) => route.fulfill({ json: { prompts: [] } }));
  await page.route("**/api/queue{,?*}", (route) => route.fulfill({
    json: emptyQueuePayload(),
  }));
  await page.route("**/api/jobs{,?*}", (route) => route.fulfill({
    json: {
      jobs,
      total: jobs.length,
      has_more: false,
      page_size: 80,
      next_offset: jobs.length,
      next_cursor: "",
    },
  }));
  await page.route("**/api/gallery/images{,?*}", (route) => route.fulfill({
    json: {
      items: jobs.flatMap((job) => job.images.map((image) => ({
        job: { ...job, images: [image], image_count: job.images.length },
        image,
      }))),
      total: jobs.reduce((sum, job) => sum + job.images.length, 0),
      has_more: false,
      page_size: 160,
      next_cursor: "",
    },
  }));
  await page.route("**/api/genealogy/graph{,?*}", (route) => route.fulfill({
    json: {
      families: [],
      nodes: [],
      edges: [],
      positions: {},
    },
  }));
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
