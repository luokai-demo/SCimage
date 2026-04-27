"use strict";

const OUTPUT_OPTIONS = window.OutputOptions;
if (!OUTPUT_OPTIONS) {
  throw new Error("OutputOptions must be loaded before app.js");
}

const WORKFLOW_STATE = window.WorkflowState;
if (!WORKFLOW_STATE) {
  throw new Error("WorkflowState must be loaded before app.js");
}

const GALLERY_RUNTIME = window.GalleryRuntime;
if (!GALLERY_RUNTIME) {
  throw new Error("GalleryRuntime must be loaded before app.js");
}

const LIST_TIMEOUT_MS = 10000;
const ACTION_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 3000;
const RUNNING_STATUSES = new Set(["queued", "running", "canceling"]);
const GALLERY_PLACEHOLDER_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const elements = {
  baseUrl: document.getElementById("baseUrl"),
  apiKey: document.getElementById("apiKey"),
  toggleApiKeyVisibilityBtn: document.getElementById("toggleApiKeyVisibilityBtn"),
  model: document.getElementById("model"),
  providerProfileSelect: document.getElementById("providerProfileSelect"),
  providerProfileName: document.getElementById("providerProfileName"),
  providerCompatProfile: document.getElementById("providerCompatProfile"),
  saveProviderBtn: document.getElementById("saveProviderBtn"),
  saveAsProviderBtn: document.getElementById("saveAsProviderBtn"),
  prompt: document.getElementById("prompt"),
  size: document.getElementById("size"),
  quality: document.getElementById("quality"),
  count: document.getElementById("count"),
  generateBtn: document.getElementById("generateBtn"),
  savePromptBtn: document.getElementById("savePromptBtn"),
  clearPromptBankBtn: document.getElementById("clearPromptBankBtn"),
  status: document.getElementById("status"),
  savedPrompts: document.getElementById("savedPrompts"),
  galleryArea: document.querySelector(".gallery-area"),
  galleryWindowShell: document.getElementById("galleryWindowShell"),
  galleryWindow: document.getElementById("galleryWindow"),
  taskPanelPreview: document.getElementById("taskPanelPreview"),
  galleryGrid: document.getElementById("galleryGrid"),
  galleryEmpty: document.getElementById("galleryEmpty"),
  galleryCount: document.getElementById("galleryCount"),
  sortBtn: document.getElementById("sortBtn"),
  settingsPanel: document.getElementById("settingsPanel"),
  storageMode: document.getElementById("storageMode"),
  storageUsage: document.getElementById("storageUsage"),
  fsDirStatus: document.getElementById("fsDirStatus"),
  taskList: document.getElementById("taskList"),
  taskPanelCount: document.getElementById("taskPanelCount"),
  runningBanner: document.getElementById("runningBanner"),
  runningBannerToggle: document.getElementById("runningBannerToggle"),
  runningBannerSubtitle: document.getElementById("runningBannerSubtitle"),
  runningBannerCount: document.getElementById("runningBannerCount"),
  runningBannerBody: document.getElementById("runningBannerBody"),
  failurePopup: document.getElementById("failurePopup"),
  failurePopupPrompt: document.getElementById("failurePopupPrompt"),
  failurePopupContent: document.getElementById("failurePopupContent"),
  failurePopupRetry: document.getElementById("failurePopupRetry"),
  failurePopupDelete: document.getElementById("failurePopupDelete"),
  failurePopupConfirm: document.getElementById("failurePopupConfirm"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lightboxPrompt: document.getElementById("lightboxPrompt"),
  lightboxCounter: document.getElementById("lightboxCounter"),
  lightboxPrev: document.getElementById("lightboxPrev"),
  lightboxNext: document.getElementById("lightboxNext"),
  lightboxDl: document.getElementById("lightboxDl"),
  lightboxCopy: document.getElementById("lightboxCopy"),
  lightboxAddSource: document.getElementById("lightboxAddSource"),
  lightboxDel: document.getElementById("lightboxDel"),
  lightboxWrap: document.querySelector(".lightbox-wrap"),
  lightboxZoomOut: document.getElementById("lightboxZoomOut"),
  lightboxZoomIn: document.getElementById("lightboxZoomIn"),
  lightboxZoomReset: document.getElementById("lightboxZoomReset"),
  lightboxZoomValue: document.getElementById("lightboxZoomValue"),
  cleanupGeneratedBtn: document.getElementById("cleanupGeneratedBtn"),
};

let jobsState = [];
let providerProfilesState = {
  active_profile_id: null,
  compat_profiles: [],
  profiles: [],
  active_profile: null,
  is_ready: false,
};
let galleryFlatList = [];
let currentGalleryFilter = "all";
let gallerySortAsc = false;
let lightboxIndex = -1;
let lightboxSelection = null;
let lightboxZoomState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
};
let refreshInFlight = null;
let pollTimer = null;
let clockTimer = null;
let resizeTimer = null;
let statusClearTimer = null;
let galleryActivationFrame = null;
const galleryImageMetrics = new Map();
let lastSyncAt = null;
let lastSyncError = "";
let lastJobSnapshotSignature = "";
let lastGallerySnapshotSignature = "";
let providerProfilesInFlight = null;
let cleanupGeneratedInFlight = null;
let createJobInFlight = false;
let isApiKeyVisible = false;
const actionJobIds = new Set();
const seenProblemJobKeys = new Set();
const failurePopupQueue = [];
let activeFailurePopup = null;
let problemPopupReady = false;

const formFieldIds = ["prompt", "size", "quality", "count"];
const LIGHTBOX_ZOOM_MIN = 1;
const LIGHTBOX_ZOOM_MAX = 5;
const LIGHTBOX_ZOOM_STEP = 0.25;
const GALLERY_COLUMN_TARGET_WIDTH = 176;
const GALLERY_COLUMN_MIN = 1;
const GALLERY_COLUMN_MAX = 6;
const GALLERY_GRID_ROW_HEIGHT_PX = 8;
const GALLERY_GRID_GAP_PX = 12;
const GALLERY_PRELOAD_SCREENS = 3;
const GALLERY_PRELOAD_EXTRA_PX = 160;
const GALLERY_VIRTUAL_OVERSCAN_SCREENS = 3;
const GALLERY_VIRTUAL_ESTIMATED_HEIGHT_PX = 310;
const GALLERY_VIRTUAL_MAX_CACHED_ITEMS = 180;
const GALLERY_IMAGE_WARM_CONCURRENCY = 8;
const GALLERY_IMAGE_WARM_MAX_ENTRIES = 220;
const GALLERY_PREVIEW_WARM_CONCURRENCY = 48;
const GALLERY_PREVIEW_WARM_MAX_ENTRIES = 420;

const galleryScrollRoot = new GALLERY_RUNTIME.GalleryScrollRoot({
  root: elements.galleryWindow || elements.galleryArea,
  fallbackRoot: elements.galleryArea || null,
});
const galleryImageLoader = new GALLERY_RUNTIME.GalleryImageLoader({
  scrollRoot: galleryScrollRoot,
  preloadScreens: GALLERY_PRELOAD_SCREENS,
  preloadExtraPx: GALLERY_PRELOAD_EXTRA_PX,
  immediateExtraPx: GALLERY_PRELOAD_EXTRA_PX,
});
const galleryImageWarmCache = new GALLERY_RUNTIME.GalleryImageWarmCache({
  concurrency: GALLERY_IMAGE_WARM_CONCURRENCY,
  maxEntries: GALLERY_IMAGE_WARM_MAX_ENTRIES,
});
const galleryPreviewWarmCache = new GALLERY_RUNTIME.GalleryImageWarmCache({
  concurrency: GALLERY_PREVIEW_WARM_CONCURRENCY,
  maxEntries: GALLERY_PREVIEW_WARM_MAX_ENTRIES,
});
const galleryMasonryLayout = new GALLERY_RUNTIME.GalleryMasonryLayout({
  targetColumnWidth: GALLERY_COLUMN_TARGET_WIDTH,
  minColumns: GALLERY_COLUMN_MIN,
  maxColumns: GALLERY_COLUMN_MAX,
  rowHeightPx: GALLERY_GRID_ROW_HEIGHT_PX,
  gapPx: GALLERY_GRID_GAP_PX,
});

const galleryVirtualMasonry = new GALLERY_RUNTIME.GalleryVirtualMasonry({
  scrollRoot: galleryScrollRoot,
  container: elements.galleryGrid,
  targetColumnWidth: GALLERY_COLUMN_TARGET_WIDTH,
  minColumns: GALLERY_COLUMN_MIN,
  maxColumns: GALLERY_COLUMN_MAX,
  gapPx: GALLERY_GRID_GAP_PX,
  overscanScreens: GALLERY_VIRTUAL_OVERSCAN_SCREENS,
  estimatedHeightPx: GALLERY_VIRTUAL_ESTIMATED_HEIGHT_PX,
  maxCachedItems: GALLERY_VIRTUAL_MAX_CACHED_ITEMS,
  getKey: (entry) => entry.key,
  getItemHeight: (entry, columnWidth, index, layoutContext) => getGalleryEntryHeight(entry, columnWidth, index, layoutContext),
  getItemSpan: (entry, index, columns) => getGalleryEntryColumnSpan(entry, columns),
  renderItem: (entry, openIndex) => buildImageCard(entry.job, entry.image, {
    imageUrl: entry.imageUrl,
    key: entry.key,
    openIndex,
    layoutProfile: entry.layoutProfile,
  }),
  updateItem: (card, entry, openIndex) => syncImageCard(card, entry, openIndex),
  onMount: (card, record) => {
    galleryPreviewWarmCache.warm(record?.item?.previewUrl, { priority: "high" });
    activateGalleryImageCard(card);
  },
  onUnmount: (card) => deactivateGalleryImageCard(card),
});

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function syncApiKeyVisibilityUi() {
  if (!elements.apiKey || !elements.toggleApiKeyVisibilityBtn) {
    return;
  }
  elements.apiKey.type = isApiKeyVisible ? "text" : "password";
  elements.toggleApiKeyVisibilityBtn.classList.toggle("is-active", isApiKeyVisible);
  const label = isApiKeyVisible ? "隐藏 API Key" : "显示 API Key";
  elements.toggleApiKeyVisibilityBtn.setAttribute("aria-label", label);
  elements.toggleApiKeyVisibilityBtn.setAttribute("title", label);
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatElapsed(value) {
  if (!value) {
    return "--";
  }
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) {
    return "--";
  }
  let totalSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}小时${minutes}分钟${seconds}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分钟${seconds}秒`;
  }
  return `${seconds}秒`;
}

function truncateText(value, maxLength = 42) {
  if (!value) {
    return "";
  }
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function normalizeErrorText(value) {
  if (value == null) {
    return "";
  }
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "none" || text.toLowerCase() === "null") {
    return "";
  }
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

function getCompatProfileById(compatProfileId) {
  return providerProfilesState.compat_profiles.find((profile) => profile.id === compatProfileId) || null;
}

function getOutputProfileIdForItem(item) {
  if (item?.output_profile_id) {
    return item.output_profile_id;
  }
  if (item?.outputProfileId) {
    return item.outputProfileId;
  }
  return OUTPUT_OPTIONS.inferOutputProfileId(item?.quality, item?.size, OUTPUT_OPTIONS.getActiveOutputProfileId());
}

function formatQuality(value, outputProfileId = OUTPUT_OPTIONS.getActiveOutputProfileId()) {
  return OUTPUT_OPTIONS.formatQuality(value, outputProfileId);
}

function formatSize(value, quality = OUTPUT_OPTIONS.getDefaultQuality(), outputProfileId = OUTPUT_OPTIONS.getActiveOutputProfileId()) {
  return OUTPUT_OPTIONS.formatSize(value, quality, outputProfileId);
}

function getWorkflowLabel(workflow) {
  return window.WorkspacePanel?.getWorkflowConfig?.(workflow)?.label || (workflow === "image-to-image" ? "图生图" : "文生图");
}

function getWorkflowSourceCount(job) {
  return Array.isArray(job?.source_images) ? job.source_images.length : 0;
}

function getSelectedSourceFiles() {
  return window.WorkspacePanel?.getSourceFiles?.() || [];
}

function getStatusMeta(status) {
  switch (status) {
    case "queued":
      return { label: "排队中", className: "queued" };
    case "running":
      return { label: "生成中", className: "running" };
    case "canceling":
      return { label: "中断中", className: "canceling" };
    case "completed":
      return { label: "已完成", className: "completed" };
    case "partial":
      return { label: "部分完成", className: "partial" };
    case "failed":
      return { label: "失败", className: "failed" };
    case "canceled":
      return { label: "已中断", className: "canceled" };
    default:
      return { label: status || "未知", className: "" };
  }
}

function isActiveStatus(status) {
  return RUNNING_STATUSES.has(status);
}

function getJobById(jobId) {
  return jobsState.find((job) => job.id === jobId) || null;
}

function getJobProgressText(job) {
  const total = Number(job.count || 0);
  const done = Array.isArray(job.images) ? job.images.length : 0;
  return total > 0 ? `${done}/${total}` : `${done}`;
}

function getJobProgressPercent(job) {
  const total = Number(job?.count || 0);
  const done = Array.isArray(job?.images) ? job.images.length : 0;
  if (total <= 0) {
    return done > 0 ? 100 : 0;
  }
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function isRetryableJob(job) {
  return Boolean(job && (job.status === "failed" || job.status === "canceled"));
}

function getJobOptionSummary(job) {
  const outputProfileId = getOutputProfileIdForItem(job);
  const parts = [getWorkflowLabel(job?.workflow)];
  if (job?.workflow === "image-to-image") {
    parts.push(`参考图 ${getWorkflowSourceCount(job)} 张`);
  }
  parts.push(`尺寸 ${formatSize(job.size, job.quality, outputProfileId)}`);
  parts.push(`质量 ${formatQuality(job.quality, outputProfileId)}`);
  parts.push(`数量 ${job.count || 1}`);
  return parts.join(" · ");
}

function getJobMessage(job) {
  if (job && (job.status === "failed" || job.status === "partial")) {
    return formatJobFailureMessage(job);
  }
  const messages = [
    normalizeErrorText(job?.error),
    ...((job?.warnings || []).map(normalizeErrorText).filter(Boolean)),
    normalizeErrorText(job?.message),
  ];
  return messages.find(Boolean) || "等待任务更新。";
}

function extractUpstreamError(rawText) {
  const normalized = rawText.toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("auth_required") || normalized.includes("chat-requirements failed")) {
    return "auth_required / chat-requirements failed";
  }
  if (normalized.includes("未通过权限校验")) {
    return "权限校验失败";
  }
  if (normalized.includes("504 gateway time-out") || normalized.includes("504 gateway timeout") || normalized.includes("gateway request timed out")) {
    return "504 Gateway Timeout";
  }
  if (normalized.includes("图像服务超时") || normalized.includes("长时间没有返回结果")) {
    return "请求超时";
  }
  if (normalized.includes("429") || normalized.includes("too many requests")) {
    return "429 Too Many Requests";
  }
  if (normalized.includes("请求过多")) {
    return "请求过多";
  }
  if (normalized.includes("502") || normalized.includes("bad gateway")) {
    return "502 Bad Gateway";
  }
  if (normalized.includes("503") || normalized.includes("service unavailable") || normalized.includes("temporarily unavailable")) {
    return "503 Service Unavailable";
  }
  if (normalized.includes("暂时不可用")) {
    return "服务暂时不可用";
  }
  if (normalized.includes("non-json") || normalized.includes("<html") || normalized.includes("invalid response")) {
    return "返回了非 JSON / HTML 异常页";
  }
  if (normalized.includes("异常页面")) {
    return "返回了异常页面";
  }
  if (normalized.includes("timed out")) {
    return "请求超时";
  }
  return "";
}

function getProblemDetails(job) {
  const errorText = normalizeErrorText(job?.error);
  const warningTexts = Array.isArray(job?.warnings) ? job.warnings.map(normalizeErrorText).filter(Boolean) : [];
  const rawText = errorText || warningTexts.join("；");
  const upstreamText = extractUpstreamError(rawText);
  const title = upstreamText ? "API上游原因失败" : "本地后端原因失败";
  let localBackendText = normalizeErrorText(job?.message);

  if (!localBackendText) {
    localBackendText = upstreamText ? "生成失败。" : (rawText || "生成失败。");
  }
  if (!upstreamText && !errorText && warningTexts.length) {
    localBackendText = localBackendText || `已生成 ${Array.isArray(job.images) ? job.images.length : 0}/${job.count || 0} 张图片。`;
  }

  return {
    title,
    localBackendText: localBackendText || "生成失败。",
    upstreamText: upstreamText || "未识别到明确上游返回",
    rawText: rawText || normalizeErrorText(job?.message) || "生成失败。",
  };
}

function formatJobFailureMessage(job) {
  const details = getProblemDetails(job);
  return [
    details.title,
    `本地后端：${details.localBackendText}`,
    `API上游：${details.upstreamText}`,
    `error：${details.rawText}`,
  ].join("\n");
}

function isProblemPopupStatus(status) {
  return status === "failed";
}

function getProblemJobKey(job) {
  return `${job.id}:${job.status || ""}:${job.updated_at || ""}`;
}

function syncFailurePopupActions() {
  if (!activeFailurePopup) {
    return;
  }

  const jobId = activeFailurePopup.jobId || "";
  const isBusy = Boolean(jobId && actionJobIds.has(jobId));
  if (elements.failurePopupRetry) {
    elements.failurePopupRetry.style.display = activeFailurePopup.retryable ? "" : "none";
    elements.failurePopupRetry.disabled = activeFailurePopup.retryable ? isBusy : true;
    elements.failurePopupRetry.dataset.jobId = jobId;
  }
  if (elements.failurePopupDelete) {
    elements.failurePopupDelete.style.display = jobId ? "" : "none";
    elements.failurePopupDelete.disabled = !jobId || isBusy;
    elements.failurePopupDelete.dataset.jobId = jobId;
  }
}

function showNextFailurePopup() {
  if (activeFailurePopup || !failurePopupQueue.length || !elements.failurePopup) {
    return;
  }
  activeFailurePopup = failurePopupQueue.shift();
  elements.failurePopupPrompt.textContent = activeFailurePopup.prompt || "未提供提示词";
  elements.failurePopupContent.textContent = activeFailurePopup.message;
  syncFailurePopupActions();
  elements.failurePopup.classList.add("open");
}

function closeFailurePopup() {
  if (!elements.failurePopup) {
    return;
  }
  elements.failurePopup.classList.remove("open");
  activeFailurePopup = null;
  if (failurePopupQueue.length) {
    window.setTimeout(showNextFailurePopup, 120);
  }
}

function clearFailurePopupEntries(jobId) {
  if (!jobId) {
    return;
  }
  for (let index = failurePopupQueue.length - 1; index >= 0; index -= 1) {
    if (failurePopupQueue[index]?.jobId === jobId) {
      failurePopupQueue.splice(index, 1);
    }
  }
  if (activeFailurePopup && activeFailurePopup.jobId === jobId) {
    closeFailurePopup();
  }
}

function syncProblemPopups(jobs) {
  const nextJobs = Array.isArray(jobs) ? jobs : [];
  const problemJobs = nextJobs.filter((job) => isProblemPopupStatus(job.status));

  if (!problemPopupReady) {
    problemJobs.forEach((job) => {
      seenProblemJobKeys.add(getProblemJobKey(job));
    });
    problemPopupReady = true;
    return;
  }

  problemJobs.forEach((job) => {
    const key = getProblemJobKey(job);
    if (seenProblemJobKeys.has(key)) {
      return;
    }
    seenProblemJobKeys.add(key);
    failurePopupQueue.push({
      jobId: job.id,
      prompt: job.prompt,
      message: formatJobFailureMessage(job),
      retryable: isRetryableJob(job),
    });
  });

  showNextFailurePopup();
}

function normalizeImageUrl(url) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url, window.location.origin).toString();
  } catch (error) {
    console.error("Invalid image url:", url, error);
    return "";
  }
}

function getGalleryPreviewUrl(image) {
  return normalizeImageUrl(image?.preview?.url || "");
}

function getImageDimensions(image) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function getImagePlaceholder(image) {
  const color = String(image?.placeholder?.color || "").trim();
  const accentColor = String(image?.placeholder?.accent_color || "").trim();
  if (!GALLERY_PLACEHOLDER_COLOR_PATTERN.test(color)) {
    return null;
  }
  return {
    color,
    accentColor: GALLERY_PLACEHOLDER_COLOR_PATTERN.test(accentColor) ? accentColor : color,
  };
}

function toImageSignature(image) {
  return {
    slot: Number(image.slot || 0),
    name: image.name || "",
    url: image.url || "",
    path: image.path || "",
    width: Number(image.width || 0),
    height: Number(image.height || 0),
    placeholder: {
      color: image.placeholder?.color || "",
      accent_color: image.placeholder?.accent_color || "",
    },
    preview: {
      name: image.preview?.name || "",
      url: image.preview?.url || "",
      path: image.preview?.path || "",
      width: Number(image.preview?.width || 0),
      height: Number(image.preview?.height || 0),
    },
  };
}

function toSortedImageSignatures(images) {
  return Array.isArray(images)
    ? [...images].map((image) => toImageSignature(image)).sort((left, right) => left.slot - right.slot)
    : [];
}

function getJobSnapshotSignature(jobs) {
  const stableJobs = (Array.isArray(jobs) ? jobs : [])
    .map((job) => ({
      id: job.id || "",
      prompt: job.prompt || "",
      count: Number(job.count || 0),
      quality: job.quality || "",
      size: job.size || "",
      workflow: job.workflow || "generate",
      status: job.status || "",
      message: job.message || "",
      created_at: job.created_at || "",
      run_started_at: job.run_started_at || "",
      updated_at: job.updated_at || "",
      error: job.error || "",
      warnings: Array.isArray(job.warnings) ? [...job.warnings] : [],
      source_images: Array.isArray(job.source_images)
        ? [...job.source_images]
            .map((image) => ({
              slot: Number(image.slot || 0),
              name: image.name || "",
              url: image.url || "",
              path: image.path || "",
            }))
            .sort((left, right) => left.slot - right.slot)
        : [],
      images: toSortedImageSignatures(job.images),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify(stableJobs);
}

function getGallerySnapshotSignature(jobs) {
  const stableJobs = (Array.isArray(jobs) ? jobs : [])
    .map((job) => ({
      id: job.id || "",
      prompt: job.prompt || "",
      workflow: job.workflow || "generate",
      created_at: job.created_at || "",
      run_started_at: job.run_started_at || "",
      source_images: Array.isArray(job.source_images)
        ? [...job.source_images]
            .map((image) => ({
              slot: Number(image.slot || 0),
              name: image.name || "",
              url: image.url || "",
              path: image.path || "",
            }))
            .sort((left, right) => left.slot - right.slot)
        : [],
      images: toSortedImageSignatures(job.images),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify({
    filter: currentGalleryFilter,
    sort: gallerySortAsc ? "asc" : "desc",
    jobs: stableJobs,
  });
}

function buildGalleryTerminalAction(job, slot) {
  const normalizedSlot = Number(slot || 0);
  let button;
  if (isActiveStatus(job?.status)) {
    button = createActionButton("中断", "cancel-job", job.id);
    button.setAttribute("aria-label", "中断任务");
    button.setAttribute("title", "中断任务");
  } else {
    button = createActionButton("删除", "delete-image", job.id, "gallery-del-btn");
    button.dataset.slot = String(normalizedSlot);
    button.setAttribute("aria-label", "删除图片");
    button.setAttribute("title", "删除图片");
  }
  button.dataset.galleryTerminal = "true";
  return button;
}

function syncRenderedGalleryCardActions() {
  elements.galleryGrid.querySelectorAll(".gallery-item[data-job-id]").forEach((card) => {
    const jobId = card.dataset.jobId || "";
    const slot = Number(card.dataset.imageSlot || 0);
    const job = getJobById(jobId);
    const actions = card.querySelector(".meta-actions");
    if (!job || !actions) {
      return;
    }
    const nextButton = buildGalleryTerminalAction(job, slot);
    const currentButton = actions.querySelector("[data-gallery-terminal='true']");
    if (!currentButton) {
      actions.appendChild(nextButton);
      return;
    }
    if (currentButton.dataset.action === nextButton.dataset.action && currentButton.disabled === nextButton.disabled) {
      currentButton.disabled = nextButton.disabled;
      return;
    }
    currentButton.replaceWith(nextButton);
  });
}

function setStatus(type, message, options = {}) {
  clearTimeout(statusClearTimer);
  if (!message) {
    elements.status.textContent = "";
    return;
  }

  elements.status.innerHTML = "";

  if (type === "loading") {
    const spinner = createElement("span", "spinner");
    elements.status.appendChild(spinner);
    elements.status.appendChild(document.createTextNode(message));
  } else {
    const label = createElement("span");
    if (type === "error") {
      label.style.color = "var(--danger)";
      label.textContent = `错误：${message}`;
    } else if (type === "success") {
      label.style.color = "var(--success)";
      label.textContent = message;
    } else {
      label.textContent = message;
    }
    elements.status.appendChild(label);
  }

  if (options.timeoutMs) {
    statusClearTimer = window.setTimeout(() => {
      elements.status.textContent = "";
    }, options.timeoutMs);
  }
}

function getActiveWorkflow() {
  return normalizeWorkflow(window.WorkspacePanel?.getActiveWorkflow?.(), WORKFLOW_STATE.readActiveWorkflow());
}

function normalizeWorkflow(value, fallback = WORKFLOW_STATE.DEFAULT_WORKFLOW) {
  return WORKFLOW_STATE.normalizeWorkflow(value, fallback);
}

function isSupportedWorkflow(value) {
  return WORKFLOW_STATE.isSupportedWorkflow(value);
}

function hasRequiredSourcesForWorkflow(workflow) {
  return workflow !== "image-to-image" || getSelectedSourceFiles().length > 0;
}

function syncPrimaryActionState(isBusy = false) {
  const workflow = getActiveWorkflow();
  const config = window.WorkspacePanel?.getWorkflowConfig?.(workflow);
  const isEnabled = Boolean(config?.submitEnabled) && hasRequiredSourcesForWorkflow(workflow);
  const shouldDisable = isBusy || createJobInFlight || !isEnabled;
  elements.generateBtn.disabled = shouldDisable;
  elements.generateBtn.setAttribute("aria-disabled", String(shouldDisable));
}

function handleWorkflowChange(name) {
  const nextWorkflow = normalizeWorkflow(name, "");
  if (!nextWorkflow) {
    return;
  }

  const previousWorkflow = normalizeWorkflow(WORKFLOW_STATE.readActiveWorkflow());
  if (nextWorkflow !== previousWorkflow) {
    saveActiveWorkflowForm(previousWorkflow);
  }
  WORKFLOW_STATE.writeActiveWorkflow(nextWorkflow);
  loadActiveWorkflowForm(nextWorkflow);
  renderSavedPrompts();
  syncPrimaryActionState();
}

function handleSourceFilesChange() {
  syncPrimaryActionState();
}

function populateOutputOptionSelects() {
  if (elements.quality) {
    elements.quality.innerHTML = "";
    OUTPUT_OPTIONS.getQualityOptions().forEach((option) => {
      const node = createElement("option", "", option.label);
      node.value = option.value;
      node.selected = option.value === OUTPUT_OPTIONS.getDefaultQuality();
      elements.quality.appendChild(node);
    });
  }
  syncSizeOptionsForQuality(
    elements.quality?.value || OUTPUT_OPTIONS.getDefaultQuality(),
    elements.size?.value || OUTPUT_OPTIONS.getDefaultSizeOption()
  );
}

function syncSizeOptionsForQuality(quality, preferredSize) {
  if (!elements.size) {
    return;
  }

  const normalizedQuality = OUTPUT_OPTIONS.normalizeQuality(quality, OUTPUT_OPTIONS.getDefaultQuality());
  const nextSize = OUTPUT_OPTIONS.mapSizeToQuality(
    preferredSize,
    normalizedQuality,
    OUTPUT_OPTIONS.defaultSizeForQuality(normalizedQuality)
  );

  elements.size.innerHTML = "";
  OUTPUT_OPTIONS.getSizeOptions(normalizedQuality).forEach((option) => {
    const node = createElement("option", "", option.label);
    node.value = option.value;
    node.selected = option.value === nextSize;
    elements.size.appendChild(node);
  });
  if (!Array.from(elements.size.options).some((option) => option.value === nextSize)) {
    const customNode = createElement("option", "", `自定义像素 · ${nextSize}`);
    customNode.value = nextSize;
    customNode.selected = true;
    elements.size.appendChild(customNode);
  }
  elements.size.value = nextSize;

  if (elements.quality) {
    elements.quality.value = normalizedQuality;
  }
}

function readFormFromUi(workflow = getActiveWorkflow()) {
  const form = {};
  formFieldIds.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      form[fieldId] = field.value;
    }
  });
  return WORKFLOW_STATE.normalizeForm(form, workflow);
}

function applyFormToUi(form, workflow = getActiveWorkflow()) {
  const nextState = WORKFLOW_STATE.normalizeForm(form, workflow);
  if (elements.prompt && nextState.prompt != null) {
    elements.prompt.value = nextState.prompt;
  }
  if (elements.count && nextState.count != null) {
    elements.count.value = nextState.count;
  }
  syncSizeOptionsForQuality(nextState.quality, nextState.size);
}

function saveActiveWorkflowForm(workflow = getActiveWorkflow()) {
  const normalizedWorkflow = normalizeWorkflow(workflow);
  WORKFLOW_STATE.writeForm(normalizedWorkflow, readFormFromUi(normalizedWorkflow));
}

function loadActiveWorkflowForm(workflow = getActiveWorkflow()) {
  const normalizedWorkflow = normalizeWorkflow(workflow);
  applyFormToUi(WORKFLOW_STATE.readForm(normalizedWorkflow), normalizedWorkflow);
}

function readOutputParamsFromUi() {
  const size = elements.size.value;
  const quality = elements.quality.value;

  if (!OUTPUT_OPTIONS.isSupportedSize(size)) {
    alert("请选择有效的尺寸参数");
    elements.size.focus();
    return null;
  }

  if (!OUTPUT_OPTIONS.isSupportedQuality(quality)) {
    alert("请选择有效的质量参数");
    elements.quality.focus();
    return null;
  }

  return {
    size: OUTPUT_OPTIONS.normalizeSizeOption(
      size,
      OUTPUT_OPTIONS.defaultSizeForQuality(quality),
      quality
    ),
    quality: OUTPUT_OPTIONS.normalizeQuality(quality, OUTPUT_OPTIONS.getDefaultQuality()),
  };
}

function renderSavedPrompts() {
  const workflow = normalizeWorkflow(getActiveWorkflow());
  const workflowLabel = getWorkflowLabel(workflow);
  const promptBank = WORKFLOW_STATE.readPromptBank(workflow);
  elements.savedPrompts.innerHTML = "";
  window.WorkspacePanel?.setPromptBankMeta(promptBank.length);

  if (!promptBank.length) {
    elements.savedPrompts.className = "prompt-bank-empty";
    elements.savedPrompts.textContent = `还没有保存的${workflowLabel}提示词`;
    return;
  }

  elements.savedPrompts.className = "prompt-bank-list";

  promptBank.forEach((item) => {
    const card = createElement("div", "prompt-bank-item");
    const promptText = createElement("div", "prompt-text", item.prompt);
    const optionsMeta = createElement("div", "prompt-meta", getJobOptionSummary(item));
    const timeMeta = createElement("div", "prompt-meta", `保存于 ${formatDateTime(item.updatedAt || item.createdAt)}`);
    const actions = createElement("div", "prompt-bank-actions");

    const applyButton = createElement("button", "", "套用");
    applyButton.type = "button";
    applyButton.dataset.promptAction = "apply";
    applyButton.dataset.promptId = item.id;

    const copyButton = createElement("button", "", "复制");
    copyButton.type = "button";
    copyButton.dataset.promptAction = "copy";
    copyButton.dataset.promptId = item.id;

    const deleteButton = createElement("button", "gallery-del-btn", "删除");
    deleteButton.type = "button";
    deleteButton.dataset.promptAction = "delete";
    deleteButton.dataset.promptId = item.id;

    actions.append(applyButton, copyButton, deleteButton);
    card.append(promptText, optionsMeta, timeMeta, actions);
    elements.savedPrompts.appendChild(card);
  });
}

async function copyToClipboard(text, trigger, successLabel, restoreLabel) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    if (trigger) {
      const originalText = restoreLabel || trigger.textContent;
      trigger.textContent = successLabel;
      window.setTimeout(() => {
        trigger.textContent = originalText;
      }, 1500);
    }
  } catch (error) {
    console.error("Copy failed:", error);
    setStatus("error", "无法复制到剪贴板。", { timeoutMs: 2500 });
  }
}

function saveCurrentPrompt() {
  const workflow = normalizeWorkflow(getActiveWorkflow());
  const form = readFormFromUi();
  const prompt = form.prompt.trim();
  if (!prompt) {
    alert("请先输入提示词");
    elements.prompt.focus();
    return;
  }

  const outputParams = readOutputParamsFromUi();
  if (!outputParams) {
    return;
  }

  const nextEntry = WORKFLOW_STATE.savePrompt(workflow, {
    workflow,
    prompt,
    outputProfileId: OUTPUT_OPTIONS.getActiveOutputProfileId(),
    size: outputParams.size,
    quality: outputParams.quality,
    count: Number.parseInt(form.count, 10) || 1,
  });
  if (!nextEntry) {
    return;
  }

  saveActiveWorkflowForm(workflow);
  renderSavedPrompts();
  window.WorkspacePanel?.openPromptBank(true);
  setStatus("success", `已保存到${getWorkflowLabel(workflow)}词库。`, { timeoutMs: 2200 });
}

function clearSavedPrompts() {
  const workflow = normalizeWorkflow(getActiveWorkflow());
  if (!WORKFLOW_STATE.readPromptBank(workflow).length) {
    return;
  }
  if (!window.confirm(`确定清空${getWorkflowLabel(workflow)}已保存提示词？`)) {
    return;
  }
  WORKFLOW_STATE.clearPromptBank(workflow);
  renderSavedPrompts();
  setStatus("success", "提示词库已清空。", { timeoutMs: 2200 });
}

function applySavedPrompt(promptId) {
  const workflow = normalizeWorkflow(getActiveWorkflow());
  const entry = WORKFLOW_STATE.findPrompt(workflow, promptId);
  if (!entry) {
    return;
  }
  applyFormToUi({
    prompt: entry.prompt,
    size: entry.size,
    quality: entry.quality,
    count: String(entry.count || 1),
  }, workflow);
  saveActiveWorkflowForm(workflow);
  setStatus("success", "提示词已载入。", { timeoutMs: 2200 });
}

function deleteSavedPrompt(promptId) {
  const workflow = normalizeWorkflow(getActiveWorkflow());
  WORKFLOW_STATE.deletePrompt(workflow, promptId);
  renderSavedPrompts();
}

function getProviderModelPicker() {
  return window.ProviderModelPicker || null;
}

function getProviderProfilePicker() {
  return window.ProviderProfilePicker || null;
}

function getSelectedProviderProfile() {
  const activeProfileId = elements.providerProfileSelect?.value || providerProfilesState.active_profile_id;
  return providerProfilesState.profiles.find((profile) => profile.id === activeProfileId) || null;
}

function getProviderModelSourceProfileId() {
  const selectedProfile = getSelectedProviderProfile();
  return selectedProfile?.id || providerProfilesState.active_profile_id || "";
}

function syncProviderProfileActionState() {
  const picker = getProviderModelPicker();
  const profilePicker = getProviderProfilePicker();
  const pickerReady = picker ? picker.canSave() : Boolean(elements.model?.value.trim());
  const pickerBlockReason = picker ? picker.getSaveBlockMessage() : "";
  const selectedProfile = getSelectedProviderProfile();
  const isBusy = Boolean(providerProfilesInFlight);

  profilePicker?.setDisabled(isBusy || !providerProfilesState.profiles.length);

  if (elements.saveProviderBtn) {
    const shouldDisable = isBusy || !selectedProfile || !pickerReady;
    elements.saveProviderBtn.disabled = shouldDisable;
    elements.saveProviderBtn.title = shouldDisable
      ? (!selectedProfile ? "请先使用“另存为新配置”创建第一套配置。" : pickerBlockReason)
      : "";
  }

  if (elements.saveAsProviderBtn) {
    const shouldDisable = isBusy || !pickerReady;
    elements.saveAsProviderBtn.disabled = shouldDisable;
    elements.saveAsProviderBtn.title = shouldDisable ? pickerBlockReason : "";
  }
}

function applyProviderCompatibilityUi(compatProfileId) {
  const compatProfile = getCompatProfileById(compatProfileId);
  OUTPUT_OPTIONS.setActiveOutputProfile(compatProfile?.output_profile_id || OUTPUT_OPTIONS.DEFAULT_OUTPUT_PROFILE_ID);
  window.WorkspacePanel?.setWorkflowAvailability?.({
    generate: true,
    "image-to-image": compatProfile ? compatProfile.supports_image_to_image : true,
  });
  populateOutputOptionSelects();
  loadActiveWorkflowForm(getActiveWorkflow());
  renderSavedPrompts();
  syncPrimaryActionState();
}

function renderProviderProfiles() {
  if (!elements.providerProfileSelect) {
    return;
  }

  window.WorkspacePanel?.syncProviderConfig(providerProfilesState.profiles.length > 0);
  const profilePicker = getProviderProfilePicker();
  if (profilePicker) {
    profilePicker.render({
      profiles: providerProfilesState.profiles,
      activeProfileId: providerProfilesState.active_profile_id,
      disabled: Boolean(providerProfilesInFlight) || !providerProfilesState.profiles.length,
    });
  } else {
    elements.providerProfileSelect.value = providerProfilesState.active_profile_id || "";
    elements.providerProfileSelect.textContent = providerProfilesState.active_profile?.name || "未保存任何配置";
  }

  if (elements.providerCompatProfile) {
    elements.providerCompatProfile.innerHTML = "";
    providerProfilesState.compat_profiles.forEach((compatProfile) => {
      const option = createElement("option", "", compatProfile.label);
      option.value = compatProfile.id;
      elements.providerCompatProfile.appendChild(option);
    });
  }

  const activeProfile = providerProfilesState.active_profile;
  if (!activeProfile) {
    elements.providerProfileName.value = "";
    elements.baseUrl.value = "";
    if (elements.providerCompatProfile) {
      elements.providerCompatProfile.value = "";
    }
    elements.apiKey.value = "";
    elements.apiKey.placeholder = "输入 API Key";
    getProviderModelPicker()?.reset();
    applyProviderCompatibilityUi(null);
    syncProviderProfileActionState();
    return;
  }

  elements.providerProfileName.value = activeProfile.name || "";
  elements.baseUrl.value = activeProfile.base_url || "";
  if (elements.providerCompatProfile) {
    elements.providerCompatProfile.value = activeProfile.compat_profile_id || "";
  }
  elements.apiKey.value = activeProfile.api_key || "";
  elements.apiKey.placeholder = activeProfile.has_api_key && activeProfile.api_key_hint
    ? `已保存：${activeProfile.api_key_hint}`
    : "输入 API Key";
  getProviderModelPicker()?.applyProfile(activeProfile);
  applyProviderCompatibilityUi(activeProfile.compat_profile_id);
  syncProviderProfileActionState();
}

async function loadProviderProfiles(options = {}) {
  try {
    const payload = await apiRequest("/api/provider-profiles", {
      method: "GET",
      timeoutMs: LIST_TIMEOUT_MS,
    });
    providerProfilesState = {
      active_profile_id: payload.active_profile_id || null,
      compat_profiles: Array.isArray(payload.compat_profiles) ? payload.compat_profiles : [],
      profiles: Array.isArray(payload.profiles) ? payload.profiles : [],
      active_profile: payload.active_profile || null,
      is_ready: Boolean(payload.is_ready),
    };
    renderProviderProfiles();
    updateSyncIndicators();
    if (options.showStatus) {
      setStatus("success", "配置列表已刷新。", { timeoutMs: 1800 });
    }
  } catch (error) {
    console.error("Load provider profiles failed:", error);
    if (!options.silent) {
      setStatus("error", error.message);
    }
  }
}

async function activateProviderProfile(profileId) {
  if (!profileId) {
    return;
  }
  try {
    const payload = await apiRequest(`/api/provider-profiles/${profileId}/activate`, {
      method: "POST",
      timeoutMs: ACTION_TIMEOUT_MS,
    });
    providerProfilesState = {
      active_profile_id: payload.active_profile_id || null,
      compat_profiles: Array.isArray(payload.compat_profiles) ? payload.compat_profiles : [],
      profiles: Array.isArray(payload.profiles) ? payload.profiles : [],
      active_profile: payload.active_profile || null,
      is_ready: Boolean(payload.is_ready),
    };
    renderProviderProfiles();
    updateSyncIndicators();
    setStatus("success", "已切换当前配置。", { timeoutMs: 1800 });
  } catch (error) {
    console.error("Activate provider profile failed:", error);
    setStatus("error", error.message);
    renderProviderProfiles();
  }
}

function collectProviderProfileForm() {
  const modelValue = getProviderModelPicker()?.getSelectedModel() || elements.model.value.trim();
  return {
    name: elements.providerProfileName.value.trim(),
    base_url: elements.baseUrl.value.trim(),
    model: modelValue,
    compat_profile_id: elements.providerCompatProfile?.value || "",
    api_key: elements.apiKey.value.trim(),
  };
}

async function saveProviderProfile() {
  if (providerProfilesInFlight) {
    return providerProfilesInFlight;
  }

  const selectedProfile = getSelectedProviderProfile();
  const payload = collectProviderProfileForm();
  const providerModelPicker = getProviderModelPicker();
  if (!selectedProfile) {
    setStatus("error", "请先使用“另存为新配置”创建第一套配置。");
    return;
  }
  if (providerModelPicker && !providerModelPicker.canSave()) {
    setStatus("error", providerModelPicker.getSaveBlockMessage());
    return;
  }

  if (!payload.name) {
    payload.name = selectedProfile.name;
  }

  if (!payload.api_key) {
    delete payload.api_key;
  }

  providerProfilesInFlight = (async () => {
    try {
      const nextState = await apiRequest(`/api/provider-profiles/${selectedProfile.id}`, {
        method: "PUT",
        body: payload,
        timeoutMs: ACTION_TIMEOUT_MS,
      });
      providerProfilesState = {
        active_profile_id: nextState.active_profile_id || null,
        compat_profiles: Array.isArray(nextState.compat_profiles) ? nextState.compat_profiles : [],
        profiles: Array.isArray(nextState.profiles) ? nextState.profiles : [],
        active_profile: nextState.active_profile || null,
        is_ready: Boolean(nextState.is_ready),
      };
      renderProviderProfiles();
      updateSyncIndicators();
      setStatus("success", "当前配置已保存。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Save provider profile failed:", error);
      setStatus("error", error.message);
    } finally {
      providerProfilesInFlight = null;
      syncProviderProfileActionState();
    }
  })();
  syncProviderProfileActionState();

  return providerProfilesInFlight;
}

async function saveAsProviderProfile() {
  if (providerProfilesInFlight) {
    return providerProfilesInFlight;
  }

  const payload = collectProviderProfileForm();
  const providerModelPicker = getProviderModelPicker();
  if (providerModelPicker && !providerModelPicker.canSave()) {
    setStatus("error", providerModelPicker.getSaveBlockMessage());
    return;
  }
  const selectedProfile = getSelectedProviderProfile();
  if (!payload.api_key && selectedProfile) {
    payload.source_profile_id = selectedProfile.id;
  }
  providerProfilesInFlight = (async () => {
    try {
      const nextState = await apiRequest("/api/provider-profiles", {
        method: "POST",
        body: payload,
        timeoutMs: ACTION_TIMEOUT_MS,
      });
      providerProfilesState = {
        active_profile_id: nextState.active_profile_id || null,
        compat_profiles: Array.isArray(nextState.compat_profiles) ? nextState.compat_profiles : [],
        profiles: Array.isArray(nextState.profiles) ? nextState.profiles : [],
        active_profile: nextState.active_profile || null,
        is_ready: Boolean(nextState.is_ready),
      };
      renderProviderProfiles();
      updateSyncIndicators();
      setStatus("success", "新配置已保存，并已切换为当前配置。", { timeoutMs: 2400 });
    } catch (error) {
      console.error("Create provider profile failed:", error);
      setStatus("error", error.message);
    } finally {
      providerProfilesInFlight = null;
      syncProviderProfileActionState();
    }
  })();
  syncProviderProfileActionState();

  return providerProfilesInFlight;
}

async function deleteProviderProfile(profileId) {
  if (providerProfilesInFlight) {
    return providerProfilesInFlight;
  }

  const targetProfile = providerProfilesState.profiles.find((profile) => profile.id === profileId) || null;
  if (!targetProfile) {
    setStatus("error", "要删除的配置不存在。", { timeoutMs: 2200 });
    return null;
  }

  const isLastProfile = providerProfilesState.profiles.length === 1;
  const isActiveProfile = targetProfile.id === providerProfilesState.active_profile_id;
  let message = `确定删除配置「${targetProfile.name}」吗？`;
  if (isLastProfile) {
    message = `确定删除配置「${targetProfile.name}」吗？删除后需要重新创建提供方配置。`;
  } else if (isActiveProfile) {
    message = `确定删除当前配置「${targetProfile.name}」吗？删除后会自动切换到其他已保存配置。`;
  }

  if (!window.confirm(message)) {
    return null;
  }

  providerProfilesInFlight = (async () => {
    try {
      const nextState = await apiRequest(`/api/provider-profiles/${targetProfile.id}`, {
        method: "DELETE",
        timeoutMs: ACTION_TIMEOUT_MS,
      });
      providerProfilesState = {
        active_profile_id: nextState.active_profile_id || null,
        compat_profiles: Array.isArray(nextState.compat_profiles) ? nextState.compat_profiles : [],
        profiles: Array.isArray(nextState.profiles) ? nextState.profiles : [],
        active_profile: nextState.active_profile || null,
        is_ready: Boolean(nextState.is_ready),
      };
      renderProviderProfiles();
      updateSyncIndicators();
      setStatus("success", "配置已删除。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Delete provider profile failed:", error);
      setStatus("error", error.message);
    } finally {
      providerProfilesInFlight = null;
      syncProviderProfileActionState();
    }
  })();
  syncProviderProfileActionState();

  return providerProfilesInFlight;
}

async function cleanupEmptyGeneratedDirs() {
  if (cleanupGeneratedInFlight) {
    return cleanupGeneratedInFlight;
  }

  elements.cleanupGeneratedBtn.disabled = true;
  cleanupGeneratedInFlight = (async () => {
    try {
      const payload = await apiRequest("/api/maintenance/generated/cleanup-empty-dirs", {
        method: "POST",
        timeoutMs: ACTION_TIMEOUT_MS,
      });
      const removedCount = Number(payload.removed_count || 0);
      setStatus(
        "success",
        removedCount ? `已清理 ${removedCount} 个空文件夹。` : "没有需要清理的空文件夹。",
        { timeoutMs: 2200 }
      );
    } catch (error) {
      console.error("Cleanup empty generated dirs failed:", error);
      setStatus("error", error.message);
    } finally {
      elements.cleanupGeneratedBtn.disabled = false;
      cleanupGeneratedInFlight = null;
    }
  })();

  return cleanupGeneratedInFlight;
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || ACTION_TIMEOUT_MS;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const hasJsonBody = options.body && !(options.body instanceof FormData);

  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: hasJsonBody ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? (hasJsonBody ? JSON.stringify(options.body) : options.body) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    let payload = null;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = { error: text.trim() };
    }

    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("本地服务响应超时，请确认服务仍在运行。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getFilteredJobs() {
  const sortedJobs = jobsState
    .filter((job) => Array.isArray(job.images) && job.images.length > 0)
    .sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return gallerySortAsc ? leftTime - rightTime : rightTime - leftTime;
    });
  return sortedJobs;
}

function getJobDurationText(job) {
  const runStartedAt = job?.run_started_at || job?.created_at;
  if (!runStartedAt) {
    return "--";
  }
  if (isActiveStatus(job.status)) {
    return formatElapsed(runStartedAt);
  }
  if (job.updated_at) {
    const startedAt = new Date(runStartedAt);
    const finishedAt = new Date(job.updated_at);
    if (!Number.isNaN(startedAt.getTime()) && !Number.isNaN(finishedAt.getTime())) {
      const seconds = Math.max(0, Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000));
      if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}小时${minutes}分钟`;
      }
      if (seconds >= 60) {
        return `${Math.floor(seconds / 60)}分钟${seconds % 60}秒`;
      }
      return `${seconds}秒`;
    }
  }
  return formatDateTime(job.updated_at || job.created_at);
}

function createJobDurationNode(job, options = {}) {
  const prefix = options.prefix || "";
  const node = createElement("span", "", `${prefix}${getJobDurationText(job)}`);
  const runStartedAt = job?.run_started_at || job?.created_at;
  if (isActiveStatus(job?.status) && runStartedAt) {
    node.dataset.elapsedFrom = runStartedAt;
    if (prefix) {
      node.dataset.elapsedPrefix = prefix;
    }
  } else {
    node.dataset.elapsedLive = "false";
  }
  return node;
}

function getSizeHeightRatio(size) {
  const normalized = OUTPUT_OPTIONS.normalizeSizeOption(size);
  const [widthRatio, heightRatio] = normalized.split(":").map((value) => Number(value));
  if (!widthRatio || !heightRatio) {
    return 16 / 9;
  }
  return heightRatio / widthRatio;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getGalleryNaturalHeightRatio(entry) {
  const dimensions = getImageDimensions(entry.image);
  return dimensions
    ? dimensions.height / dimensions.width
    : getSizeHeightRatio(entry.job?.size);
}

function getGalleryImageShape(heightRatio) {
  if (heightRatio <= 0.64) {
    return "panorama";
  }
  if (heightRatio <= 0.9) {
    return "landscape";
  }
  if (heightRatio <= 1.18) {
    return "square";
  }
  if (heightRatio <= 1.72) {
    return "portrait";
  }
  return "tallPortrait";
}

function getGalleryFeaturedScore(entry, index, total) {
  if (index < 2 || total < 12) {
    return 0;
  }
  const heightRatio = getGalleryNaturalHeightRatio(entry);
  const shape = getGalleryImageShape(heightRatio);
  const seed = hashString(`${entry.key}:${index}`);
  const rhythmBoost = 12 - Math.abs((index % 12) - 5);
  const freshnessBoost = Math.max(0, 8 - Math.floor(index / 14));
  const shapeScore = {
    panorama: 98,
    landscape: 92,
    square: 66,
    portrait: 54,
    tallPortrait: 0,
  }[shape];
  return shapeScore + rhythmBoost + freshnessBoost + (seed % 11);
}

function selectGalleryFeaturedIndexes(entries, options = {}) {
  if (options.allowFeatured === false || entries.length < 12) {
    return new Set();
  }
  const maxFeatured = clampNumber(Math.floor(entries.length / 11), 1, 7);
  const minGap = entries.length >= 36 ? 6 : 7;
  const candidates = entries
    .map((entry, index) => ({ entry, index, score: getGalleryFeaturedScore(entry, index, entries.length) }))
    .filter((candidate) => candidate.score >= 72)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = [];
  const selectedJobIds = new Set();
  [true, false].forEach((preferNewJob) => {
    candidates.forEach((candidate) => {
      if (selected.length >= maxFeatured || selected.includes(candidate.index)) {
        return;
      }
      const jobId = candidate.entry.job?.id || "";
      if (preferNewJob && jobId && selectedJobIds.has(jobId)) {
        return;
      }
      if (selected.some((index) => Math.abs(index - candidate.index) < minGap)) {
        return;
      }
      selected.push(candidate.index);
      if (jobId) {
        selectedJobIds.add(jobId);
      }
    });
  });
  return new Set(selected);
}

function createGalleryLayoutProfile(entry, index, options = {}) {
  const baseHeightRatio = getGalleryNaturalHeightRatio(entry);
  const shape = getGalleryImageShape(baseHeightRatio);
  const seed = hashString(`${entry.key}:${index}`);
  const isFeatured = options.featuredIndexes?.has(index) || false;
  let variant = "balanced";
  const span = isFeatured ? 2 : 1;
  let heightRatio = baseHeightRatio;

  if (isFeatured) {
    variant = "featured";
    if (shape === "panorama") {
      heightRatio = clampNumber(baseHeightRatio * 1.12, 0.48, 0.72);
    } else if (shape === "landscape") {
      heightRatio = clampNumber(baseHeightRatio * 1.02, 0.62, 0.92);
    } else {
      heightRatio = clampNumber(baseHeightRatio * 0.86, 0.76, 1.02);
    }
  } else if (shape === "tallPortrait") {
    if (seed % 6 === 0) {
      variant = "lifted";
      heightRatio = clampNumber(baseHeightRatio * 0.76, 1.16, 1.48);
    } else {
      variant = "tall";
      heightRatio = clampNumber(baseHeightRatio * 0.88, 1.32, 1.82);
    }
  } else if (shape === "portrait") {
    if (seed % 7 === 0) {
      variant = "compact";
      heightRatio = clampNumber(baseHeightRatio * 0.72, 0.96, 1.22);
    } else if (seed % 4 === 0) {
      variant = "lifted";
      heightRatio = clampNumber(baseHeightRatio * 0.88, 1.04, 1.38);
    } else {
      variant = "tall";
      heightRatio = clampNumber(baseHeightRatio * 1.0, 1.12, 1.58);
    }
  } else if (shape === "panorama") {
    variant = "compact";
    heightRatio = clampNumber(baseHeightRatio * 1.16, 0.5, 0.78);
  } else if (shape === "landscape") {
    variant = seed % 3 === 0 ? "lifted" : "compact";
    heightRatio = clampNumber(baseHeightRatio * (seed % 3 === 0 ? 1.08 : 0.96), 0.62, 1.02);
  } else if (seed % 5 === 0) {
    variant = "compact";
    heightRatio = clampNumber(baseHeightRatio * 0.92, 0.82, 1.12);
  } else if (seed % 3 === 0) {
    variant = "lifted";
    heightRatio = clampNumber(baseHeightRatio * 1.06, 0.9, 1.28);
  } else {
    heightRatio = clampNumber(baseHeightRatio, 0.86, 1.24);
  }

  return {
    span,
    variant,
    shape,
    heightRatio,
    aspectRatio: `1 / ${heightRatio.toFixed(4)}`,
  };
}

function assignGalleryLayoutProfiles(entries, options = {}) {
  const featuredIndexes = selectGalleryFeaturedIndexes(entries, options);
  entries.forEach((entry, index) => {
    entry.layoutProfile = createGalleryLayoutProfile(entry, index, {
      ...options,
      featuredIndexes,
    });
  });
  return entries;
}

function createActionButton(label, action, jobId, extraClassName = "") {
  const button = createElement("button", extraClassName, label);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.jobId = jobId;
  button.disabled = actionJobIds.has(jobId);
  return button;
}

function createGalleryTimeNode(value) {
  const formatted = formatDateTime(value);
  const timeNode = createElement("span", "time");
  timeNode.setAttribute("aria-label", `生成时间 ${formatted}`);
  const [datePart, clockPart] = formatted.split(/\s+/, 2);
  if (!datePart || !clockPart) {
    timeNode.textContent = formatted;
    return timeNode;
  }
  timeNode.append(
    createElement("span", "time-date", datePart),
    createElement("span", "time-clock", clockPart)
  );
  return timeNode;
}

function handleGalleryImageLoaded(card, imageNode) {
  if (!card || !imageNode) {
    return;
  }
  rememberGalleryImageMetrics(card, imageNode);
  galleryImageWarmCache.markLoaded(imageNode.dataset.src || imageNode.currentSrc || imageNode.src, imageNode);
  card.classList.remove("is-loading", "is-error");
  card.classList.add("is-loaded");
  imageNode.style.removeProperty("min-height");
  imageNode.dataset.loadingState = "loaded";
  imageNode.classList.add("is-loaded");
  scheduleActiveGalleryLayout();
}

function handleGalleryImageError(card, imageNode) {
  card.classList.remove("is-loading");
  card.classList.add("is-error");
  imageNode.style.removeProperty("min-height");
  imageNode.dataset.loadingState = "error";
  scheduleActiveGalleryLayout();
}

function activateGalleryImageCard(card) {
  if (!card) {
    return;
  }
  galleryImageLoader.register(card);
}

function deactivateGalleryImageCard(card) {
  galleryImageLoader.unregister?.(card);
}

function isVirtualGalleryActive() {
  return currentGalleryFilter === "all";
}

function scheduleActiveGalleryLayout() {
  if (isVirtualGalleryActive()) {
    galleryVirtualMasonry.scheduleRefresh();
    return;
  }
  galleryMasonryLayout.scheduleRefresh(elements.galleryArea);
}

function refreshGalleryViewportEffects(options = {}) {
  const { refreshLayout = false, refreshLoader = false } = options;
  if (refreshLayout) {
    scheduleActiveGalleryLayout();
  }
  window.requestAnimationFrame(() => {
    if (refreshLoader) {
      galleryImageLoader.refresh();
    }
  });
}

function scheduleGalleryLayout() {
  scheduleActiveGalleryLayout();
  window.requestAnimationFrame(() => {
    scheduleGalleryCardActivation();
  });
}

function scheduleGalleryCardActivation() {
  if (galleryActivationFrame) {
    window.cancelAnimationFrame(galleryActivationFrame);
  }
  galleryActivationFrame = window.requestAnimationFrame(() => {
    galleryActivationFrame = null;
    elements.galleryGrid.querySelectorAll(".gallery-item").forEach((card) => activateGalleryImageCard(card));
    galleryImageLoader.refresh();
  });
}

function getSortedJobImages(job) {
  return [...(job.images || [])].sort((left, right) => (left.slot || 0) - (right.slot || 0));
}

function createGalleryFlatItem(job, image, imageUrl, previewUrl = "") {
  return {
    src: imageUrl,
    previewSrc: previewUrl,
    prompt: job.prompt,
    filename: image.name || `image-${image.slot || 1}.png`,
    jobId: job.id,
    slot: image.slot || 0,
  };
}

function getGalleryImageKey(job, image, imageUrl) {
  if (!imageUrl) {
    return "";
  }
  return `${job.id || ""}:${image.slot || 0}:${imageUrl}`;
}

function rememberGalleryImageMetrics(card, imageNode) {
  const key = card?.dataset.galleryImageKey || "";
  if (!key || !imageNode?.naturalWidth || !imageNode?.naturalHeight) {
    return;
  }
  galleryImageMetrics.set(key, {
    width: imageNode.naturalWidth,
    height: imageNode.naturalHeight,
  });
}

function getGalleryEntryHeight(entry, columnWidth, index, layoutContext = {}) {
  const metrics = galleryImageMetrics.get(entry.key);
  const dimensions = getImageDimensions(entry.image);
  const naturalHeightRatio = metrics?.width && metrics?.height
    ? metrics.height / metrics.width
    : dimensions
      ? dimensions.height / dimensions.width
      : getSizeHeightRatio(entry.job?.size);
  const heightRatio = entry.layoutProfile?.heightRatio || naturalHeightRatio;
  const span = Number(layoutContext.span || entry.layoutProfile?.span || 1);
  const minHeight = span > 1 ? Math.max(176, columnWidth * 0.42) : 124;
  const maxHeight = span > 1 ? Math.min(460, columnWidth * 1.04) : 390;
  return Math.round(clampNumber(columnWidth * heightRatio, minHeight, maxHeight));
}

function getGalleryEntryColumnSpan(entry, columns) {
  const span = Number(entry.layoutProfile?.span || 1);
  return columns >= 4 ? span : 1;
}

function createGalleryImageEntry(job, image) {
  const imageUrl = normalizeImageUrl(image.url);
  if (!imageUrl) {
    return null;
  }
  const previewUrl = getGalleryPreviewUrl(image);
  return {
    key: getGalleryImageKey(job, image, imageUrl),
    job,
    image,
    imageUrl,
    previewUrl,
    flatItem: createGalleryFlatItem(job, image, imageUrl, previewUrl),
  };
}

function collectReusableGalleryCards() {
  const cards = new Map();
  elements.galleryGrid.querySelectorAll(".gallery-item[data-gallery-image-key]").forEach((card) => {
    const key = card.dataset.galleryImageKey || "";
    if (key && !cards.has(key)) {
      cards.set(key, card);
    }
  });
  return cards;
}

function applyGalleryImageDimensions(imageNode, image) {
  const dimensions = getImageDimensions(image);
  if (!imageNode || !dimensions) {
    return false;
  }
  imageNode.width = dimensions.width;
  imageNode.height = dimensions.height;
  return true;
}

function applyGalleryCardProfile(card, profile) {
  if (!card || !profile) {
    return;
  }
  card.classList.remove("is-featured", "is-tall", "is-compact", "is-lifted", "is-balanced");
  card.classList.remove("shape-panorama", "shape-landscape", "shape-square", "shape-portrait", "shape-tallPortrait");
  card.classList.add("has-masonry-profile", `is-${profile.variant}`);
  card.classList.add(`shape-${profile.shape}`);
  card.style.setProperty("--gallery-card-aspect-ratio", profile.aspectRatio);
}

function applyGalleryPlaceholder(card, image) {
  if (!card) {
    return;
  }
  const placeholder = getImagePlaceholder(image);
  if (!placeholder) {
    card.style.removeProperty("--gallery-placeholder-color");
    card.style.removeProperty("--gallery-placeholder-accent");
    return;
  }
  card.style.setProperty("--gallery-placeholder-color", placeholder.color);
  card.style.setProperty("--gallery-placeholder-accent", placeholder.accentColor);
}

function setGalleryPreviewImageSource(previewNode, previewUrl) {
  previewNode.classList.remove("is-error");
  previewNode.src = previewUrl;
  previewNode.addEventListener("load", () => galleryPreviewWarmCache.markLoaded(previewUrl, previewNode), { once: true });
  previewNode.addEventListener("error", () => previewNode.classList.add("is-error"), { once: true });
  previewNode.dataset.previewSrc = previewUrl;
  previewNode.fetchPriority = galleryPreviewWarmCache.isReady(previewUrl) ? "auto" : "high";
}

function createGalleryPreviewImage(previewUrl, job) {
  const previewNode = new Image();
  previewNode.className = "gallery-preview";
  previewNode.decoding = "async";
  previewNode.loading = "eager";
  previewNode.alt = "";
  previewNode.setAttribute("aria-hidden", "true");
  setGalleryPreviewImageSource(previewNode, previewUrl);
  if (job?.prompt) {
    previewNode.title = job.prompt;
  }
  return previewNode;
}

function syncGalleryPreviewImage(card, entry) {
  const previewUrl = entry.previewUrl || "";
  let previewNode = card.querySelector(".gallery-preview");
  card.classList.toggle("has-preview", Boolean(previewUrl));
  if (!previewUrl) {
    previewNode?.remove();
    return;
  }
  if (!previewNode) {
    previewNode = createGalleryPreviewImage(previewUrl, entry.job);
    const fullImageNode = card.querySelector("img[data-src]");
    card.insertBefore(previewNode, fullImageNode || card.firstChild);
    return;
  }
  if (previewNode.dataset.previewSrc !== previewUrl) {
    setGalleryPreviewImageSource(previewNode, previewUrl);
  }
}

function syncImageCard(card, entry, openIndex) {
  card.dataset.galleryImageKey = entry.key;
  card.dataset.openLightbox = String(openIndex);
  card.dataset.jobId = entry.job.id || "";
  card.dataset.imageSlot = String(entry.image.slot || 0);
  card.setAttribute("aria-label", entry.job.prompt || "生成图片");
  applyGalleryCardProfile(card, entry.layoutProfile);
  applyGalleryPlaceholder(card, entry.image);
  syncGalleryPreviewImage(card, entry);

  const imageNode = card.querySelector("img[data-src]");
  if (imageNode) {
    imageNode.alt = entry.job.prompt || "";
    const hasDimensions = applyGalleryImageDimensions(imageNode, entry.image);
    if (hasDimensions) {
      imageNode.style.removeProperty("min-height");
    }
    if (imageNode.dataset.loadingState === "idle" && galleryImageWarmCache.isReady(entry.imageUrl)) {
      imageNode.dataset.loadingState = "loaded";
      imageNode.src = entry.imageUrl;
      imageNode.classList.add("is-loaded");
      card.classList.remove("is-loading", "is-error");
      card.classList.add("is-loaded");
    }
  }
  const promptPreview = card.querySelector(".prompt-preview");
  if (promptPreview) {
    promptPreview.textContent = entry.job.prompt || "";
  }
  const addSourceButton = card.querySelector("[data-action='add-source-reference']");
  if (addSourceButton) {
    addSourceButton.dataset.jobId = entry.job.id || "";
    addSourceButton.dataset.slot = String(entry.image.slot || 0);
  }
  const copyButton = card.querySelector("[data-action='copy-job-prompt']");
  if (copyButton) {
    copyButton.dataset.jobId = entry.job.id || "";
  }
  const downloadLink = card.querySelector("a[download]");
  if (downloadLink) {
    downloadLink.href = entry.imageUrl;
    downloadLink.download = entry.image.name || `image-${entry.image.slot || 1}.png`;
  }
}

function resetGalleryCardLayoutStyle(card) {
  card.style.removeProperty("position");
  card.style.removeProperty("left");
  card.style.removeProperty("top");
  card.style.removeProperty("width");
  card.style.removeProperty("height");
}

function buildImageCard(job, image, options = {}) {
  const imageUrl = options.imageUrl || normalizeImageUrl(image.url);
  if (!imageUrl) {
    return null;
  }

  const imageReady = galleryImageWarmCache.isReady(imageUrl);
  const openIndex = Number.isInteger(options.openIndex)
    ? options.openIndex
    : galleryFlatList.push(createGalleryFlatItem(job, image, imageUrl, getGalleryPreviewUrl(image))) - 1;
  const imageKey = options.key || getGalleryImageKey(job, image, imageUrl);
  const previewUrl = getGalleryPreviewUrl(image);

  const card = createElement("div", "gallery-item");
  card.classList.add("is-loading");
  card.classList.toggle("has-preview", Boolean(previewUrl));
  card.dataset.galleryImageKey = imageKey;
  card.dataset.openLightbox = String(openIndex);
  card.dataset.jobId = job.id || "";
  card.dataset.imageSlot = String(image.slot || 0);
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", job.prompt || "生成图片");
  applyGalleryCardProfile(card, options.layoutProfile);
  applyGalleryPlaceholder(card, image);

  const imageNode = new Image();
  imageNode.decoding = "async";
  imageNode.loading = "eager";
  imageNode.fetchPriority = "auto";
  imageNode.dataset.src = imageUrl;
  imageNode.dataset.loadingState = imageReady ? "loaded" : "idle";
  imageNode.alt = job.prompt || "";
  const hasDimensions = applyGalleryImageDimensions(imageNode, image);
  if (imageReady) {
    imageNode.src = imageUrl;
    imageNode.classList.add("is-loaded");
    card.classList.remove("is-loading");
    card.classList.add("is-loaded");
  } else if (!hasDimensions) {
    imageNode.style.minHeight = "140px";
  }
  imageNode.addEventListener("load", () => handleGalleryImageLoaded(card, imageNode), { once: true });
  imageNode.addEventListener("error", () => handleGalleryImageError(card, imageNode), { once: true });
  card.dataset.lazyImage = "true";

  const previewNode = previewUrl ? createGalleryPreviewImage(previewUrl, job) : null;

  const overlay = createElement("div", "gallery-overlay");
  const promptPreview = createElement("div", "prompt-preview", job.prompt);

  const metaRow = createElement("div", "meta-row");
  const timeNode = createGalleryTimeNode(job.updated_at || job.created_at);
  const actions = createElement("span", "meta-actions");

  const copyButton = createActionButton("复制", "copy-job-prompt", job.id);
  copyButton.setAttribute("aria-label", "复制提示词");
  copyButton.setAttribute("title", "复制提示词");
  actions.appendChild(copyButton);

  const addSourceButton = createActionButton("参考", "add-source-reference", job.id);
  addSourceButton.dataset.slot = String(image.slot || 0);
  addSourceButton.setAttribute("aria-label", "加入图生图参考图");
  addSourceButton.setAttribute("title", "加入图生图参考图");
  actions.appendChild(addSourceButton);

  const downloadLink = createElement("a", "", "下载");
  downloadLink.href = imageUrl;
  downloadLink.download = image.name || `image-${image.slot || 1}.png`;
  downloadLink.setAttribute("title", "下载图片");
  downloadLink.addEventListener("click", (event) => event.stopPropagation());
  actions.appendChild(downloadLink);
  actions.appendChild(buildGalleryTerminalAction(job, image.slot || 0));

  metaRow.append(timeNode, actions);
  overlay.append(promptPreview, metaRow);
  card.append(...[previewNode, imageNode, overlay].filter(Boolean));
  return card;
}

function reconcileImageGrid(grid, entries, reusableCards) {
  const nodes = [];
  entries.forEach((entry) => {
    const openIndex = galleryFlatList.push(entry.flatItem) - 1;
    const existingCard = reusableCards.get(entry.key);
    const card = existingCard || buildImageCard(entry.job, entry.image, {
      imageUrl: entry.imageUrl,
      key: entry.key,
      openIndex,
      layoutProfile: entry.layoutProfile,
    });
    if (!card) {
      return;
    }
    resetGalleryCardLayoutStyle(card);
    syncImageCard(card, entry, openIndex);
    nodes.push(card);
  });
  grid.replaceChildren(...nodes);
  nodes.forEach((card) => activateGalleryImageCard(card));
  return nodes.length;
}

function buildTaskGallerySectionShell(job) {
  const section = createElement("section", "gallery-task-section");
  section.dataset.jobId = job.id || "";
  const head = createElement("div", "gallery-task-section-head");
  const title = createElement("div", "gallery-task-section-title", job.prompt || "未提供提示词");
  const meta = createElement(
    "div",
    "gallery-task-section-meta",
    `${getWorkflowLabel(job.workflow)} · ${getJobProgressText(job)} · ${formatDateTime(job.updated_at || job.created_at)}`
  );
  const grid = createElement("div", "gallery-task-section-grid");

  head.append(title, meta);
  section.append(head, grid);
  return section;
}

function syncTaskGallerySection(section, job) {
  section.dataset.jobId = job.id || "";
  const title = section.querySelector(".gallery-task-section-title");
  const meta = section.querySelector(".gallery-task-section-meta");
  if (title) {
    title.textContent = job.prompt || "未提供提示词";
  }
  if (meta) {
    meta.textContent = `${getWorkflowLabel(job.workflow)} · ${getJobProgressText(job)} · ${formatDateTime(job.updated_at || job.created_at)}`;
  }
}

function reconcileFlatGallery(jobs) {
  const entries = [];
  jobs.forEach((job) => {
    getSortedJobImages(job).forEach((image) => {
      const entry = createGalleryImageEntry(job, image);
      if (entry) {
        entries.push(entry);
      }
    });
  });
  assignGalleryLayoutProfiles(entries, { allowFeatured: true });
  galleryFlatList = entries.map((entry) => entry.flatItem);
  warmGalleryEntries(entries);
  galleryVirtualMasonry.setItems(entries);
  return entries.length;
}

function warmGalleryEntries(entries) {
  galleryPreviewWarmCache.warm(entries.map((entry) => entry.previewUrl), { immediate: true });
}

function reconcileTaskGallery(jobs, reusableCards) {
  if (elements.galleryGrid.classList.contains("is-virtualized")) {
    galleryVirtualMasonry.clear();
  }
  const existingSections = new Map();
  elements.galleryGrid.querySelectorAll(".gallery-task-section[data-job-id]").forEach((section) => {
    const jobId = section.dataset.jobId || "";
    if (jobId && !existingSections.has(jobId)) {
      existingSections.set(jobId, section);
    }
  });

  const sections = [];
  const allEntries = [];
  let renderedCards = 0;
  jobs.forEach((job) => {
    const entries = getSortedJobImages(job)
      .map((image) => createGalleryImageEntry(job, image))
      .filter(Boolean);
    if (!entries.length) {
      return;
    }
    assignGalleryLayoutProfiles(entries, { allowFeatured: false });
    allEntries.push(...entries);
    const section = existingSections.get(job.id || "") || buildTaskGallerySectionShell(job);
    const grid = section.querySelector(".gallery-task-section-grid");
    syncTaskGallerySection(section, job);
    renderedCards += reconcileImageGrid(grid, entries, reusableCards);
    sections.push(section);
  });

  warmGalleryEntries(allEntries);
  elements.galleryGrid.replaceChildren(...sections);
  return renderedCards;
}

function buildLeftTaskCard(job) {
  const card = createElement("article", `left-task-card is-${job.status || "unknown"}`);
  const top = createElement("div", "left-task-top");
  const statusMeta = getStatusMeta(job.status);
  const type = createElement("span", "left-task-type", getWorkflowLabel(job.workflow));
  const badge = createElement("span", `left-task-badge ${job.status || "unknown"}`, statusMeta.label);
  top.append(type, badge);

  const prompt = createElement("div", "left-task-prompt", job.prompt || "未提供提示词");
  const message = createElement("div", "left-task-message", getJobMessage(job));
  const meta = createElement("div", "left-task-meta");
  meta.append(
    createElement("span", "", getJobProgressText(job)),
    createJobDurationNode(job, { prefix: isActiveStatus(job.status) ? "" : "耗时 " })
  );

  const actions = createElement("div", "left-task-actions");
  actions.appendChild(createActionButton("复制", "copy-job-prompt", job.id));
  if (isActiveStatus(job.status)) {
    actions.appendChild(createActionButton("中断", "cancel-job", job.id));
  } else if (isRetryableJob(job)) {
    actions.appendChild(createActionButton("重试", "retry-job", job.id));
    actions.appendChild(createActionButton("删除", "delete-job", job.id, "gallery-del-btn"));
  } else {
    actions.appendChild(createActionButton("删除", "delete-job", job.id, "gallery-del-btn"));
  }

  card.append(top, prompt, message, meta, actions);
  return card;
}

function createRunningJobStat(label, value) {
  const item = createElement("div", "running-job-stat");
  const labelNode = createElement("div", "running-job-stat-label", label);
  const valueNode = createElement("div", "running-job-stat-value");
  if (value instanceof Node) {
    valueNode.appendChild(value);
  } else {
    valueNode.textContent = value;
  }
  item.append(labelNode, valueNode);
  return item;
}

function buildRunningBannerCard(job) {
  const statusMeta = getStatusMeta(job.status);
  const statusClass = statusMeta.className || job.status || "unknown";
  const card = createElement("article", `running-job-card is-${statusClass}`);
  const header = createElement("div", "running-job-header");
  const main = createElement("div", "running-job-main");
  const top = createElement("div", "running-job-top");
  const progressPercent = getJobProgressPercent(job);
  const completedCount = Array.isArray(job.images) ? job.images.length : 0;
  const totalCount = Number(job.count || 0);
  const remainingCount = Math.max(0, totalCount - completedCount);
  top.append(
    createElement("span", "running-job-status", statusMeta.label),
    createElement("span", "running-job-type", getWorkflowLabel(job.workflow))
  );

  const prompt = createElement("div", "running-job-prompt", job.prompt || "未提供提示词");
  const actions = createElement("div", "running-job-actions");
  actions.appendChild(createActionButton("复制", "copy-job-prompt", job.id));
  actions.appendChild(createActionButton("中断", "cancel-job", job.id));

  const progressBlock = createElement("div", "running-job-progress-block");
  const stats = createElement("div", "running-job-stats");
  stats.append(
    createRunningJobStat("进度", `${getJobProgressText(job)} · ${progressPercent}%`),
    createRunningJobStat("耗时", createJobDurationNode(job)),
    createRunningJobStat("剩余", `${remainingCount} 张`)
  );
  const progressTrack = createElement("div", "running-job-progress-track");
  const progressFill = createElement("div", "running-job-progress-fill");
  progressFill.style.width = progressPercent > 0 ? `${Math.max(progressPercent, 6)}%` : "0%";
  progressTrack.appendChild(progressFill);
  const progressNote = createElement("div", "running-job-progress-note", getJobMessage(job));
  progressBlock.append(stats, progressTrack, progressNote);

  main.append(top, prompt);
  header.append(main, actions);
  card.append(header, progressBlock);
  return card;
}

function renderRunningBanner() {
  if (!elements.runningBanner || !elements.runningBannerBody) {
    return;
  }
  const runningJobs = jobsState.filter((job) => isActiveStatus(job.status));
  const hasRunningJobs = runningJobs.length > 0;
  elements.runningBanner.classList.toggle("is-empty", !hasRunningJobs);
  elements.runningBannerCount.textContent = `${runningJobs.length} 个`;
  elements.runningBannerSubtitle.textContent = hasRunningJobs
    ? runningJobs.length > 1
      ? `${runningJobs.length} 个任务进行中 · ${truncateText(runningJobs[0].prompt || "任务", 18)}`
      : runningJobs[0].prompt || "任务"
    : "暂无运行中任务";
  elements.runningBannerBody.innerHTML = "";
  runningJobs.forEach((job) => {
    elements.runningBannerBody.appendChild(buildRunningBannerCard(job));
  });
}

function renderLeftTaskList() {
  if (!elements.taskList || !elements.taskPanelCount) {
    return;
  }
  const sortedJobs = [...jobsState].sort((left, right) => {
    const leftTime = new Date(left.created_at || left.updated_at || 0).getTime();
    const rightTime = new Date(right.created_at || right.updated_at || 0).getTime();
    return rightTime - leftTime;
  });
  elements.taskPanelCount.textContent = `${sortedJobs.length} 个任务`;
  const runningCount = sortedJobs.filter((job) => isActiveStatus(job.status)).length;
  if (elements.taskPanelPreview) {
    if (!sortedJobs.length) {
      elements.taskPanelPreview.textContent = "暂无任务";
    } else if (runningCount > 0) {
      elements.taskPanelPreview.textContent = `${runningCount} 个进行中`;
    } else {
      const latestJob = sortedJobs[0];
      const statusMeta = getStatusMeta(latestJob.status);
      elements.taskPanelPreview.textContent = `${statusMeta.label} · ${truncateText(latestJob.prompt || "未提供提示词", 14)}`;
    }
  }
  elements.taskList.innerHTML = "";
  if (!sortedJobs.length) {
    elements.taskList.appendChild(createElement("div", "task-empty", "暂无任务"));
    return;
  }
  sortedJobs.forEach((job) => {
    elements.taskList.appendChild(buildLeftTaskCard(job));
  });
}

function updateSyncIndicators() {
  const runningJobs = jobsState.filter((job) => isActiveStatus(job.status)).length;
  const activeProfile = providerProfilesState.active_profile;
  elements.storageMode.textContent = activeProfile
    ? `当前配置：${activeProfile.name}`
    : "当前配置：未设置";

  if (lastSyncError) {
    elements.storageUsage.textContent = `同步失败：${truncateText(lastSyncError, 30)}`;
  } else if (lastSyncAt) {
    const suffix = runningJobs ? ` · ${runningJobs} 个任务进行中` : "";
    elements.storageUsage.textContent = `最后同步：${formatClock(lastSyncAt)}${suffix}`;
  } else {
    elements.storageUsage.textContent = "同步：自动刷新";
  }

  if (runningJobs) {
    elements.fsDirStatus.style.display = "";
    elements.fsDirStatus.textContent = `${runningJobs} 个任务进行中`;
  } else {
    elements.fsDirStatus.style.display = "none";
    elements.fsDirStatus.textContent = "";
  }
}

function renderGallery() {
  const jobs = getFilteredJobs();
  lastJobSnapshotSignature = getJobSnapshotSignature(jobsState);
  lastGallerySnapshotSignature = getGallerySnapshotSignature(jobsState);
  renderLeftTaskList();
  renderRunningBanner();
  const reusableCards = collectReusableGalleryCards();
  galleryFlatList = [];
  elements.galleryGrid.classList.toggle("grouped-by-task", currentGalleryFilter === "tasks");

  const renderedCards = currentGalleryFilter === "tasks"
    ? reconcileTaskGallery(jobs, reusableCards)
    : reconcileFlatGallery(jobs);

  elements.galleryEmpty.style.display = renderedCards ? "none" : "";
  elements.galleryCount.textContent = renderedCards
    ? currentGalleryFilter === "tasks"
      ? `${jobs.length} 个任务 · ${renderedCards} 张`
      : `${renderedCards} 张`
    : "";
  updateSyncIndicators();
  refreshRelativeTimes();
  scheduleGalleryLayout();
  syncLightboxSelection();
}

function refreshRelativeTimes() {
  document.querySelectorAll("[data-elapsed-from]").forEach((node) => {
    if (node.dataset.elapsedLive === "false") {
      return;
    }
    node.textContent = `${node.dataset.elapsedPrefix || ""}${formatElapsed(node.dataset.elapsedFrom)}`;
  });
}

function filterGallery(type, button) {
  currentGalleryFilter = type;
  document.querySelectorAll(".gallery-filter button").forEach((node) => {
    node.classList.toggle("active", node === button);
  });
  renderGallery();
}

function toggleSort() {
  gallerySortAsc = !gallerySortAsc;
  elements.sortBtn.textContent = gallerySortAsc ? "旧→新 ↑" : "新→旧 ↓";
  renderGallery();
}

function applyLightboxZoom() {
  const scale = clampNumber(lightboxZoomState.scale, LIGHTBOX_ZOOM_MIN, LIGHTBOX_ZOOM_MAX);
  lightboxZoomState.scale = scale;
  if (scale <= LIGHTBOX_ZOOM_MIN) {
    lightboxZoomState.offsetX = 0;
    lightboxZoomState.offsetY = 0;
  }

  if (elements.lightboxImg) {
    elements.lightboxImg.style.transform = `translate(${lightboxZoomState.offsetX}px, ${lightboxZoomState.offsetY}px) scale(${scale})`;
  }
  if (elements.lightboxWrap) {
    elements.lightboxWrap.classList.toggle("is-zoomed", scale > LIGHTBOX_ZOOM_MIN);
    elements.lightboxWrap.classList.toggle("is-dragging", lightboxZoomState.isDragging);
  }
  if (elements.lightboxZoomValue) {
    elements.lightboxZoomValue.textContent = `${Math.round(scale * 100)}%`;
  }
  if (elements.lightboxZoomOut) {
    elements.lightboxZoomOut.disabled = scale <= LIGHTBOX_ZOOM_MIN;
  }
  if (elements.lightboxZoomReset) {
    elements.lightboxZoomReset.disabled = scale <= LIGHTBOX_ZOOM_MIN;
  }
  if (elements.lightboxZoomIn) {
    elements.lightboxZoomIn.disabled = scale >= LIGHTBOX_ZOOM_MAX;
  }
}

function resetLightboxZoom() {
  lightboxZoomState = {
    ...lightboxZoomState,
    scale: LIGHTBOX_ZOOM_MIN,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
  };
  applyLightboxZoom();
}

function setLightboxZoom(nextScale) {
  lightboxZoomState.scale = clampNumber(nextScale, LIGHTBOX_ZOOM_MIN, LIGHTBOX_ZOOM_MAX);
  applyLightboxZoom();
}

function zoomLightboxBy(delta) {
  setLightboxZoom(lightboxZoomState.scale + delta);
}

function resolveLightboxIndex(index, selection = {}) {
  if (Number.isInteger(index) && galleryFlatList[index]) {
    return index;
  }
  const jobId = selection.jobId || "";
  const slot = Number(selection.slot || 0);
  if (!jobId || !slot) {
    return -1;
  }
  return galleryFlatList.findIndex((item) => item.jobId === jobId && Number(item.slot || 0) === slot);
}

function showLightboxItem(index) {
  const item = galleryFlatList[index];
  if (!item) {
    return false;
  }

  const job = getJobById(item.jobId);
  lightboxIndex = index;
  lightboxSelection = { jobId: item.jobId, slot: item.slot };

  resetLightboxZoom();
  elements.lightboxPrompt.classList.remove("expanded");
  elements.lightboxImg.src = item.src;
  elements.lightboxPrompt.textContent = item.prompt || "";
  elements.lightboxDl.href = item.src;
  elements.lightboxDl.download = item.filename;
  elements.lightboxCounter.textContent = `${index + 1} / ${galleryFlatList.length}`;
  if (elements.lightboxAddSource) {
    elements.lightboxAddSource.disabled = false;
  }
  elements.lightboxPrev.disabled = index === 0;
  elements.lightboxNext.disabled = index === galleryFlatList.length - 1;

  if (job && isActiveStatus(job.status)) {
    elements.lightboxDel.textContent = "中断任务";
    elements.lightboxDel.disabled = actionJobIds.has(job.id);
  } else {
    elements.lightboxDel.textContent = "删除图片";
    elements.lightboxDel.disabled = job ? actionJobIds.has(job.id) : true;
  }
  return true;
}

function openLightbox(index, selection = {}) {
  const resolvedIndex = resolveLightboxIndex(index, selection);
  if (!showLightboxItem(resolvedIndex)) {
    return;
  }
  elements.lightbox.classList.add("open");
  elements.lightbox.setAttribute("role", "dialog");
  elements.lightbox.setAttribute("aria-modal", "true");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  elements.lightbox.classList.remove("open");
  document.body.style.overflow = "";
  lightboxIndex = -1;
  lightboxSelection = null;
  resetLightboxZoom();
}

function syncLightboxSelection() {
  if (!elements.lightbox.classList.contains("open") || !lightboxSelection) {
    return;
  }

  const index = galleryFlatList.findIndex((item) => {
    if (item.jobId !== lightboxSelection.jobId) {
      return false;
    }
    return item.slot === lightboxSelection.slot;
  });

  if (index === -1) {
    closeLightbox();
    lightboxIndex = -1;
    lightboxSelection = null;
    return;
  }

  showLightboxItem(index);
}

function lightboxNav(direction) {
  const nextIndex = lightboxIndex + direction;
  if (nextIndex >= 0 && nextIndex < galleryFlatList.length) {
    showLightboxItem(nextIndex);
  }
}

function startLightboxPan(event) {
  if (lightboxZoomState.scale <= LIGHTBOX_ZOOM_MIN || event.button !== 0) {
    return;
  }
  event.preventDefault();
  lightboxZoomState = {
    ...lightboxZoomState,
    isDragging: true,
    startX: event.clientX,
    startY: event.clientY,
    startOffsetX: lightboxZoomState.offsetX,
    startOffsetY: lightboxZoomState.offsetY,
  };
  elements.lightboxImg?.setPointerCapture?.(event.pointerId);
  applyLightboxZoom();
}

function updateLightboxPan(event) {
  if (!lightboxZoomState.isDragging) {
    return;
  }
  event.preventDefault();
  lightboxZoomState.offsetX = lightboxZoomState.startOffsetX + event.clientX - lightboxZoomState.startX;
  lightboxZoomState.offsetY = lightboxZoomState.startOffsetY + event.clientY - lightboxZoomState.startY;
  applyLightboxZoom();
}

function stopLightboxPan(event) {
  if (!lightboxZoomState.isDragging) {
    return;
  }
  lightboxZoomState.isDragging = false;
  if (elements.lightboxImg?.hasPointerCapture?.(event.pointerId)) {
    elements.lightboxImg.releasePointerCapture(event.pointerId);
  }
  applyLightboxZoom();
}

function handleLightboxWheel(event) {
  if (!elements.lightbox.classList.contains("open")) {
    return;
  }
  event.preventDefault();
  zoomLightboxBy(event.deltaY < 0 ? LIGHTBOX_ZOOM_STEP : -LIGHTBOX_ZOOM_STEP);
}

function copyPrompt() {
  const item = galleryFlatList[lightboxIndex];
  if (!item) {
    return;
  }
  copyToClipboard(item.prompt, elements.lightboxCopy, "已复制", "复制提示词");
}

function findJobImage(jobId, slot) {
  const job = getJobById(jobId);
  if (!job) {
    return null;
  }
  const normalizedSlot = Number(slot || 0);
  return (job.images || []).find((image) => Number(image.slot || 0) === normalizedSlot) || null;
}

async function addGalleryImageToSource(jobId, slot) {
  const image = findJobImage(jobId, slot);
  if (!image?.url) {
    setStatus("error", "要加入参考图的图片不存在。", { timeoutMs: 2200 });
    return;
  }
  if (!window.WorkspacePanel?.addSourceImageFromUrl) {
    setStatus("error", "当前工作区暂不支持加入参考图。", { timeoutMs: 2200 });
    return;
  }

  const imageUrl = normalizeImageUrl(image.url);
  const filename = image.name || `image-${image.slot || 1}.png`;
  try {
    const addedCount = await window.WorkspacePanel.addSourceImageFromUrl({
      url: imageUrl,
      filename,
      sourceKey: `gallery:${imageUrl}`,
    });
    switchTab("image-to-image");
    setStatus(
      "success",
      addedCount > 0 ? "已加入图生图参考图。" : "这张图片已经在图生图参考图中。",
      { timeoutMs: 2200 }
    );
  } catch (error) {
    console.error("Add source reference failed:", error);
    setStatus("error", error.message);
  }
}

async function addLightboxImageToSource() {
  const item = galleryFlatList[lightboxIndex];
  if (!item) {
    return;
  }
  if (elements.lightboxAddSource) {
    elements.lightboxAddSource.disabled = true;
  }
  try {
    await addGalleryImageToSource(item.jobId, item.slot);
  } finally {
    if (elements.lightboxAddSource) {
      elements.lightboxAddSource.disabled = false;
    }
  }
}

async function deleteJob(jobId) {
  const job = getJobById(jobId);
  if (!job) {
    return;
  }

  const imageCount = Array.isArray(job.images) ? job.images.length : 0;
  const promptLabel = truncateText(job.prompt || "这个任务", 24);
  const message = imageCount > 1
    ? `确定删除「${promptLabel}」这个任务？会同时删除已生成的 ${imageCount} 张图片。`
    : `确定删除「${promptLabel}」这个任务吗？`;

  if (!window.confirm(message)) {
    return;
  }

  actionJobIds.add(jobId);
  syncFailurePopupActions();
  renderGallery();
  try {
    await apiRequest(`/api/jobs/${jobId}`, { method: "DELETE", timeoutMs: ACTION_TIMEOUT_MS });
    clearFailurePopupEntries(jobId);
    if (lightboxSelection && lightboxSelection.jobId === jobId) {
      closeLightbox();
      lightboxSelection = null;
      lightboxIndex = -1;
    }
    await refreshJobs({ silent: true });
    setStatus("success", "任务已删除。", { timeoutMs: 2200 });
  } catch (error) {
    console.error("Delete job failed:", error);
    setStatus("error", error.message);
  } finally {
    actionJobIds.delete(jobId);
    syncFailurePopupActions();
    renderGallery();
  }
}

async function deleteImage(jobId, slot) {
  const job = getJobById(jobId);
  if (!job) {
    return;
  }

  const imageCount = Array.isArray(job.images) ? job.images.length : 0;
  const targetImage = (job.images || []).find((image) => Number(image.slot || 0) === Number(slot));
  if (!targetImage) {
    setStatus("error", "要删除的图片不存在。", { timeoutMs: 2200 });
    return;
  }

  const message = imageCount > 1
    ? `确定删除这张图片吗？本次任务的其余 ${imageCount - 1} 张图片会保留。`
    : "确定删除这张图片吗？任务记录会保留，但图库中将不再显示这次结果。";

  if (!window.confirm(message)) {
    return;
  }

  const previousLightboxIndex = lightboxIndex;
  actionJobIds.add(jobId);
  renderGallery();
  try {
    const payload = await apiRequest(`/api/jobs/${jobId}/images/${slot}`, { method: "DELETE", timeoutMs: ACTION_TIMEOUT_MS });
    await refreshJobs({ silent: true });

    if (elements.lightbox.classList.contains("open")) {
      if (galleryFlatList.length > 0) {
        const nextIndex = Math.min(previousLightboxIndex, galleryFlatList.length - 1);
        showLightboxItem(nextIndex);
      } else {
        closeLightbox();
      }
    }

    setStatus(
      "success",
      payload.deleted_job ? "图片已删除，这个任务已自动移除。" : "图片已删除，其余图片和任务记录已保留。",
      { timeoutMs: 2200 }
    );
  } catch (error) {
    console.error("Delete image failed:", error);
    setStatus("error", error.message);
  } finally {
    actionJobIds.delete(jobId);
    renderGallery();
  }
}

async function cancelJob(jobId) {
  const job = getJobById(jobId);
  if (!job || !isActiveStatus(job.status)) {
    return;
  }

  actionJobIds.add(jobId);
  renderGallery();
  try {
    await apiRequest(`/api/jobs/${jobId}/cancel`, { method: "POST", timeoutMs: ACTION_TIMEOUT_MS });
    await refreshJobs({ silent: true });
    setStatus("success", "任务已送出中断请求。", { timeoutMs: 2200 });
  } catch (error) {
    console.error("Cancel job failed:", error);
    setStatus("error", error.message);
  } finally {
    actionJobIds.delete(jobId);
    renderGallery();
  }
}

async function retryJob(jobId) {
  const job = getJobById(jobId);
  if (!isRetryableJob(job)) {
    return;
  }

  clearFailurePopupEntries(jobId);
  actionJobIds.add(jobId);
  renderGallery();
  try {
    await apiRequest(`/api/jobs/${jobId}/retry`, { method: "POST", timeoutMs: ACTION_TIMEOUT_MS });
    await refreshJobs({ silent: true });
    setStatus("success", "任务已重新加入队列。", { timeoutMs: 2200 });
  } catch (error) {
    console.error("Retry job failed:", error);
    setStatus("error", error.message);
  } finally {
    actionJobIds.delete(jobId);
    renderGallery();
  }
}

async function deleteLightboxImage() {
  const item = galleryFlatList[lightboxIndex];
  if (!item) {
    return;
  }

  const job = getJobById(item.jobId);
  if (!job) {
    return;
  }

  if (isActiveStatus(job.status)) {
    await cancelJob(job.id);
  } else {
    await deleteImage(job.id, item.slot);
  }
}

function toggleSettingsPanel() {
  elements.settingsPanel.classList.toggle("open");
}

function switchTab(name) {
  if (!isSupportedWorkflow(name)) {
    return;
  }

  const changed = window.WorkspacePanel?.setActiveWorkflow(name);
  if (changed === false && name === "image-to-image") {
    setStatus("error", "当前提供方配置不支持图生图。", { timeoutMs: 2400 });
  }
}

function buildCreateJobRequestBody(workflow, prompt, outputParams) {
  const basePayload = {
    workflow,
    prompt,
    quality: outputParams.quality,
    size: outputParams.size,
    count: Number.parseInt(elements.count.value, 10) || 1,
  };

  if (workflow !== "image-to-image") {
    return basePayload;
  }

  const sourceFiles = getSelectedSourceFiles();
  if (!sourceFiles.length) {
    alert("请先上传至少 1 张参考图");
    return null;
  }

  const formData = new FormData();
  Object.entries(basePayload).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  sourceFiles.forEach((file) => {
    formData.append("source_image", file, file.name);
  });
  return formData;
}

function submitActiveWorkflow(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const workflow = event?.currentTarget?.dataset.workflow || getActiveWorkflow();
  generate(workflow);
}

async function generate(workflowOverride) {
  if (createJobInFlight) {
    return;
  }

  const workflow = normalizeWorkflow(workflowOverride || getActiveWorkflow(), "");
  if (!workflow) {
    setStatus("error", "当前工作流无效，请重新选择文生图或图生图。", { timeoutMs: 2400 });
    return;
  }

  const prompt = elements.prompt.value.trim();
  if (!prompt) {
    alert("请输入提示词");
    elements.prompt.focus();
    return;
  }

  const outputParams = readOutputParamsFromUi();
  if (!outputParams) {
    return;
  }

  const payload = buildCreateJobRequestBody(workflow, prompt, outputParams);
  if (!payload) {
    syncPrimaryActionState(false);
    return;
  }

  createJobInFlight = true;
  syncPrimaryActionState(true);
  saveActiveWorkflowForm(workflow);
  setStatus("loading", "正在创建任务...");

  try {
    const job = await apiRequest("/api/jobs", {
      method: "POST",
      body: payload,
      timeoutMs: ACTION_TIMEOUT_MS,
    });

    await refreshJobs({ silent: true });
    setStatus("success", `任务已创建，开始请求生成 ${job.count} 张图片。`, { timeoutMs: 2600 });
  } catch (error) {
    console.error("Create job failed:", error);
    setStatus("error", error.message);
  } finally {
    createJobInFlight = false;
    syncPrimaryActionState(false);
  }
}

async function refreshJobs(options = {}) {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const data = await apiRequest("/api/jobs", {
        method: "GET",
        timeoutMs: LIST_TIMEOUT_MS,
      });
      const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
      const nextSignature = getJobSnapshotSignature(nextJobs);
      const nextGallerySignature = getGallerySnapshotSignature(nextJobs);
      const jobsChanged = nextSignature !== lastJobSnapshotSignature;
      const galleryChanged = nextGallerySignature !== lastGallerySnapshotSignature;
      syncProblemPopups(nextJobs);

      jobsState = nextJobs;
      lastSyncAt = new Date();
      lastSyncError = "";
      if (jobsChanged && galleryChanged) {
        renderGallery();
      } else if (jobsChanged) {
        lastJobSnapshotSignature = nextSignature;
        lastGallerySnapshotSignature = nextGallerySignature;
        renderLeftTaskList();
        renderRunningBanner();
        syncRenderedGalleryCardActions();
        updateSyncIndicators();
        refreshGalleryViewportEffects();
        syncLightboxSelection();
      } else {
        updateSyncIndicators();
        refreshRelativeTimes();
      }
      if (options.manual) {
        setStatus("success", "已刷新。", { timeoutMs: 1800 });
      }
    } catch (error) {
      lastSyncError = error.message;
      updateSyncIndicators();
      if (!options.silent) {
        setStatus("error", error.message);
      }
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function refreshGallery() {
  refreshJobs({ manual: true });
}

function resetFormState(options = {}) {
  const defaultWorkflow = WORKFLOW_STATE.DEFAULT_WORKFLOW;
  WORKFLOW_STATE.resetForms();
  WORKFLOW_STATE.writeActiveWorkflow(defaultWorkflow);
  window.WorkspacePanel?.setActiveWorkflow(defaultWorkflow, { emit: false });
  loadActiveWorkflowForm(defaultWorkflow);
  window.WorkspacePanel?.clearSourceFiles?.();
  renderSavedPrompts();
  if (!options.silent) {
    setStatus("success", "表单已重置。", { timeoutMs: 2000 });
  }
  syncPrimaryActionState();
}

function handleJobAction(actionButton) {
  const action = actionButton.dataset.action;
  const jobId = actionButton.dataset.jobId;

  if (action === "copy-job-prompt") {
    const job = getJobById(jobId);
    if (job) {
      const resetLabel = actionButton.textContent || "复制";
      copyToClipboard(job.prompt, actionButton, "已复制", resetLabel);
    }
    return;
  }
  if (action === "cancel-job") {
    cancelJob(jobId);
    return;
  }
  if (action === "retry-job") {
    retryJob(jobId);
    return;
  }
  if (action === "add-source-reference") {
    addGalleryImageToSource(jobId, Number(actionButton.dataset.slot || 0));
    return;
  }
  if (action === "delete-job") {
    deleteJob(jobId);
    return;
  }
  if (action === "delete-image") {
    deleteImage(jobId, Number(actionButton.dataset.slot || 0));
  }
}

function bindEvents() {
  formFieldIds.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) {
      return;
    }
    if (fieldId === "size" || fieldId === "quality") {
      return;
    }
    field.addEventListener("input", () => saveActiveWorkflowForm());
    field.addEventListener("change", () => saveActiveWorkflowForm());
  });

  elements.size.addEventListener("change", () => {
    saveActiveWorkflowForm();
  });

  elements.quality?.addEventListener("change", () => {
    syncSizeOptionsForQuality(elements.quality.value, elements.size.value);
    saveActiveWorkflowForm();
  });

  elements.toggleApiKeyVisibilityBtn?.addEventListener("click", () => {
    isApiKeyVisible = !isApiKeyVisible;
    syncApiKeyVisibilityUi();
  });

  elements.providerProfileSelect?.addEventListener("change", (event) => {
    activateProviderProfile(event.target.value);
  });

  elements.generateBtn?.addEventListener("click", submitActiveWorkflow);
  elements.savePromptBtn?.addEventListener("click", saveCurrentPrompt);
  elements.clearPromptBankBtn?.addEventListener("click", clearSavedPrompts);

  elements.savedPrompts.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt-action]");
    if (!button) {
      return;
    }

    const promptId = button.dataset.promptId;
    const action = button.dataset.promptAction;
    const workflow = normalizeWorkflow(getActiveWorkflow());
    const prompt = WORKFLOW_STATE.findPrompt(workflow, promptId);

    if (action === "apply") {
      applySavedPrompt(promptId);
      return;
    }
    if (action === "copy" && prompt) {
      copyToClipboard(prompt.prompt, button, "已复制", "复制");
      return;
    }
    if (action === "delete") {
      deleteSavedPrompt(promptId);
    }
  });

  elements.failurePopupConfirm?.addEventListener("click", () => {
    closeFailurePopup();
  });

  elements.failurePopupRetry?.addEventListener("click", () => {
    const jobId = elements.failurePopupRetry.dataset.jobId;
    if (!jobId) {
      return;
    }
    retryJob(jobId);
  });

  elements.failurePopupDelete?.addEventListener("click", () => {
    const jobId = elements.failurePopupDelete.dataset.jobId;
    if (!jobId) {
      return;
    }
    deleteJob(jobId);
  });

  elements.lightboxZoomOut?.addEventListener("click", (event) => {
    event.stopPropagation();
    zoomLightboxBy(-LIGHTBOX_ZOOM_STEP);
  });

  elements.lightboxZoomIn?.addEventListener("click", (event) => {
    event.stopPropagation();
    zoomLightboxBy(LIGHTBOX_ZOOM_STEP);
  });

  elements.lightboxZoomReset?.addEventListener("click", (event) => {
    event.stopPropagation();
    resetLightboxZoom();
  });

  elements.lightboxImg?.addEventListener("wheel", handleLightboxWheel, { passive: false });
  elements.lightboxImg?.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setLightboxZoom(lightboxZoomState.scale > LIGHTBOX_ZOOM_MIN ? LIGHTBOX_ZOOM_MIN : 2);
  });
  elements.lightboxImg?.addEventListener("pointerdown", startLightboxPan);
  elements.lightboxImg?.addEventListener("pointermove", updateLightboxPan);
  elements.lightboxImg?.addEventListener("pointerup", stopLightboxPan);
  elements.lightboxImg?.addEventListener("pointercancel", stopLightboxPan);
  elements.lightboxImg?.addEventListener("dragstart", (event) => event.preventDefault());

  elements.galleryGrid.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.stopPropagation();
      handleJobAction(actionButton);
      return;
    }

    if (event.target.closest("a, button")) {
      return;
    }

    const card = event.target.closest("[data-open-lightbox]");
    if (!card) {
      return;
    }
    openLightbox(Number.parseInt(card.dataset.openLightbox, 10), {
      jobId: card.dataset.jobId,
      slot: Number(card.dataset.imageSlot || 0),
    });
  });

  elements.galleryGrid.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-open-lightbox]");
    if (!card) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(Number.parseInt(card.dataset.openLightbox, 10), {
        jobId: card.dataset.jobId,
        slot: Number(card.dataset.imageSlot || 0),
      });
    }
  });

  elements.taskList?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }
    event.stopPropagation();
    handleJobAction(actionButton);
  });

  elements.runningBannerToggle?.addEventListener("click", () => {
    const collapsed = elements.runningBanner.classList.toggle("is-collapsed");
    elements.runningBannerToggle.setAttribute("aria-expanded", String(!collapsed));
    window.requestAnimationFrame(() => refreshGalleryViewportEffects());
    window.setTimeout(() => refreshGalleryViewportEffects(), 220);
  });

  elements.runningBannerBody?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }
    event.stopPropagation();
    handleJobAction(actionButton);
  });

  document.addEventListener("click", (event) => {
    if (elements.settingsPanel.classList.contains("open") && !event.target.closest(".settings-wrap")) {
      elements.settingsPanel.classList.remove("open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!elements.lightbox.classList.contains("open")) {
      return;
    }
    if (event.key === "Escape") {
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      lightboxNav(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      lightboxNav(1);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomLightboxBy(LIGHTBOX_ZOOM_STEP);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomLightboxBy(-LIGHTBOX_ZOOM_STEP);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetLightboxZoom();
    }
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      refreshGalleryViewportEffects({ refreshLayout: true, refreshLoader: true });
    }, 120);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshJobs({ silent: true });
    }
  });

  window.addEventListener("focus", () => {
    refreshJobs({ silent: true });
  });
}

function hydrateStaticUi() {
  syncApiKeyVisibilityUi();
  window.ProviderModelPicker?.init({
    apiRequest,
    resolveSourceProfileId: getProviderModelSourceProfileId,
    onAvailabilityChange: syncProviderProfileActionState,
    onMessage: (type, message) => {
      setStatus(type === "error" ? "error" : "success", message, { timeoutMs: 2200 });
    },
  });
  window.ProviderProfilePicker?.init({
    onDelete: deleteProviderProfile,
  });
  const initialWorkflow = normalizeWorkflow(WORKFLOW_STATE.readActiveWorkflow());
  window.WorkspacePanel?.init({
    initialWorkflow,
    onWorkflowChange: handleWorkflowChange,
    onSourceFilesChange: handleSourceFilesChange,
  });
  loadActiveWorkflowForm(initialWorkflow);
  renderSavedPrompts();
  syncPrimaryActionState();
  syncProviderProfileActionState();
}

function startTimers() {
  window.clearInterval(pollTimer);
  window.clearInterval(clockTimer);
  pollTimer = window.setInterval(() => {
    refreshJobs({ silent: true });
  }, POLL_INTERVAL_MS);
  clockTimer = window.setInterval(() => {
    refreshRelativeTimes();
  }, 1000);
}

async function init() {
  populateOutputOptionSelects();
  bindEvents();
  hydrateStaticUi();
  await loadProviderProfiles({ silent: true });
  updateSyncIndicators();
  await refreshJobs({ silent: true });
  startTimers();
}

init();
