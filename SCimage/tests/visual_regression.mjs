import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  collectViteOverlayText,
  installRegressionHarness,
  svgDataUrl,
} from "./vue_regression/helpers.mjs";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:5173/";
const OUT_DIR = path.resolve("test-results/visual-regression");
const now = Date.now();
const imageDataUrl = svgDataUrl(720, 960, "#1e242b", "#78836d");
const portraitDataUrl = svgDataUrl(720, 1280, "#d8c3b3", "#5c473c");
const previewDataUrl = svgDataUrl(90, 120, "#1e242b", "#78836d");
const portraitPreviewDataUrl = svgDataUrl(72, 128, "#d8c3b3", "#5c473c");

const visualState = {
  workspaceState: {},
  genealogyPositions: {},
  jobs: [
    {
      id: "visual-running",
      status: "running",
      workflow: "generate",
      prompt: "视觉回归运行任务",
      count: 2,
      created_at: new Date(now - 160000).toISOString(),
      run_started_at: new Date(now - 150000).toISOString(),
      updated_at: new Date(now - 20000).toISOString(),
      images: [{ slot: 1, url: previewDataUrl, name: "running.svg" }],
    },
    {
      id: "visual-root",
      status: "completed",
      workflow: "generate",
      prompt: "族谱根图视觉检查",
      count: 1,
      created_at: new Date(now - 300000).toISOString(),
      updated_at: new Date(now - 280000).toISOString(),
      images: [{
        slot: 1,
        url: portraitDataUrl,
        name: "root.svg",
        preview: { url: portraitPreviewDataUrl, width: 72, height: 128 },
      }],
    },
    {
      id: "visual-child",
      status: "completed",
      workflow: "image-to-image",
      prompt: "族谱第二代视觉检查",
      count: 2,
      created_at: new Date(now - 220000).toISOString(),
      updated_at: new Date(now - 180000).toISOString(),
      source_images: [{
        slot: 1,
        url: "/generated/visual-child/source-images/root.svg",
        origin: {
          job_id: "visual-root",
          slot: 1,
          url: portraitDataUrl,
        },
      }],
      images: [
        {
          slot: 1,
          url: imageDataUrl,
          name: "child-1.svg",
          preview: { url: previewDataUrl, width: 90, height: 120 },
        },
        {
          slot: 2,
          url: portraitDataUrl,
          name: "child-2.svg",
          preview: { url: portraitPreviewDataUrl, width: 72, height: 128 },
        },
      ],
    },
  ],
};

function providerProfilesPayload() {
  return {
    active_profile_id: "visual-profile",
    compat_profiles: [
      {
        id: "openai",
        label: "OpenAI",
        output_profile_id: "aspect_v1",
        supports_image_to_image: true,
      },
    ],
    profiles: [
      {
        id: "visual-profile",
        name: "视觉配置",
        base_url: "http://127.0.0.1:18080",
        model: "gpt-image-test",
        compat_profile_id: "openai",
        supports_count_parameter: true,
        has_api_key: true,
        api_key_hint: "key****test",
      },
    ],
    active_profile: {
      id: "visual-profile",
      name: "视觉配置",
      base_url: "http://127.0.0.1:18080",
      model: "gpt-image-test",
      compat_profile_id: "openai",
      supports_count_parameter: true,
      has_api_key: true,
      api_key: "mock-visual-token",
    },
    is_ready: true,
  };
}

function jobsPayload() {
  return {
    jobs: visualState.jobs,
    total: visualState.jobs.length,
    has_more: false,
    page_size: 80,
    next_offset: visualState.jobs.length,
    next_cursor: "",
  };
}

function galleryPayload() {
  const sortedJobs = [...visualState.jobs].sort((left, right) => (
    new Date(right.updated_at || right.created_at || 0).getTime() -
    new Date(left.updated_at || left.created_at || 0).getTime()
  ));
  const items = sortedJobs.flatMap((job) => (
    Array.isArray(job.images)
      ? job.images.map((image) => ({
          job: { ...job, images: [image], image_count: job.images.length },
          image,
        }))
      : []
  ));
  return {
    items,
    total: items.length,
    has_more: false,
    page_size: 160,
    next_cursor: "",
  };
}

function genealogyPayload() {
  return {
    families: [
      {
        root_id: "visual-root:1",
        title: "族谱根图视觉检查",
        prompt: "族谱根图视觉检查",
        cover_url: portraitPreviewDataUrl,
        image_count: 3,
        node_count: 3,
        generation_count: 2,
        latest_updated_at: new Date(now - 180000).toISOString(),
        has_multi_source: false,
        root_type: "generated",
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        root_id: `visual-extra-${index}:1`,
        title: `视觉横向族谱 ${index + 1}`,
        prompt: `视觉横向族谱 ${index + 1}`,
        cover_url: index % 2 ? previewDataUrl : portraitPreviewDataUrl,
        image_count: 2 + index,
        node_count: 2 + index,
        generation_count: 1 + (index % 3),
        latest_updated_at: new Date(now - 260000 - index * 1000).toISOString(),
        has_multi_source: index % 3 === 0,
        root_type: "generated",
      })),
    ],
    nodes: [
      {
        id: "visual-root:1",
        type: "generated",
        job_id: "visual-root",
        slot: 1,
        url: portraitDataUrl,
        preview_url: portraitPreviewDataUrl,
        filename: "root.svg",
        prompt: "族谱根图视觉检查",
        workflow: "generate",
        status: "completed",
        model: "gpt-image-test",
        output_profile_id: "aspect_v1",
        quality: "auto",
        size: "auto",
        created_at: new Date(now - 300000).toISOString(),
        updated_at: new Date(now - 280000).toISOString(),
      },
      {
        id: "visual-child:1",
        type: "generated",
        job_id: "visual-child",
        slot: 1,
        url: imageDataUrl,
        preview_url: previewDataUrl,
        filename: "child-1.svg",
        prompt: "族谱第二代视觉检查",
        workflow: "image-to-image",
        status: "completed",
        model: "gpt-image-test",
        output_profile_id: "aspect_v1",
        quality: "auto",
        size: "auto",
        created_at: new Date(now - 220000).toISOString(),
        updated_at: new Date(now - 180000).toISOString(),
      },
      {
        id: "visual-child:2",
        type: "generated",
        job_id: "visual-child",
        slot: 2,
        url: portraitDataUrl,
        preview_url: portraitPreviewDataUrl,
        filename: "child-2.svg",
        prompt: "族谱分支视觉检查",
        workflow: "image-to-image",
        status: "completed",
        model: "gpt-image-test",
        output_profile_id: "aspect_v1",
        quality: "auto",
        size: "auto",
        created_at: new Date(now - 220000).toISOString(),
        updated_at: new Date(now - 175000).toISOString(),
      },
    ],
    edges: [
      { from: "visual-root:1", to: "visual-child:1", job_id: "visual-child" },
      { from: "visual-root:1", to: "visual-child:2", job_id: "visual-child" },
    ],
    positions: visualState.genealogyPositions,
  };
}

async function installVisualRoutes(page) {
  await page.route("**/api/jobs?**", (route) => route.fulfill({ json: jobsPayload() }));
  await page.route("**/api/gallery/images?**", (route) => route.fulfill({ json: galleryPayload() }));
  await page.route("**/api/genealogy/graph", (route) => route.fulfill({ json: genealogyPayload() }));
  await page.route("**/api/provider-profiles", (route) => route.fulfill({ json: providerProfilesPayload() }));
  await page.route("**/api/provider-profiles/models", (route) => route.fulfill({
    json: {
      normalized_base_url: "http://127.0.0.1:18080",
      models: [{ id: "gpt-image-test", category: "image" }],
    },
  }));
  await page.route("**/api/workspace-state", (route) => {
    if (route.request().method() === "PUT") {
      visualState.workspaceState = route.request().postDataJSON();
      return route.fulfill({ json: visualState.workspaceState });
    }
    return route.fulfill({ json: visualState.workspaceState });
  });
  await page.route("**/api/genealogy/nodes/positions", (route) => {
    const positions = route.request().postDataJSON()?.positions || {};
    Object.entries(positions).forEach(([nodeId, position]) => {
      visualState.genealogyPositions[nodeId] = {
        x: Math.max(0, Math.round(Number(position?.x || 0))),
        y: Math.max(0, Math.round(Number(position?.y || 0))),
      };
    });
    return route.fulfill({
      json: {
        ok: true,
        positions: visualState.genealogyPositions,
        updated_count: Object.keys(positions).length,
      },
    });
  });
}

async function waitForAppReady(page, options = {}) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  if (options.expectGallery !== false) {
    await page.waitForSelector("#galleryWindow");
  }
  await page.waitForSelector("#workspacePanel");
  await page.waitForSelector(".job-dock");
  await page.waitForTimeout(250);
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(OUT_DIR, name),
    fullPage: false,
    animations: "disabled",
  });
}

async function assertNoObviousOverflow(page, label) {
  const issues = await page.evaluate(() => (
    [...document.querySelectorAll("button, .left-job-card, .gallery-item, .genealogy-node, .job-dock")]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          selector: node.id || node.getAttribute("data-genealogy-node-id") || node.className,
          width: rect.width,
          scrollWidth: node.scrollWidth,
          height: rect.height,
          scrollHeight: node.scrollHeight,
        };
      })
      .filter((item) => (
        item.scrollWidth > Math.ceil(item.width) + 2 ||
        item.scrollHeight > Math.ceil(item.height) + 4
      ))
      .slice(0, 8)
  ));
  if (issues.length) {
    throw new Error(`${label} 存在明显内容溢出：${JSON.stringify(issues)}`);
  }
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
  await page.waitForTimeout(250);
}

async function runDesktopScreens(page) {
  await waitForAppReady(page);
  await screenshot(page, "01-text-to-image-gallery.png");
  await assertNoObviousOverflow(page, "文生图图库");

  await page.locator("#panelToggleBtn").click();
  await page.waitForTimeout(350);
  await screenshot(page, "02-left-collapsed.png");
  await page.locator("#panelToggleBtn").click();
  await page.waitForTimeout(250);

  await dragFromZone(page, ".gallery-page-drag-zone-header", 440, 160);
  await screenshot(page, "03-batch-selection.png");
  await page.locator("#batchClearBtn").click();

  await page.locator(".gallery-item[data-open-lightbox]").first().click();
  await page.waitForSelector("#lightbox.open");
  await screenshot(page, "04-preview-lightbox.png");
  await page.keyboard.press("Escape");

  await page.locator("[data-workflow='image-to-image']").click();
  await page.getByRole("tab", { name: "当前族谱" }).click();
  await page.waitForSelector('[data-genealogy-node-id="visual-root:1"]');
  await screenshot(page, "05-image-to-image-genealogy.png");
  await assertNoObviousOverflow(page, "图生图族谱");

  await page.locator("#genealogyNavToggleBtn").click();
  await page.waitForSelector(".genealogy-minimap");
  await screenshot(page, "06-genealogy-navigation-open.png");

  await page.locator(".job-dock-toggle").click();
  await page.waitForTimeout(250);
  await screenshot(page, "07-job-dock-collapsed.png");
}

async function runMobileScreen(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 840 } });
  await installRegressionHarness(page);
  await installVisualRoutes(page);
  await waitForAppReady(page, { expectGallery: false });
  await screenshot(page, "08-mobile-layout.png");
  await assertNoObviousOverflow(page, "移动端布局");
  await page.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await installRegressionHarness(page);
    await installVisualRoutes(page);
    await runDesktopScreens(page);
    await runMobileScreen(browser);
    if (errors.length) {
      throw new Error(`浏览器控制台错误：${errors.join(" | ")}`);
    }
  } catch (error) {
    for (const overlayText of await collectViteOverlayText(browser)) {
      console.error(`VITE_OVERLAY ${overlayText}`);
    }
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
