import { chromium } from "playwright";
import {
  emptyQueuePayload,
  installRegressionHarness,
  installRuntimeEventStreamMock,
  svgDataUrl,
} from "./vue_regression/helpers.mjs";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:5173/";
const GALLERY_IMAGE_COUNT = Number(
  process.env.SCIMAGE_BENCH_GALLERY_COUNT || 500,
);
const GENEALOGY_NODE_COUNT = Number(
  process.env.SCIMAGE_BENCH_GENEALOGY_COUNT || 160,
);
const imageDataUrl = svgDataUrl(640, 896, "#192026", "#6f7f71");

const now = Date.now();

function job(index) {
  return {
    id: `bench-job-${index}`,
    status: "completed",
    workflow: index % 7 === 0 ? "image-to-image" : "generate",
    prompt: `性能基准图片 ${index}`,
    count: 1,
    created_at: new Date(now - index * 1000).toISOString(),
    updated_at: new Date(now - index * 1000).toISOString(),
    images: [
      {
        slot: 1,
        url: imageDataUrl,
        name: `bench-${index}.svg`,
        width: 640,
        height: 896,
      },
    ],
  };
}

function providerProfilesPayload() {
  return {
    active_profile_id: "bench-profile",
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
        id: "bench-profile",
        name: "基准配置",
        base_url: "http://127.0.0.1:18080",
        model: "bench-model",
        compat_profile_id: "openai",
        supports_count_parameter: true,
        has_api_key: true,
        api_key_hint: "key****bench",
      },
    ],
    active_profile: {
      id: "bench-profile",
      name: "基准配置",
      base_url: "http://127.0.0.1:18080",
      model: "bench-model",
      compat_profile_id: "openai",
      supports_count_parameter: true,
      has_api_key: true,
      api_key: "mock-bench-token",
    },
    is_ready: true,
  };
}

const jobs = Array.from({ length: GALLERY_IMAGE_COUNT }, (_, index) =>
  job(index + 1),
);
const genealogyNodes = Array.from(
  { length: GENEALOGY_NODE_COUNT },
  (_, index) => ({
    id: `bench-genealogy:${index + 1}`,
    type: "generated",
    job_id: "bench-genealogy",
    slot: index + 1,
    url: imageDataUrl,
    filename: `bench-genealogy-${index + 1}.svg`,
    prompt: `族谱性能节点 ${index + 1}`,
    workflow: "image-to-image",
    status: "completed",
    model: "bench-model",
    compat_profile_id: "openai",
    output_profile_id: "aspect_v1",
    quality: "auto",
    size: "auto",
    created_at: new Date(now - index * 1000).toISOString(),
    updated_at: new Date(now - index * 1000).toISOString(),
  }),
);
const genealogyEdges = genealogyNodes.slice(1).map((node, index) => ({
  from:
    index === 0
      ? genealogyNodes[0].id
      : genealogyNodes[Math.max(0, index - 1)].id,
  to: node.id,
  job_id: "bench-genealogy",
}));

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 920 },
    });
    const errors = [];
    page.on("console", (message) => {
      if (message.text().includes("/api/events")) return;
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await installRegressionHarness(page);
    await installRuntimeEventStreamMock(page);

    await page.route("**/api/queue", (route) =>
      route.fulfill({
        json: emptyQueuePayload(),
      }),
    );
    await page.route("**/api/jobs?**", (route) =>
      route.fulfill({
        json: {
          jobs: jobs.slice(0, 80),
          total: jobs.length,
          has_more: false,
          page_size: 80,
          next_offset: 80,
          next_cursor: "",
        },
      }),
    );
    await page.route("**/api/gallery/images?**", (route) =>
      route.fulfill({
        json: {
          items: jobs.map((item) => ({
            job: { ...item, image_count: 1 },
            image: item.images[0],
          })),
          total: jobs.length,
          has_more: false,
          page_size: GALLERY_IMAGE_COUNT,
          next_cursor: "",
        },
      }),
    );
    await page.route("**/api/genealogy/graph", (route) =>
      route.fulfill({
        json: {
          families: [
            {
              root_id: genealogyNodes[0].id,
              title: "族谱性能基准",
              prompt: genealogyNodes[0].prompt,
              cover_url: genealogyNodes[0].url,
              image_count: genealogyNodes.length,
              node_count: genealogyNodes.length,
              generation_count: genealogyNodes.length,
              latest_updated_at: genealogyNodes.at(-1)?.updated_at,
              has_multi_source: false,
              root_type: "generated",
            },
          ],
          nodes: genealogyNodes,
          edges: genealogyEdges,
          positions: {},
        },
      }),
    );
    await page.route("**/api/provider-profiles", (route) =>
      route.fulfill({ json: providerProfilesPayload() }),
    );
    await page.route("**/api/workspace-state", (route) =>
      route.fulfill({ json: {} }),
    );
    await page.route("**/api/provider-profiles/models", (route) =>
      route.fulfill({
        json: {
          normalized_base_url: "http://127.0.0.1:18080",
          models: [
            { id: "bench-model", label: "bench-model", category: "image" },
          ],
        },
      }),
    );

    const startedAt = performance.now();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#galleryWindow");
    await page.waitForFunction(
      () => document.querySelectorAll(".gallery-item").length > 20,
    );
    const galleryState = await page.evaluate(() => ({
      renderedCards: document.querySelectorAll(".gallery-item").length,
      totalText: document.querySelector("#galleryCount")?.textContent || "",
      virtualized: Boolean(
        document.querySelector(".gallery-grid.is-virtualized"),
      ),
    }));
    if (
      !galleryState.virtualized ||
      galleryState.renderedCards > 180 ||
      !galleryState.totalText.includes(String(GALLERY_IMAGE_COUNT))
    ) {
      throw new Error(
        `图库大数据渲染预算异常：${JSON.stringify(galleryState)}`,
      );
    }

    await page.locator("[data-workflow='image-to-image']").click();
    await page.getByRole("tab", { name: "当前族谱" }).click();
    await page.waitForSelector("[data-genealogy-node-id]");
    await page.locator("#genealogyNavToggleBtn").click();
    await page.waitForSelector(".genealogy-minimap");
    const genealogyState = await page.evaluate(() => ({
      renderedNodes: document.querySelectorAll("[data-genealogy-node-id]")
        .length,
      renderedEdges: document.querySelectorAll(
        "[data-genealogy-edge-kind='wire']",
      ).length,
      minimapNodes: document.querySelectorAll("[data-minimap-node-id]").length,
      minimapStatus:
        document.querySelector(".minimap-status")?.textContent || "",
    }));
    if (
      genealogyState.renderedNodes > 80 ||
      genealogyState.renderedEdges > 90 ||
      genealogyState.minimapNodes > 100 ||
      !genealogyState.minimapStatus.includes(String(GENEALOGY_NODE_COUNT))
    ) {
      throw new Error(
        `族谱大数据渲染预算异常：${JSON.stringify(genealogyState)}`,
      );
    }

    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs > 15000) {
      throw new Error(`前端性能基准耗时过长：${durationMs}ms`);
    }
    if (errors.length) {
      throw new Error(`浏览器控制台错误：${errors.join(" | ")}`);
    }
    console.log(
      JSON.stringify(
        { ok: true, durationMs, galleryState, genealogyState },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
