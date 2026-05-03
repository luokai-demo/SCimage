import { chromium } from "playwright";

const BASE_URL = process.env.SCIMAGE_BASE_URL || "http://127.0.0.1:5173/";
const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const portraitImageDataUrl = svgDataUrl(720, 1280, "#d8c3b3", "#5c473c");
const portraitPreviewDataUrl = svgDataUrl(72, 128, "#d8c3b3", "#5c473c");
let browser;
let providerModels = [
  { id: "supported-model", label: "supported-model", category: "image" },
];
let providerCompatProfiles = [
  { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: true },
  { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
];
let providerProfile = {
  id: "profile-main",
  name: "主配置",
  base_url: "http://127.0.0.1:18080",
  model: "legacy-model",
  compat_profile_id: "openai",
  supports_count_parameter: true,
  has_api_key: true,
  api_key_hint: "sk****main",
};
let galleryResponseDelayMs = 0;
let cleanupGeneratedRequestCount = 0;
let failNextWorkspaceStateSave = false;
let workspaceStateSaveAttempts = 0;
let workspaceStatePayload = {};
let genealogyImageSlots = [1, 2];

async function waitForCondition(predicate, message, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

function svgDataUrl(width, height, topColor, bottomColor) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${topColor}"/><stop offset="1" stop-color="${bottomColor}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${width * 0.52}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.18}" fill="#f4dfcd"/><rect x="${width * 0.18}" y="${height * 0.62}" width="${width * 0.64}" height="${height * 0.2}" rx="28" fill="#ffffff" opacity="0.78"/></svg>`)}`;
}

function providerProfilesPayload() {
  return {
    active_profile_id: providerProfile.id,
    compat_profiles: providerCompatProfiles,
    profiles: [providerProfile],
    active_profile: {
      ...providerProfile,
      api_key: "sk-main",
    },
    is_ready: true,
  };
}

const now = Date.now();
let jobs = [
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
        placeholder: { color: "#d8c3b3", accent_color: "#e4d1c3" },
        preview: { url: portraitPreviewDataUrl, width: 72, height: 128 },
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
];

function galleryItems() {
  return jobs.flatMap((job) => (
    Array.isArray(job.images)
      ? job.images.map((image) => ({ job, image }))
      : []
  ));
}

function jobsPayload() {
  const visibleJobs = jobs.filter((job) => job.id !== "job-gallery-only");
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
  const sortedJobs = [...jobs].sort((left, right) => {
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
  const nodes = genealogyImageSlots.map((slot) => ({
    id: `genealogy-job:${slot}`,
    type: "generated",
    job_id: "genealogy-job",
    slot,
    url: slot === 1 ? portraitImageDataUrl : imageDataUrl,
    preview_url: slot === 1 ? portraitPreviewDataUrl : imageDataUrl,
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
  if (!root) return { families: [], nodes: [], edges: [] };
  return {
    families: [
      {
        root_id: root.id,
        title: "族谱删除回归",
        prompt: root.prompt,
        cover_url: root.preview_url,
        image_count: nodes.length,
        node_count: nodes.length,
        generation_count: nodes.length > 1 ? 2 : 1,
        latest_updated_at: nodes.at(-1)?.updated_at || root.updated_at,
        has_multi_source: false,
        root_type: "generated",
      },
    ],
    nodes,
    edges,
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
  let expectedWorkspaceSaveFailures = 0;
  const workspaceStateSaves = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("Failed to load resource: the server responded with a status of 404") && expectedMissingReferenceLoads > 0) {
      expectedMissingReferenceLoads -= 1;
      return;
    }
    if (text.includes("Failed to load resource: the server responded with a status of 503") && expectedWorkspaceSaveFailures > 0) {
      expectedWorkspaceSaveFailures -= 1;
      return;
    }
    errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    window.__copiedTexts = [];
    window.__desktopDownloads = [];
    document.execCommand = (command) => {
      if (command !== "copy") return false;
      const active = document.activeElement;
      window.__copiedTexts.push(active && "value" in active ? active.value : String(window.getSelection?.() || ""));
      return true;
    };
  });

  await page.route("**/api/jobs?**", (route) => route.fulfill({ json: jobsPayload() }));
  await page.route("**/api/gallery/images?**", async (route) => {
    const url = new URL(route.request().url());
    const payload = sortedGalleryPayload(url.searchParams.get("sort") || "desc");
    if (galleryResponseDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, galleryResponseDelayMs));
    }
    return route.fulfill({ json: payload });
  });
  await page.route("**/api/genealogy/graph", (route) => route.fulfill({ json: genealogyPayload() }));
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
        models: providerModels,
      },
    });
  });
  await page.route("**/api/workspace-state", (route) => {
    if (route.request().method() === "PUT") {
      workspaceStateSaveAttempts += 1;
      if (failNextWorkspaceStateSave) {
        failNextWorkspaceStateSave = false;
        return route.fulfill({ status: 503, json: { error: "temporary workspace save failure" } });
      }
      workspaceStateSaves.push(route.request().postDataJSON());
      return route.fulfill({ json: workspaceStateSaves.at(-1) || {} });
    }
    return route.fulfill({ json: workspaceStatePayload });
  });
  await page.route("**/api/prompts", (route) => route.fulfill({ json: { prompts: [] } }));
  await page.route("**/api/maintenance/generated/cleanup-empty-dirs", async (route) => {
    cleanupGeneratedRequestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return route.fulfill({ json: { removed_count: 2 } });
  });
  await page.route("**/api/jobs/job-running/cancel", async (route) => {
    jobs = jobs.map((job) => (
      job.id === "job-running"
        ? { ...job, status: "canceled", message: "任务已中断，当前没有可保留的图片。" }
        : job
    ));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ json: jobs.find((job) => job.id === "job-running") });
  });
  await page.route("**/api/jobs/job-completed/images/1", (route) => {
    jobs = jobs.map((job) => (
      job.id === "job-completed"
        ? { ...job, images: job.images.filter((image) => image.slot !== 1) }
        : job
    ));
    return route.fulfill({
      json: { ok: true, deleted_job: false, job: jobs.find((job) => job.id === "job-completed") },
    });
  });
  await page.route("**/api/jobs/job-gallery-only/images/2", (route) => {
    jobs = jobs.map((job) => (
      job.id === "job-gallery-only"
        ? { ...job, images: job.images.filter((image) => image.slot !== 2) }
        : job
    ));
    return route.fulfill({
      json: { ok: true, deleted_job: false, job: jobs.find((job) => job.id === "job-gallery-only") },
    });
  });
  await page.route("**/api/jobs/genealogy-job/images/2", (route) => {
    genealogyImageSlots = genealogyImageSlots.filter((slot) => slot !== 2);
    return route.fulfill({ json: { ok: true, deleted_job: false } });
  });
  await page.route("**/api/jobs/job-completed", (route) => {
    jobs = jobs.filter((job) => job.id !== "job-completed");
    return route.fulfill({ json: { ok: true, deleted_id: "job-completed" } });
  });
  await page.route("**/api/jobs/job-failed/retry", async (route) => {
    jobs = jobs.map((job) => (
      job.id === "job-failed"
        ? { ...job, status: "queued", updated_at: new Date().toISOString() }
        : job
    ));
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({ json: jobs.find((job) => job.id === "job-failed") });
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#galleryWindow");
  await page.waitForSelector(".running-job-card");
  await page.waitForSelector("#saveAsProviderBtn[disabled]");
  const initialPanelToggleLabel = await page.locator("#panelToggleBtn").getAttribute("aria-label");
  if (initialPanelToggleLabel !== "收起左侧工作区") {
    throw new Error(`左侧面板初始按钮文案错误：${initialPanelToggleLabel || ""}`);
  }
  await page.locator("#panelToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#panelToggleBtn")?.getAttribute("aria-label") === "展开左侧工作区");
  const collapsedPanelToggleTitle = await page.locator("#panelToggleBtn").getAttribute("title");
  if (collapsedPanelToggleTitle !== "展开左侧工作区") {
    throw new Error(`左侧面板收起后标题文案错误：${collapsedPanelToggleTitle || ""}`);
  }
  await page.locator("#panelToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#panelToggleBtn")?.getAttribute("aria-label") === "收起左侧工作区");
  await page.waitForSelector(".left-task-card.is-partial", { state: "attached" });
  const partialTaskActions = await page.locator(".left-task-card.is-partial .left-task-actions").textContent();
  if (partialTaskActions.includes("重试") || !partialTaskActions.includes("删除")) {
    throw new Error(`部分完成任务操作错误，应只允许删除不允许重试：${partialTaskActions}`);
  }
  const partialTaskMessage = await page.locator(".left-task-card.is-partial .left-task-message").textContent();
  if (!partialTaskMessage?.includes("API上游原因失败") || !partialTaskMessage.includes("auth_required / chat-requirements failed")) {
    throw new Error(`部分完成任务没有显示旧版诊断信息：${partialTaskMessage || ""}`);
  }

  const portraitCard = page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1']");
  await portraitCard.scrollIntoViewIfNeeded();
  await portraitCard.locator(".gallery-image").waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const image = document.querySelector(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .gallery-image");
    return image && image.complete && image.naturalWidth > 0;
  });
  const cardLayout = await portraitCard.evaluate((card) => {
    const image = card.querySelector(".gallery-image");
    const cardRect = card.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    return {
      className: card.className,
      hasLegacyLazyImage: Boolean(card.querySelector("img[data-src]")),
      isVirtualized: Boolean(card.closest(".gallery-grid.is-virtualized")),
      hasMasonryProfile: card.classList.contains("has-masonry-profile"),
      wrapperPosition: window.getComputedStyle(card.parentElement).position,
      cardHeight: cardRect.height,
      imageHeight: imageRect?.height || 0,
      topDelta: imageRect ? Math.abs(imageRect.top - cardRect.top) : 999,
      heightDelta: imageRect ? Math.abs(imageRect.height - cardRect.height) : 999,
    };
  });
  if (
    cardLayout.hasLegacyLazyImage ||
    !cardLayout.isVirtualized ||
    !cardLayout.hasMasonryProfile ||
    cardLayout.wrapperPosition !== "absolute" ||
    /\bis-(loading|loaded|error)\b/.test(cardLayout.className) ||
    cardLayout.topDelta > 1 ||
    cardLayout.heightDelta > 2 ||
    cardLayout.imageHeight < 120
  ) {
    throw new Error(`图库卡片仍有旧懒加载/占位布局残留：${JSON.stringify(cardLayout)}`);
  }

  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  const generateEmptyLabel = (await page.locator("#savedPrompts").textContent())?.trim() || "";
  if (generateEmptyLabel !== "还没有保存的文生图提示词") {
    throw new Error(`文生图提示词库空态错误：${generateEmptyLabel}`);
  }
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "请先输入提示词。");
  const focusedAfterEmptySave = await page.evaluate(() => document.activeElement?.id || "");
  if (focusedAfterEmptySave !== "prompt") {
    throw new Error(`空提示词保存后没有聚焦提示词输入框：${focusedAfterEmptySave}`);
  }
  await page.locator("[data-workflow='image-to-image']").click();
  const imageWorkflowEmptyLabel = (await page.locator("#savedPrompts").textContent())?.trim() || "";
  if (imageWorkflowEmptyLabel !== "还没有保存的图生图提示词") {
    throw new Error(`图生图提示词库空态错误：${imageWorkflowEmptyLabel}`);
  }
  await page.locator("[data-workflow='generate']").click();
  await page.locator("#togglePromptBankBtn").click();

  await page.locator("[data-workflow='image-to-image']").click();
  await page.getByRole("tab", { name: "当前族谱" }).click();
  await page.waitForSelector('[data-genealogy-node-id="genealogy-job:2"]');
  await page.locator('[data-genealogy-node-id="genealogy-job:2"]').click();
  const genealogyDeleteButton = page.locator(".node-inspector .genealogy-tool-btn.is-danger");
  await genealogyDeleteButton.click();
  await page.waitForFunction(() => document.querySelector(".confirm-dialog-action")?.textContent?.trim() === "删除图片");
  const genealogyDeleteDescription = await page.locator(".confirm-dialog-description").textContent();
  if (!genealogyDeleteDescription?.includes("本次任务的其余 1 张图片会保留")) {
    throw new Error(`族谱删除图片确认没有使用节点快照图片数：${genealogyDeleteDescription || ""}`);
  }
  await page.locator(".confirm-dialog-action", { hasText: "删除图片" }).click();
  await page.waitForFunction(() => !document.querySelector('[data-genealogy-node-id="genealogy-job:2"]'));

  genealogyImageSlots = Array.from({ length: 160 }, (_, index) => index + 1);
  await page.locator(".genealogy-icon-btn").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-minimap-node-id]").length > 40);
  const minimapBudgetState = await page.evaluate(() => ({
    nodeCount: document.querySelectorAll("[data-minimap-node-id]").length,
    edgeCount: document.querySelectorAll("[data-minimap-edge]").length,
    stats: document.querySelector(".minimap-stats")?.textContent?.trim() || "",
  }));
  if (minimapBudgetState.nodeCount > 100 || minimapBudgetState.edgeCount > 140 || !minimapBudgetState.stats.includes("/160")) {
    throw new Error(`族谱导航地图没有按大图谱抽样渲染：${JSON.stringify(minimapBudgetState)}`);
  }
  genealogyImageSlots = [1, 2];
  await page.locator("[data-workflow='generate']").click();

  await page.fill("#prompt", "重复保存检查");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => document.querySelectorAll(".prompt-bank-item").length === 1);
  const savedPromptOptionSummary = await page.locator(".prompt-bank-item .prompt-meta").first().textContent();
  if (!savedPromptOptionSummary?.startsWith("文生图 · 尺寸")) {
    throw new Error(`保存提示词摘要缺少工作流信息：${savedPromptOptionSummary || ""}`);
  }
  await page.locator("#savePromptBtn").click();
  await page.waitForTimeout(200);
  const duplicatePromptCount = await page.locator(".prompt-bank-item").count();
  const promptBankCountText = await page.locator("#promptBankCount").textContent();
  if (duplicatePromptCount !== 1 || promptBankCountText !== "1 条") {
    throw new Error(`重复保存提示词没有更新置顶而是产生重复项：items=${duplicatePromptCount}, count=${promptBankCountText || ""}`);
  }
  await page.locator("#togglePromptBankBtn").click();

  await page.locator("#settingsToggleBtn").click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display !== "none");
  await page.locator("#cleanupGeneratedBtn").click();
  await page.waitForFunction(() => document.querySelector("#cleanupGeneratedBtn")?.hasAttribute("disabled"));
  await page.locator("#cleanupGeneratedBtn").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#cleanupGeneratedBtn")?.textContent?.trim() === "清理空文件夹");
  if (cleanupGeneratedRequestCount !== 1) {
    throw new Error(`清理空文件夹没有防重复请求：${cleanupGeneratedRequestCount}`);
  }
  const cleanupStatus = await page.locator("#status").textContent();
  if (cleanupStatus !== "已清理 2 个空文件夹。") {
    throw new Error(`清理空文件夹状态错误：${cleanupStatus || ""}`);
  }
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display === "none");
  await page.locator("#settingsToggleBtn").click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display !== "none");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display === "none");

  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "复制" }).click({ force: true });
  await page.waitForFunction(() => window.__copiedTexts?.includes("可删除的任务"));
  const copyStatus = await page.locator("#status").textContent();
  if (copyStatus !== "提示词已复制。") {
    throw new Error(`复制降级没有显示成功状态：${copyStatus || ""}`);
  }

  await page.locator("[data-gallery-filter='tasks']").click();
  await page.waitForFunction(() => document.querySelector("#galleryCount")?.textContent?.includes("个可见任务"));
  await page.waitForSelector(".gallery-task-section");
  const runningTaskSection = page.locator(".gallery-task-section", { hasText: "正在生成的任务" }).first();
  const runningTaskTitle = await runningTaskSection.locator(".gallery-task-section-title").textContent();
  const runningTaskSummary = await runningTaskSection.locator(".gallery-task-section-summary").textContent();
  const runningTaskMeta = await runningTaskSection.locator(".gallery-task-section-meta").textContent();
  if (
    runningTaskTitle !== "正在生成的任务" ||
    !runningTaskSummary?.includes("任务 job-runn") ||
    !runningTaskMeta?.includes("文生图 · 1/2 ·")
  ) {
    throw new Error(`任务分组信息没有按旧版展示：title=${runningTaskTitle || ""}, summary=${runningTaskSummary || ""}, meta=${runningTaskMeta || ""}`);
  }
  const runningGalleryAction = await runningTaskSection
    .locator(".gallery-item[data-job-id='job-running'][data-image-slot='1'] .meta-actions button")
    .last()
    .textContent();
  if (runningGalleryAction !== "中断") {
    throw new Error(`运行中图库卡片最后操作应为中断：${runningGalleryAction || ""}`);
  }
  await page.locator("[data-gallery-filter='prompts']").click();
  await page.waitForFunction(() => document.querySelector("#galleryCount")?.textContent?.includes("组提示词"));
  const completedPromptSection = page.locator(".gallery-task-section", { hasText: "可删除的任务" }).first();
  const completedPromptMeta = await completedPromptSection.locator(".gallery-task-section-meta").textContent();
  if (!completedPromptMeta?.includes("1 个任务 · 2 张图片 · 最近更新")) {
    throw new Error(`提示词分组信息没有按旧版展示：${completedPromptMeta || ""}`);
  }
  await page.locator("[data-gallery-filter='all']").click();

  await page.locator(".gallery-item[data-job-id='job-missing-reference'][data-image-slot='1'] .meta-actions button", { hasText: "参考" }).evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "图片读取失败：404");
  const workflowAfterFailedReference = await page.locator(".workflow-tab.active").textContent();
  const sourcePreviewCount = await page.locator(".source-preview-item").count();
  if (workflowAfterFailedReference !== "文生图" || sourcePreviewCount !== 0) {
    throw new Error(`失效参考图被误加入或误切换：workflow=${workflowAfterFailedReference || ""}, sources=${sourcePreviewCount}`);
  }

  await page.locator(".gallery-item[data-job-id='job-missing-reference'][data-image-slot='1'] .meta-actions button", { hasText: "下载" }).evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "下载失败：HTTP 404");

  await page.evaluate(() => {
    window.pywebview = {
      api: {
        download_file: async (url, filename) => {
          window.__desktopDownloads.push({ url, filename });
          return { ok: true, path: "/tmp/" + filename };
        },
      },
    };
  });
  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "下载" }).click({ force: true });
  await page.waitForFunction(() => window.__desktopDownloads?.some((item) => item.filename === "one.svg"));
  const desktopDownloadStatus = await page.locator("#status").textContent();
  if (desktopDownloadStatus !== "图片已保存。") {
    throw new Error(`桌面桥接下载没有显示成功状态：${desktopDownloadStatus || ""}`);
  }

  galleryResponseDelayMs = 400;
  await page.locator("#sortBtn").click();
  await page.locator("#sortBtn").click();
  await page.waitForFunction(() => !document.querySelector("#sortBtn")?.textContent?.includes("旧到新"));
  await page.waitForSelector(".gallery-item[data-job-id='job-completed'][data-image-slot='1']");
  const firstGalleryJobAfterQueuedSort = await page.locator(".gallery-item[data-job-id]").first().getAttribute("data-job-id");
  if (firstGalleryJobAfterQueuedSort !== "job-running") {
    throw new Error(`连续排序后最终显示顺序没有回到新到旧：${firstGalleryJobAfterQueuedSort || ""}`);
  }
  galleryResponseDelayMs = 0;

  jobs = [
    {
      id: "job-lightbox-sync",
      status: "completed",
      workflow: "generate",
      prompt: "预览刷新保持当前图",
      count: 1,
      created_at: new Date(now - 210000).toISOString(),
      updated_at: new Date(now - 150000).toISOString(),
      images: [
        { slot: 1, url: imageDataUrl, name: "lightbox.png" },
      ],
    },
    ...jobs,
  ];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForSelector(".gallery-item[data-job-id='job-lightbox-sync'][data-image-slot='1']");
  await page.locator(".gallery-item[data-job-id='job-lightbox-sync'][data-image-slot='1']").click({ force: true });
  await page.waitForSelector("#lightbox.open");
  const lightboxA11yState = await page.locator("#lightbox").evaluate((node) => ({
    role: node.getAttribute("role"),
    modal: node.getAttribute("aria-modal"),
    label: node.getAttribute("aria-label"),
  }));
  if (lightboxA11yState.role !== "dialog" || lightboxA11yState.modal !== "true" || lightboxA11yState.label !== "图片预览") {
    throw new Error(`预览弹层语义没有恢复：${JSON.stringify(lightboxA11yState)}`);
  }
  for (let index = 0; index < 16; index += 1) {
    await page.locator("#lightboxZoomIn").click();
  }
  const zoomState = await page.evaluate(() => ({
    text: document.querySelector("#lightboxZoomValue")?.textContent || "",
    disabled: document.querySelector("#lightboxZoomIn")?.hasAttribute("disabled") || false,
  }));
  if (zoomState.text !== "500%" || !zoomState.disabled) {
    throw new Error(`预览最大缩放没有恢复到 5x：${JSON.stringify(zoomState)}`);
  }
  const lightboxPromptBeforeRefresh = await page.locator("#lightboxPrompt").textContent();
  if (lightboxPromptBeforeRefresh !== "预览刷新保持当前图") {
    throw new Error(`预览打开了错误图片：${lightboxPromptBeforeRefresh || ""}`);
  }
  jobs = [
    {
      id: "job-newer-before-lightbox",
      status: "completed",
      workflow: "generate",
      prompt: "刷新后排在前面的新图",
      count: 1,
      created_at: new Date(now + 30000).toISOString(),
      updated_at: new Date(now + 30000).toISOString(),
      images: [
        { slot: 1, url: imageDataUrl, name: "newer.png" },
      ],
    },
    ...jobs,
  ];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelector("#lightboxPrompt")?.textContent === "预览刷新保持当前图");
  const lightboxCounterAfterRefresh = await page.locator("#lightboxCounter").textContent();
  if (lightboxCounterAfterRefresh === "1 / 7") {
    throw new Error("预览刷新后仍按旧下标显示，当前图片没有按任务和槽位重新定位。");
  }
  jobs = jobs.filter((job) => job.id !== "job-lightbox-sync");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !document.querySelector("#lightbox")?.classList.contains("open"));
  jobs = jobs.filter((job) => job.id !== "job-newer-before-lightbox");
  await page.keyboard.press("Escape");

  await page.locator(".gallery-item[data-job-id='job-stale-selection'][data-image-slot='1'] .gallery-select-btn").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#batchCount")?.textContent === "已选择 1 张");
  jobs = jobs.filter((job) => job.id !== "job-stale-selection");
  await page.locator("#settingsToggleBtn").click();
  await page.locator("#refreshGalleryBtn").click();
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-stale-selection']"));
  await page.waitForFunction(() => document.querySelector("#batchToolbar")?.hidden === true);
  await page.keyboard.press("Escape");

  await page.fill("#prompt", "离开保存检查");
  const saveRequest = page.waitForRequest((request) => (
    request.method() === "PUT" &&
    request.url().includes("/api/workspace-state") &&
    (request.postData() || "").includes("离开保存检查")
  ));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenSaveRequest = await saveRequest;
  const hiddenSavePayload = hiddenSaveRequest.postDataJSON();
  if (hiddenSavePayload?.forms?.generate?.prompt !== "离开保存检查") {
    throw new Error("页面隐藏时没有立即保存当前工作区状态。");
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await waitForCondition(
    () => workspaceStateSaves.some((payload) => payload?.forms?.generate?.prompt === "离开保存检查"),
    "页面隐藏保存请求没有成功落入工作区状态。",
  );
  const attemptsBeforeRetry = workspaceStateSaveAttempts;
  failNextWorkspaceStateSave = true;
  expectedWorkspaceSaveFailures += 1;
  await page.fill("#prompt", "失败后重试保存检查");
  await waitForCondition(
    () => (
      workspaceStateSaveAttempts >= attemptsBeforeRetry + 2 &&
      workspaceStateSaves.some((payload) => payload?.forms?.generate?.prompt === "失败后重试保存检查")
    ),
    "工作区状态保存失败后没有自动重试并保存最新内容。",
    5000,
  );

  const invalidModelHint = await page.locator("#modelStatusHint").textContent();
  if (invalidModelHint !== "当前已保存模型不在该 API 支持列表中，请重新选择。") {
    throw new Error(`已保存模型不受支持时提示错误：${invalidModelHint || ""}`);
  }
  const saveAsTitleBeforeModelSelect = await page.locator("#saveAsProviderBtn").getAttribute("title");
  if (saveAsTitleBeforeModelSelect !== "当前已保存模型不在该 API 支持列表中，请重新选择。") {
    throw new Error(`未阻止保存不受支持模型：${saveAsTitleBeforeModelSelect || ""}`);
  }

  await page.selectOption("#model", "supported-model");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));

  await page.fill("#baseUrl", "http://127.0.0.1:18081/v1");
  await page.waitForFunction(() => document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));
  const staleModelHint = await page.locator("#modelStatusHint").textContent();
  if (staleModelHint !== "连接信息已变化，请先拉取模型") {
    throw new Error(`连接变化后模型列表未标记为过期：${staleModelHint || ""}`);
  }

  providerModels = [{ id: "fresh-model", label: "fresh-model", category: "image" }];
  await page.locator("#modelReloadBtn").click();
  await page.waitForSelector("#model option[value='fresh-model']", { state: "attached" });
  const imageModelGroupLabel = await page.locator("#model optgroup").first().getAttribute("label");
  if (imageModelGroupLabel !== "图片模型") {
    throw new Error(`模型下拉没有恢复图片模型分组：${imageModelGroupLabel || ""}`);
  }
  const readyModelHint = await page.locator("#modelStatusHint").textContent();
  if (readyModelHint !== "当前已保存模型不在该 API 支持列表中，请重新选择。") {
    throw new Error(`重新拉取但未选择模型时提示错误：${readyModelHint || ""}`);
  }
  await page.selectOption("#model", "fresh-model");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));

  await page.selectOption("#providerCompatProfile", "text-only");
  await page.waitForFunction(() => document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.waitForSelector("#quality option[value='hd']", { state: "attached" });
  await page.selectOption("#quality", "hd");
  await page.waitForSelector("#size option[value='1440x2560']", { state: "attached" });
  await page.selectOption("#size", "1440x2560");
  await page.fill("#prompt", "跨输出档位套用提示词");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => (
    [...document.querySelectorAll(".prompt-bank-item .prompt-text")]
      .some((node) => node.textContent === "跨输出档位套用提示词")
  ));
  await page.locator(".prompt-library-close").click();

  await page.selectOption("#providerCompatProfile", "openai");
  await page.waitForFunction(() => !document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.waitForSelector("#quality option[value='low']", { state: "attached" });
  await page.selectOption("#quality", "low");
  await page.selectOption("#size", "1:1");
  await page.fill("#prompt", "套用前占位");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator(".prompt-bank-item", { hasText: "跨输出档位套用提示词" }).locator("button", { hasText: "套用" }).click();
  await page.waitForFunction(() => document.querySelector("#prompt")?.value === "跨输出档位套用提示词");
  const appliedPromptOutput = await page.evaluate(() => {
    const quality = document.querySelector("#quality");
    const size = document.querySelector("#size");
    return {
      quality: quality?.value || "",
      size: size?.value || "",
      qualityValid: Boolean(quality && [...quality.options].some((option) => option.value === quality.value)),
      sizeValid: Boolean(size && [...size.options].some((option) => option.value === size.value)),
    };
  });
  if (
    appliedPromptOutput.quality !== "medium" ||
    appliedPromptOutput.size !== "9:16" ||
    !appliedPromptOutput.qualityValid ||
    !appliedPromptOutput.sizeValid
  ) {
    throw new Error(`跨输出档位套用提示词没有按当前兼容模式规范下拉值：${JSON.stringify(appliedPromptOutput)}`);
  }

  providerCompatProfiles = [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: false },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ];
  await page.locator("#saveProviderBtn").click();
  await page.waitForFunction(() => document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "参考" }).click({ force: true });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "当前提供方配置不支持图生图。");
  const disabledWorkflowAfterReference = await page.locator(".workflow-tab.active").textContent();
  const disabledSourcePreviewCount = await page.locator(".source-preview-item").count();
  if (disabledWorkflowAfterReference !== "文生图" || disabledSourcePreviewCount !== 0) {
    throw new Error(`不支持图生图时仍然加入了参考图或切换了工作流：workflow=${disabledWorkflowAfterReference || ""}, sources=${disabledSourcePreviewCount}`);
  }
  providerCompatProfiles = [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: true },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ];
  await page.locator("#saveProviderBtn").click();
  await page.waitForFunction(() => !document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));

  const durationNode = page.locator(".running-job-stat-value").filter({ hasText: /分钟\d+秒/ }).first();
  const durationText = await durationNode.textContent();
  if (!durationText || !/\d+分钟\d+秒/.test(durationText)) {
    throw new Error(`运行中耗时没有显示秒：${durationText || ""}`);
  }
  await page.waitForTimeout(1100);
  const nextDurationText = await durationNode.textContent();
  if (nextDurationText === durationText) {
    throw new Error(`运行中耗时没有按秒刷新：${durationText || ""}`);
  }

  await page.locator("#runningBannerToggle").click();
  await page.waitForFunction(() => document.querySelector("#runningBanner")?.classList.contains("is-collapsed"));
  const expanded = await page.locator("#runningBannerToggle").getAttribute("aria-expanded");
  if (expanded !== "false") {
    throw new Error(`顶部运行任务收起状态错误：aria-expanded=${expanded}`);
  }
  await page.locator("#runningBannerToggle").click();
  await page.waitForFunction(() => !document.querySelector("#runningBanner")?.classList.contains("is-collapsed"));

  await page.locator(".running-job-actions button", { hasText: "中断" }).click();
  await page.waitForTimeout(100);
  const runningCountAfterCancel = await page.locator(".running-job-card").count();
  if (runningCountAfterCancel !== 0) {
    throw new Error(`中断点击后运行任务没有立即清空：${runningCountAfterCancel}`);
  }
  const canceledBadge = await page.locator(".left-task-card.is-canceled .left-task-badge").first().textContent();
  if (canceledBadge !== "已中断") {
    throw new Error(`中断点击后未立即进入已中断：${canceledBadge || ""}`);
  }
  await page.waitForTimeout(1400);
  const runningCountAfterSlowCancelResponse = await page.locator(".running-job-card").count();
  if (runningCountAfterSlowCancelResponse !== 0) {
    throw new Error(`中断接口慢返回后运行任务又闪回：${runningCountAfterSlowCancelResponse}`);
  }
  const canceledBadgeAfterSlowCancelResponse = await page.locator(".left-task-card.is-canceled .left-task-badge").first().textContent();
  if (canceledBadgeAfterSlowCancelResponse !== "已中断") {
    throw new Error(`中断接口慢返回后任务状态被覆盖：${canceledBadgeAfterSlowCancelResponse || ""}`);
  }

  providerModels = [
    { id: "image-capable-model", label: "image-capable-model", category: "image" },
    { id: "text-model", label: "text-model", category: "other" },
  ];
  await page.locator("#modelReloadBtn").click();
  await page.waitForSelector("#model option[value='text-model']", { state: "attached" });
  const modelGroupLabels = await page.locator("#model optgroup").evaluateAll((groups) => groups.map((group) => group.label));
  if (modelGroupLabels.join("|") !== "图片模型|其他模型") {
    throw new Error(`模型下拉没有按图片/其他分组：${modelGroupLabels.join("|")}`);
  }
  await page.selectOption("#model", "image-capable-model");
  await page.waitForFunction(() => !document.querySelector("#saveProviderBtn")?.hasAttribute("disabled"));
  await page.locator("#providerProfileSelect").click();
  await page.locator(".provider-profile-delete-btn").click();
  const deleteProfileDescription = await page.locator(".confirm-dialog-description").textContent();
  if (!deleteProfileDescription?.includes("确定删除配置「主配置」吗？删除后需要重新创建提供方配置。")) {
    throw new Error(`删除最后一个 API 配置确认文案未恢复旧版语义：${deleteProfileDescription || ""}`);
  }
  await page.locator(".confirm-dialog-cancel").click();

  jobs = [
    ...jobs,
    {
      id: "job-failed",
      status: "failed",
      workflow: "generate",
      prompt: "失败弹窗任务",
      count: 1,
      message: "本地执行失败",
      error: "auth_required: chat-requirements failed",
      created_at: new Date(now - 90000).toISOString(),
      updated_at: new Date().toISOString(),
      images: [],
    },
  ];
  await page.locator("#settingsToggleBtn").click();
  await page.locator("#refreshGalleryBtn").click();
  await page.waitForFunction(() => document.querySelector("#failurePopup")?.classList.contains("open"));
  const failurePrompt = await page.locator("#failurePopupPrompt").textContent();
  if (failurePrompt !== "失败弹窗任务") {
    throw new Error(`失败弹窗没有显示新增失败任务：${failurePrompt || ""}`);
  }
  const failureContent = await page.locator("#failurePopupContent").textContent();
  if (
    !failureContent?.includes("API上游原因失败") ||
    !failureContent.includes("本地后端：本地执行失败") ||
    !failureContent.includes("API上游：auth_required / chat-requirements failed") ||
    !failureContent.includes("error：auth_required: chat-requirements failed")
  ) {
    throw new Error(`失败弹窗没有显示旧版诊断信息：${failureContent || ""}`);
  }
  await page.locator("#failurePopupRetry").click();
  await page.waitForFunction(() => !document.querySelector("#failurePopup")?.classList.contains("open"));
  await page.waitForTimeout(450);
  const failurePopupOpenAfterRetry = await page.locator("#failurePopup").evaluate((node) => node.classList.contains("open"));
  if (failurePopupOpenAfterRetry) {
    throw new Error("失败弹窗重试后没有清理同一任务的弹窗队列。");
  }

  const leftTaskPrompts = await page.locator(".left-task-card .left-task-prompt").allTextContents();
  if (leftTaskPrompts.includes("只在图库分页中的任务")) {
    throw new Error("只存在于图库分页的任务不应出现在左侧任务列表中。");
  }
  const galleryOnlyDeleteButton = page.locator(".gallery-item[data-job-id='job-gallery-only'][data-image-slot='2'] .meta-actions button").last();
  await galleryOnlyDeleteButton.scrollIntoViewIfNeeded();
  const galleryOnlyDeleteText = await galleryOnlyDeleteButton.textContent();
  if (galleryOnlyDeleteText !== "删除") {
    throw new Error(`仅图库分页图片最后操作应为删除：${galleryOnlyDeleteText || ""}`);
  }
  await galleryOnlyDeleteButton.evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector(".confirm-dialog-action")?.textContent?.trim() === "删除图片");
  const galleryOnlyDeleteDescription = await page.locator(".confirm-dialog-description").textContent();
  if (!galleryOnlyDeleteDescription?.includes("本次任务的其余 2 张图片会保留")) {
    throw new Error(`仅图库分页图片删除确认没有使用完整任务图片数：${galleryOnlyDeleteDescription || ""}`);
  }
  await page.locator(".confirm-dialog-action", { hasText: "删除图片" }).click();
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-gallery-only'][data-image-slot='2']"));
  const galleryOnlyRemainingSlots = await page.locator(".gallery-item[data-job-id='job-gallery-only']").evaluateAll((cards) => (
    cards.map((card) => card.getAttribute("data-image-slot")).sort()
  ));
  if (galleryOnlyRemainingSlots.join(",") !== "1,3") {
    throw new Error(`仅图库分页图片删除后剩余槽位错误：${galleryOnlyRemainingSlots.join(",")}`);
  }

  const completedGalleryDeleteButton = page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button").last();
  const completedGalleryDeleteText = await completedGalleryDeleteButton.textContent();
  if (completedGalleryDeleteText !== "删除") {
    throw new Error(`已完成图库卡片最后操作应为删除：${completedGalleryDeleteText || ""}`);
  }
  await completedGalleryDeleteButton.evaluate((button) => button.click());
  await page.waitForTimeout(100);
  const deleteImageDialogState = await page.evaluate(() => ({
    confirmText: document.querySelector(".confirm-dialog-action")?.textContent?.trim() || "",
    description: document.querySelector(".confirm-dialog-description")?.textContent?.trim() || "",
    status: document.querySelector("#status")?.textContent?.trim() || "",
    dialogCount: document.querySelectorAll(".confirm-dialog-action").length,
    completedCardCount: document.querySelectorAll(".gallery-item[data-job-id='job-completed']").length,
  }));
  if (deleteImageDialogState.confirmText !== "删除图片") {
    throw new Error(`点击已完成图库卡片删除后没有打开删除图片确认：${JSON.stringify(deleteImageDialogState)}`);
  }
  await page.locator(".confirm-dialog-action", { hasText: "删除图片" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".gallery-item[data-job-id='job-completed']").length === 1);

  await page.locator(".task-panel-header").click();
  await page.locator(".left-task-card.is-completed .gallery-del-btn").click();
  await page.locator(".confirm-dialog-action", { hasText: "删除任务" }).click();
  await page.waitForFunction(() => !document.querySelector(".left-task-card.is-completed"));
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-completed']"));

  workspaceStatePayload = {
    active_workflow: "generate",
    forms: {
      generate: { prompt: "", size: "auto", quality: "auto", count: "1" },
      "image-to-image": { prompt: "", size: "auto", quality: "auto", count: "1" },
    },
    prompt_bank: {
      generate: [
        {
          id: "legacy-aspect-pixel-size",
          workflow: "generate",
          prompt: "旧版像素尺寸提示词",
          outputProfileId: "aspect_v1",
          size: "1024x1024",
          quality: "low",
          count: 1,
          createdAt: new Date(now - 120000).toISOString(),
          updatedAt: new Date(now - 120000).toISOString(),
        },
      ],
      "image-to-image": [],
    },
  };
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#galleryWindow");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  const legacyAspectSummary = await page.locator(".prompt-bank-item", { hasText: "旧版像素尺寸提示词" }).locator(".prompt-meta").first().textContent();
  if (!legacyAspectSummary?.includes("尺寸 1:1 方形 · 1024x1024")) {
    throw new Error(`旧版 aspect_v1 像素尺寸摘要没有保留像素值：${legacyAspectSummary || ""}`);
  }

  if (errors.length) {
    throw new Error(`浏览器控制台错误：${errors.join(" | ")}`);
  }
  await browser.close();
}

main().catch(async (error) => {
  console.error(error);
  await browser?.close();
  process.exitCode = 1;
});
