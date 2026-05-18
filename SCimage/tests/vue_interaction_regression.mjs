import { chromium } from "playwright";
import {
  collectViteOverlayText,
  emptyQueuePayload,
  installRegressionHarness,
  installRuntimeEventStreamMock,
  svgDataUrl,
  waitForCondition,
} from "./vue_regression/helpers.mjs";
import {
  runGenealogyCanvasScenario,
  runInitialWorkspaceAndGalleryScenario,
  runLegacyWorkspaceScenario,
  runPromptLibraryEmptyScenario,
  runPromptSettingsGalleryScenario,
  runProviderWorkflowScenario,
  runTaskLifecycleScenario,
} from "./vue_regression/interactionScenarios.mjs";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:5173/";
const interactionScenarios = [
  runInitialWorkspaceAndGalleryScenario,
  runPromptLibraryEmptyScenario,
  runGenealogyCanvasScenario,
  runPromptSettingsGalleryScenario,
  runProviderWorkflowScenario,
  runTaskLifecycleScenario,
  runLegacyWorkspaceScenario,
];
const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const portraitImageDataUrl = svgDataUrl(720, 1280, "#d8c3b3", "#5c473c");
let browser;
let providerProfile = {
  id: "profile-main",
  name: "主配置",
  base_url: "http://127.0.0.1:18080",
  model: "legacy-model",
  compat_profile_id: "openai",
  supports_count_parameter: true,
  has_api_key: true,
  api_key_hint: "key****main",
};

function providerProfilesPayload() {
  return {
    active_profile_id: providerProfile.id,
    compat_profiles: regressionState.providerCompatProfiles,
    profiles: [providerProfile],
    active_profile: {
      ...providerProfile,
      api_key: "mock-main-token",
    },
    is_ready: true,
  };
}

const now = Date.now();
const regressionState = {
  providerModels: [
    { id: "supported-model", label: "supported-model", category: "image" },
  ],
  providerCompatProfiles: [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: true },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ],
  galleryResponseDelayMs: 0,
  cleanupGeneratedRequestCount: 0,
  failNextWorkspaceStateSave: false,
  workspaceStateSaveAttempts: 0,
  workspaceStatePayload: {},
  workspaceStateSaves: [],
  expectedWorkspaceSaveFailures: 0,
  genealogyImageSlots: [1, 2],
  genealogyPositions: {},
  genealogyGraphStalePositionSnapshot: null,
  jobs: [
  {
    id: "job-running",
    status: "running",
    workflow: "generate",
    prompt: "正在生成的任务",
    count: 2,
    created_at: new Date(now - 130000).toISOString(),
    run_started_at: new Date(now - 125000).toISOString(),
    updated_at: new Date(now - 10000).toISOString(),
    images: [
      { slot: 1, url: imageDataUrl, name: "running.png" },
    ],
  },
  {
    id: "job-completed",
    status: "completed",
    workflow: "generate",
    prompt: "可删除的任务",
    count: 2,
    created_at: new Date(now - 260000).toISOString(),
    run_started_at: new Date(now - 250000).toISOString(),
    updated_at: new Date(now - 180000).toISOString(),
    images: [
      {
        slot: 1,
        url: portraitImageDataUrl,
        name: "one.svg",
        width: 720,
        height: 1280,
      },
      { slot: 2, url: imageDataUrl, name: "two.png" },
    ],
  },
  {
    id: "job-stale-selection",
    status: "completed",
    workflow: "generate",
    prompt: "刷新后消失的选中项",
    count: 1,
    created_at: new Date(now - 220000).toISOString(),
    run_started_at: new Date(now - 215000).toISOString(),
    updated_at: new Date(now - 160000).toISOString(),
    images: [
      { slot: 1, url: imageDataUrl, name: "stale.png" },
    ],
  },
  {
    id: "job-partial",
    status: "partial",
    workflow: "generate",
    prompt: "部分完成不可重试",
    count: 2,
    message: "上游返回了部分结果",
    error: "auth_required: chat-requirements failed",
    created_at: new Date(now - 190000).toISOString(),
    run_started_at: new Date(now - 185000).toISOString(),
    updated_at: new Date(now - 130000).toISOString(),
    images: [],
  },
  {
    id: "job-gallery-only",
    status: "completed",
    workflow: "generate",
    prompt: "只在图库分页中的任务",
    count: 3,
    created_at: new Date(now - 320000).toISOString(),
    run_started_at: new Date(now - 315000).toISOString(),
    updated_at: new Date(now - 310000).toISOString(),
    images: [
      { slot: 1, url: imageDataUrl, name: "gallery-only-1.png" },
      { slot: 2, url: imageDataUrl, name: "gallery-only-2.png" },
      { slot: 3, url: imageDataUrl, name: "gallery-only-3.png" },
    ],
  },
  ],
};

function galleryItems() {
  return regressionState.jobs.flatMap((job) => (
    Array.isArray(job.images)
      ? job.images.map((image) => ({ job, image }))
      : []
  ));
}

function jobsPayload() {
  const visibleJobs = regressionState.jobs.filter((job) => job.id !== "job-gallery-only");
  return {
    jobs: visibleJobs,
    total: visibleJobs.length,
    has_more: false,
    page_size: 80,
    next_offset: visibleJobs.length,
    next_cursor: "",
  };
}

function galleryPayload() {
  const sortedJobs = [...regressionState.jobs].sort((left, right) => {
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
  const items = [
    ...sortedJobs.flatMap((job) => (
      Array.isArray(job.images)
        ? job.images.map((image) => ({ job: { ...job, images: [image], image_count: job.images.length }, image }))
        : []
    )),
    {
      job: {
        id: "job-missing-reference",
        status: "completed",
        workflow: "generate",
        prompt: "失效参考图",
        count: 1,
        created_at: new Date(now - 300000).toISOString(),
        updated_at: new Date(now - 240000).toISOString(),
      },
      image: { slot: 1, url: "/missing-reference.png", name: "missing.png" },
    },
  ];
  return {
    items,
    total: items.length,
    has_more: false,
    page_size: 160,
    next_cursor: "",
  };
}

function genealogyPayload() {
  const nodes = regressionState.genealogyImageSlots.map((slot) => ({
    id: `genealogy-job:${slot}`,
    type: "generated",
    job_id: "genealogy-job",
    slot,
    url: slot === 1 ? portraitImageDataUrl : imageDataUrl,
    filename: `genealogy-${slot}.png`,
    prompt: slot === 1 ? "族谱根图" : `族谱第 ${slot} 张`,
    workflow: "image-to-image",
    status: "completed",
    model: "supported-model",
    compat_profile_id: "openai",
    output_profile_id: "aspect_v1",
    quality: "auto",
    size: "auto",
    created_at: new Date(now - 260000 + slot * 1000).toISOString(),
    updated_at: new Date(now - 180000 + slot * 1000).toISOString(),
  }));
  const root = nodes.find((node) => node.slot === 1) || nodes[0];
  const edges = root
    ? nodes
      .filter((node) => node.id !== root.id)
      .map((node) => ({ from: root.id, to: node.id, job_id: "genealogy-job" }))
    : [];
  if (!root) return { families: [], nodes: [], edges: [], positions: {} };
  return {
    families: [
      {
        root_id: root.id,
        title: "族谱删除回归",
        prompt: root.prompt,
        cover_url: root.url,
        image_count: nodes.length,
        node_count: nodes.length,
        generation_count: nodes.length > 1 ? 2 : 1,
        latest_updated_at: nodes.at(-1)?.updated_at || root.updated_at,
        has_multi_source: false,
        root_type: "generated",
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        root_id: `genealogy-extra-root:${index + 1}`,
        title: `可切换族谱 ${index + 1}`,
        prompt: `用于横向拖动回归的根图 ${index + 1}`,
        cover_url: index % 2 ? imageDataUrl : portraitImageDataUrl,
        image_count: 2 + index,
        node_count: 2 + index,
        generation_count: 1 + (index % 3),
        latest_updated_at: new Date(now - 320000 - index * 1000).toISOString(),
        has_multi_source: index % 4 === 0,
        root_type: "generated",
      })),
    ],
    nodes,
    edges,
    positions: regressionState.genealogyPositions,
  };
}

function sortedGalleryPayload(sortDirection) {
  const payload = galleryPayload();
  payload.items = [...payload.items].sort((left, right) => {
    const leftJob = left.job || left;
    const rightJob = right.job || right;
    const leftTime = new Date(leftJob.updated_at || leftJob.created_at || 0).getTime();
    const rightTime = new Date(rightJob.updated_at || rightJob.created_at || 0).getTime();
    return sortDirection === "asc" ? leftTime - rightTime : rightTime - leftTime;
  });
  return payload;
}

async function main() {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  let expectedMissingReferenceLoads = 0;

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("Failed to load resource: the server responded with a status of 404") && expectedMissingReferenceLoads > 0) {
      expectedMissingReferenceLoads -= 1;
      return;
    }
    if (text.includes("Failed to load resource: the server responded with a status of 503") && regressionState.expectedWorkspaceSaveFailures > 0) {
      regressionState.expectedWorkspaceSaveFailures -= 1;
      return;
    }
    errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await installRegressionHarness(page);
  await installRuntimeEventStreamMock(page);
  await page.route("**/api/queue", (route) => route.fulfill({
    json: emptyQueuePayload(),
  }));
  await page.route("**/api/jobs?**", (route) => route.fulfill({ json: jobsPayload() }));
  await page.route("**/api/gallery/images?**", async (route) => {
    const url = new URL(route.request().url());
    const payload = sortedGalleryPayload(url.searchParams.get("sort") || "desc");
    if (regressionState.galleryResponseDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, regressionState.galleryResponseDelayMs));
    }
    return route.fulfill({ json: payload });
  });
  await page.route("**/api/genealogy/graph", (route) => {
    const payload = genealogyPayload();
    if (regressionState.genealogyGraphStalePositionSnapshot) {
      payload.positions = regressionState.genealogyGraphStalePositionSnapshot;
      regressionState.genealogyGraphStalePositionSnapshot = null;
    }
    return route.fulfill({ json: payload });
  });
  await page.route("**/missing-reference.png", (route) => {
    expectedMissingReferenceLoads += 1;
    return route.fulfill({ status: 404, body: "missing" });
  });
  await page.route("**/api/provider-profiles", (route) => route.fulfill({ json: providerProfilesPayload() }));
  await page.route("**/api/provider-profiles/profile-main", (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      providerProfile = {
        ...providerProfile,
        name: String(payload.name || providerProfile.name),
        base_url: String(payload.base_url || providerProfile.base_url),
        model: String(payload.model || providerProfile.model),
        compat_profile_id: String(payload.compat_profile_id || providerProfile.compat_profile_id),
        supports_count_parameter: payload.supports_count_parameter !== false,
        has_api_key: true,
      };
      return route.fulfill({ json: providerProfilesPayload() });
    }
    return route.fallback();
  });
  await page.route("**/api/provider-profiles/models", async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        normalized_base_url: String(payload.base_url || "").replace(/\/+$/, ""),
        models: regressionState.providerModels,
      },
    });
  });
  await page.route("**/api/workspace-state", (route) => {
    if (route.request().method() === "PUT") {
      regressionState.workspaceStateSaveAttempts += 1;
      if (regressionState.failNextWorkspaceStateSave) {
        regressionState.failNextWorkspaceStateSave = false;
        return route.fulfill({ status: 503, json: { error: "temporary workspace save failure" } });
      }
      regressionState.workspaceStateSaves.push(route.request().postDataJSON());
      return route.fulfill({ json: regressionState.workspaceStateSaves.at(-1) || {} });
    }
    return route.fulfill({ json: regressionState.workspaceStatePayload });
  });
  await page.route("**/api/prompts", (route) => route.fulfill({ json: { prompts: [] } }));
  await page.route("**/api/maintenance/generated/cleanup-empty-dirs", async (route) => {
    regressionState.cleanupGeneratedRequestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return route.fulfill({ json: { removed_count: 2 } });
  });
  await page.route("**/api/jobs/job-running/cancel", async (route) => {
    regressionState.jobs = regressionState.jobs.map((job) => (
      job.id === "job-running"
        ? { ...job, status: "canceled", message: "任务已中断，当前没有可保留的图片。" }
        : job
    ));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ json: regressionState.jobs.find((job) => job.id === "job-running") });
  });
  await page.route("**/api/jobs/job-completed/images/1", (route) => {
    regressionState.jobs = regressionState.jobs.map((job) => (
      job.id === "job-completed"
        ? { ...job, images: job.images.filter((image) => image.slot !== 1) }
        : job
    ));
    return route.fulfill({
      json: { ok: true, deleted_job: false, job: regressionState.jobs.find((job) => job.id === "job-completed") },
    });
  });
  await page.route("**/api/jobs/job-gallery-only/images/2", (route) => {
    regressionState.jobs = regressionState.jobs.map((job) => (
      job.id === "job-gallery-only"
        ? { ...job, images: job.images.filter((image) => image.slot !== 2) }
        : job
    ));
    return route.fulfill({
      json: { ok: true, deleted_job: false, job: regressionState.jobs.find((job) => job.id === "job-gallery-only") },
    });
  });
  await page.route("**/api/jobs/genealogy-job/images/2", (route) => {
    regressionState.genealogyImageSlots = regressionState.genealogyImageSlots.filter((slot) => slot !== 2);
    delete regressionState.genealogyPositions["genealogy-job:2"];
    return route.fulfill({ json: { ok: true, deleted_job: false } });
  });
  await page.route("**/api/genealogy/nodes/positions", (route) => {
    const payload = route.request().postDataJSON();
    const positions = payload?.positions || {};
    Object.entries(positions).forEach(([nodeId, position]) => {
      regressionState.genealogyPositions[nodeId] = {
        x: Math.max(0, Math.round(Number(position?.x || 0))),
        y: Math.max(0, Math.round(Number(position?.y || 0))),
      };
    });
    return route.fulfill({
      json: {
        ok: true,
        positions: regressionState.genealogyPositions,
        updated_count: Object.keys(positions).length,
      },
    });
  });
  await page.route("**/api/jobs/job-completed", (route) => {
    regressionState.jobs = regressionState.jobs.filter((job) => job.id !== "job-completed");
    return route.fulfill({ json: { ok: true, deleted_id: "job-completed" } });
  });
  await page.route("**/api/jobs/job-failed/retry", async (route) => {
    regressionState.jobs = regressionState.jobs.map((job) => (
      job.id === "job-failed"
        ? { ...job, status: "queued", updated_at: new Date().toISOString() }
        : job
    ));
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({ json: regressionState.jobs.find((job) => job.id === "job-failed") });
  });

  const context = {
    page,
    state: regressionState,
    waitForCondition,
    baseUrl: BASE_URL,
    now,
    imageDataUrl,
  };

  for (const runScenario of interactionScenarios) {
    await runScenario(context);
  }

  if (errors.length) {
    throw new Error(`浏览器控制台错误：${errors.join(" | ")}`);
  }
  await browser.close();
}

main().catch(async (error) => {
  console.error(error);
  if (browser) {
    for (const overlayText of await collectViteOverlayText(browser)) {
      console.error(`VITE_OVERLAY ${overlayText}`);
    }
  }
  await browser?.close();
  process.exitCode = 1;
});
