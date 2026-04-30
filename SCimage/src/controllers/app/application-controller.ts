// @ts-nocheck
"use strict";

import {
  ACTION_TIMEOUT_MS,
  FORM_FIELD_IDS,
  GALLERY_CLIENT_MAX_RETAINED,
  GALLERY_PAGE_SIZE,
  GALLERY_PLACEHOLDER_COLOR_PATTERN,
  GALLERY_PREVIEW_WARM_BATCH_SIZE,
  JOBS_CLIENT_MAX_RETAINED,
  JOBS_LOAD_MORE_THRESHOLD_PX,
  JOBS_PAGE_SIZE,
  LIGHTBOX_ZOOM_MIN,
  LIGHTBOX_ZOOM_STEP,
  LIST_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  RUNNING_STATUSES,
  TASK_LIST_MAX_RENDERED,
  TASK_LIST_VIRTUAL_ITEM_HEIGHT,
  TASK_LIST_VIRTUAL_OVERSCAN,
} from "./constants";
import { bindAppEvents } from "./app-events-controller";
import { collectAppElements } from "./dom-elements";
import { createFailurePopupController } from "./failure-popup-controller";
import { createGalleryController } from "./gallery-controller";
import { createGalleryDataController } from "./gallery-data-controller";
import { createGalleryHoverController } from "./gallery-hover-controller";
import { createGalleryItemPresenter } from "./gallery-item-presenter";
import { createGalleryRenderController } from "./gallery-render-controller";
import { createGallerySelectionController } from "./gallery-selection-controller";
import { createJobActionsController } from "./job-actions-controller";
import { createJobCreateController } from "./job-create-controller";
import { createJobSyncController } from "./job-sync-controller";
import { createJobsController } from "./jobs-controller";
import { createLightboxActionsController } from "./lightbox-actions-controller";
import { createLightboxController } from "./lightbox-controller";
import { createPiniaBridge } from "./pinia-bridge";
import { createPromptController } from "./prompt-controller";
import { createProviderController } from "./provider-controller";
import { loadRuntimeModules } from "./runtime-modules";
import { createWorkflowFormController } from "./workflow-form-controller";

let OUTPUT_OPTIONS = null;
let WORKFLOW_STATE = null;
let GALLERY_RUNTIME = null;
let GALLERY_LAYOUT = null;
let GALLERY_GROUPING = null;
let legacyModulesLoaded = false;
let galleryStore = null;
let jobStore = null;
let promptStore = null;
let providerStore = null;
let workspaceStore = null;

function initControllerStores() {
  const stores = createPiniaBridge();
  galleryStore = stores.galleryStore;
  jobStore = stores.jobStore;
  promptStore = stores.promptStore;
  providerStore = stores.providerStore;
  workspaceStore = stores.workspaceStore;
}

async function loadLegacyModulesAfterVueMount() {
  if (legacyModulesLoaded) {
    return;
  }
  const modules = await loadRuntimeModules();
  OUTPUT_OPTIONS = modules.OUTPUT_OPTIONS;
  WORKFLOW_STATE = modules.WORKFLOW_STATE;
  GALLERY_RUNTIME = modules.GALLERY_RUNTIME;
  GALLERY_LAYOUT = modules.GALLERY_LAYOUT;
  GALLERY_GROUPING = modules.GALLERY_GROUPING;
  legacyModulesLoaded = true;
  initGalleryRuntimeServices();
}

const elements = collectAppElements();

let jobsState = [];
let galleryItemsState = [];
let jobsPaginationState = {
  total: 0,
  hasMore: false,
  pageSize: JOBS_PAGE_SIZE,
  nextOffset: 0,
  nextCursor: "",
  isLoadingMore: false,
};
let galleryPaginationState = {
  total: 0,
  hasMore: false,
  pageSize: GALLERY_PAGE_SIZE,
  nextCursor: "",
  isLoadingMore: false,
};
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
let pollTimer = null;
let clockTimer = null;
let statusClearTimer = null;
let galleryActivationFrame = null;
const galleryImageMetrics = new Map();
let isApiKeyVisible = false;
let taskListRenderFrame = null;
let galleryLayoutCoordinator = null;
let galleryEdgeSelection = null;
const galleryHoverController = createGalleryHoverController();
const gallerySelectionController = createGallerySelectionController({
  elements,
  getFlatList: () => galleryFlatList,
  getGalleryStore: () => galleryStore,
  onSelectionGestureFinished: () => renderGallery(),
});
const lightboxController = createLightboxController({
  elements,
  getItems: () => galleryFlatList,
  getJobById: (jobId) => getJobById(jobId),
  isActiveStatus: (status) => isActiveStatus(status),
  isActionDisabled: (jobId) => getJobActionsController().isActionDisabled(jobId),
});

function normalizeGalleryFilter(value) {
  if (typeof WORKFLOW_STATE.normalizeGalleryFilter === "function") {
    return WORKFLOW_STATE.normalizeGalleryFilter(value);
  }
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "tasks" || normalized === "prompts" ? normalized : "all";
}

let galleryController = null;
let galleryDataController = null;
let galleryItemPresenter = null;
let galleryRenderController = null;
let failurePopupController = null;
let jobActionsController = null;
let jobCreateController = null;
let jobSyncController = null;
let jobsController = null;
let promptController = null;
let providerController = null;
let workflowFormController = null;
let lightboxActionsController = null;

function initGalleryRuntimeServices() {
  if (galleryController) {
    return;
  }
  galleryController = createGalleryController({
    runtime: GALLERY_RUNTIME,
    elements,
    callbacks: {
      getEntryHeight: getGalleryEntryHeight,
      getEntryColumnSpan: getGalleryEntryColumnSpan,
      renderImageCard: (entry, openIndex) => buildImageCard(entry.job, entry.image, {
        imageUrl: entry.imageUrl,
        key: entry.key,
        openIndex,
        layoutProfile: entry.layoutProfile,
      }),
      updateImageCard: syncImageCard,
      activateImageCard: activateGalleryImageCard,
      deactivateImageCard: deactivateGalleryImageCard,
    },
  });
}

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

function getJobsController() {
  if (!jobsController) {
    jobsController = createJobsController({
      maxRetained: JOBS_CLIENT_MAX_RETAINED,
      defaultPageSize: JOBS_PAGE_SIZE,
      sortJobsByCreatedDesc,
      jobStore,
    });
  }
  return jobsController;
}

function getGalleryDataController() {
  if (!galleryDataController) {
    galleryDataController = createGalleryDataController({
      maxRetained: GALLERY_CLIENT_MAX_RETAINED,
      defaultPageSize: GALLERY_PAGE_SIZE,
      getSortAsc: () => gallerySortAsc,
      galleryStore,
    });
  }
  return galleryDataController;
}

function getGalleryItemPresenter() {
  if (!galleryItemPresenter) {
    galleryItemPresenter = createGalleryItemPresenter({
      createElement,
      normalizeImageUrl,
      getGalleryPreviewUrl,
      getImageDimensions,
      getImagePlaceholder,
      createGalleryFlatItem,
      buildGalleryTerminalAction,
      getSelectionState: (jobId, slot) => gallerySelectionController.has(jobId, slot),
      isActionDisabled: (jobId) => getJobActionsController().isActionDisabled(jobId),
      imageWarmCache: galleryController.imageWarmCache,
      previewWarmCache: galleryController.previewWarmCache,
      scheduleActiveGalleryLayout,
      rememberImageMetrics: rememberGalleryImageMetrics,
    });
  }
  return galleryItemPresenter;
}

function getGalleryRenderController() {
  if (!galleryRenderController) {
    galleryRenderController = createGalleryRenderController({
      elements,
      workflowState: WORKFLOW_STATE,
      getCurrentFilter: () => currentGalleryFilter,
      setCurrentFilter: (nextFilter) => {
        currentGalleryFilter = nextFilter;
        galleryStore?.setFilter(currentGalleryFilter);
      },
      getGalleryItemsState: () => galleryItemsState,
      getGalleryPaginationState: () => galleryPaginationState,
      setGalleryItemsState: (nextItems) => {
        galleryItemsState = nextItems;
      },
      setGalleryPaginationState: (nextPagination) => {
        galleryPaginationState = nextPagination;
      },
      getGallerySortAsc: () => gallerySortAsc,
      setGallerySortAsc: (nextSortAsc) => {
        gallerySortAsc = nextSortAsc;
        galleryStore?.setSortAsc(gallerySortAsc);
      },
      getJobsState: () => jobsState,
      getFilteredJobs,
      getGalleryDataController,
      getJobSyncController,
      getSyncState: () => getJobSyncController().getState(),
      getRunningJobsCount: () => jobStore?.runningCount ?? jobsState.filter((job) => isActiveStatus(job.status)).length,
      getActiveProviderProfile: () => providerProfilesState.active_profile,
      getLoadedGalleryCountText,
      getLoadedJobCountText,
      normalizeGalleryFilter,
      syncGalleryFilterButtons,
      collectReusableGalleryCards,
      reconcileTaskGallery,
      reconcilePromptGallery,
      reconcileFlatGallery,
      renderLeftTaskList,
      renderRunningBanner,
      scheduleGalleryLayout,
      syncLightboxSelection,
      formatClock,
      formatElapsed,
      truncateText,
      refreshJobs,
    });
  }
  return galleryRenderController;
}

function getFailurePopupController() {
  if (!failurePopupController) {
    failurePopupController = createFailurePopupController({
      elements,
      formatJobFailureMessage,
      getActionBusy: (jobId) => getJobActionsController().isActionDisabled(jobId),
      getProblemJobKey,
      isProblemPopupStatus,
      isRetryableJob,
    });
  }
  return failurePopupController;
}

function getJobActionsController() {
  if (!jobActionsController) {
    jobActionsController = createJobActionsController({
      elements,
      actionTimeoutMs: ACTION_TIMEOUT_MS,
      apiRequest,
      fetch: window.fetch.bind(window),
      getGalleryFlatList: () => galleryFlatList,
      getJobById,
      getSelectedGalleryItems,
      isActiveStatus,
      isRetryableJob,
      lightboxController,
      gallerySelectionController,
      triggerImageDownload,
      truncateText,
      clearFailurePopupEntries,
      closeLightbox,
      refreshJobs,
      renderGallery,
      setStatus,
      showLightboxItem,
      syncFailurePopupActions,
    });
  }
  return jobActionsController;
}

function getJobCreateController() {
  if (!jobCreateController) {
    jobCreateController = createJobCreateController({
      elements,
      actionTimeoutMs: ACTION_TIMEOUT_MS,
      apiRequest,
      getActiveWorkflow,
      getSelectedSourceFiles,
      normalizeWorkflow,
      readOutputParamsFromUi,
      refreshJobs,
      saveActiveWorkflowForm,
      setStatus,
      syncPrimaryActionState,
    });
  }
  return jobCreateController;
}

function getJobSyncController() {
  if (!jobSyncController) {
    jobSyncController = createJobSyncController({
      apiRequest,
      jobsPageSize: JOBS_PAGE_SIZE,
      galleryPageSize: GALLERY_PAGE_SIZE,
      jobsLoadTimeoutMs: LIST_TIMEOUT_MS,
      getJobsState: () => jobsState,
      getJobsPaginationState: () => jobsPaginationState,
      getGalleryPaginationState: () => galleryPaginationState,
      getGallerySortAsc: () => gallerySortAsc,
      setJobsPaginationState: (nextState) => {
        jobsPaginationState = nextState;
      },
      setGalleryPaginationState: (nextState) => {
        galleryPaginationState = nextState;
      },
      getJobSnapshotSignature,
      getGallerySnapshotSignature,
      applyJobsPage,
      applyGalleryImagesPage,
      patchJobsPagination: (state, patch) => getJobsController().patchPagination(state, patch),
      patchGalleryPagination: (state, patch) => getGalleryDataController().patchPagination(state, patch),
      markSyncSuccess: (date) => getJobsController().markSyncSuccess(date),
      markSyncError: (error) => getJobsController().markSyncError(error),
      syncProblemPopups,
      renderGallery,
      renderLeftTaskList,
      renderRunningBanner,
      syncRenderedGalleryCardActions,
      updateSyncIndicators,
      refreshGalleryViewportEffects,
      syncLightboxSelection,
      refreshRelativeTimes,
      setStatus,
    });
  }
  return jobSyncController;
}

function getLightboxActionsController() {
  if (!lightboxActionsController) {
    lightboxActionsController = createLightboxActionsController({
      elements,
      copyToClipboard,
      findJobImage,
      lightboxController,
      normalizeImageUrl,
      setStatus,
      switchTab,
      triggerImageDownload,
    });
  }
  return lightboxActionsController;
}

function getProviderController() {
  if (!providerController) {
    providerController = createProviderController({
      apiRequest,
      providerStore,
      listTimeoutMs: LIST_TIMEOUT_MS,
      actionTimeoutMs: ACTION_TIMEOUT_MS,
    });
  }
  return providerController;
}

function getWorkflowFormController() {
  if (!workflowFormController) {
    workflowFormController = createWorkflowFormController({
      elements,
      formFieldIds: FORM_FIELD_IDS,
      outputOptions: OUTPUT_OPTIONS,
      workflowState: WORKFLOW_STATE,
      workspaceStore,
      promptStore,
      createElement,
      getSelectedSourceFiles,
      getWorkspacePanel: () => window.WorkspacePanel,
      renderSavedPrompts,
      syncPrimaryActionState,
    });
  }
  return workflowFormController;
}

function getPromptController() {
  if (!promptController) {
    promptController = createPromptController({
      elements,
      workflowState: WORKFLOW_STATE,
      outputOptions: OUTPUT_OPTIONS,
      promptStore,
      copyToClipboard,
      getActiveWorkflow,
      getWorkflowLabel,
      getJobOptionSummary,
      formatDateTime,
      normalizeWorkflow,
      readFormFromUi,
      readOutputParamsFromUi,
      saveActiveWorkflowForm,
      applyFormToUi,
      setStatus,
    });
  }
  return promptController;
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
  return jobsState.find((job) => job.id === jobId)
    || galleryItemsState.find((item) => item?.job?.id === jobId)?.job
    || null;
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
  getFailurePopupController().syncActions();
}

function showNextFailurePopup() {
  getFailurePopupController().showNext();
}

function closeFailurePopup() {
  getFailurePopupController().close();
}

function clearFailurePopupEntries(jobId) {
  getFailurePopupController().clearEntries(jobId);
}

function syncProblemPopups(jobs) {
  getFailurePopupController().syncProblemJobs(jobs);
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

function normalizeDownloadFilename(value, fallback = "image.png") {
  const filename = String(value || "").trim();
  if (!filename) {
    return fallback;
  }
  const sanitized = filename.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return sanitized || fallback;
}

async function downloadWithDesktopBridge(url, filename) {
  const api = window.pywebview?.api;
  if (!api || typeof api.download_file !== "function") {
    return false;
  }
  const result = await api.download_file(url, filename);
  if (result?.canceled) {
    return true;
  }
  if (!result?.ok) {
    throw new Error(result?.error || "桌面版保存图片失败。");
  }
  return true;
}

async function downloadWithBrowser(url, filename) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 1000);
}

async function triggerImageDownload(url, filename) {
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) {
    throw new Error("图片地址无效，无法下载。");
  }
  const normalizedFilename = normalizeDownloadFilename(filename);
  const handledByDesktop = await downloadWithDesktopBridge(normalizedUrl, normalizedFilename);
  if (handledByDesktop) {
    return;
  }
  await downloadWithBrowser(normalizedUrl, normalizedFilename);
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
    gallery: galleryItemsState.map((item) => ({
      job_id: item?.job?.id || "",
      slot: Number(item?.image?.slot || 0),
      updated_at: item?.job?.updated_at || "",
      url: item?.image?.url || "",
    })),
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
  return getWorkflowFormController().getActiveWorkflow();
}

function normalizeWorkflow(value, fallback = WORKFLOW_STATE.DEFAULT_WORKFLOW) {
  return getWorkflowFormController().normalizeWorkflow(value, fallback);
}

function isSupportedWorkflow(value) {
  return getWorkflowFormController().isSupportedWorkflow(value);
}

function syncPrimaryActionState(isBusy = false) {
  getWorkflowFormController().syncPrimaryAction(isBusy, Boolean(getJobCreateController().getInFlight()));
}

function handleWorkflowChange(name) {
  getWorkflowFormController().handleWorkflowChange(name);
}

function handleSourceFilesChange() {
  getWorkflowFormController().handleSourceFilesChange();
}

function populateOutputOptionSelects() {
  getWorkflowFormController().populateOutputOptionSelects();
}

function syncSizeOptionsForQuality(quality, preferredSize) {
  getWorkflowFormController().syncSizeOptionsForQuality(quality, preferredSize);
}

function readFormFromUi(workflow = getActiveWorkflow()) {
  return getWorkflowFormController().readFormFromUi(workflow);
}

function applyFormToUi(form, workflow = getActiveWorkflow()) {
  getWorkflowFormController().applyFormToUi(form, workflow);
}

function saveActiveWorkflowForm(workflow = getActiveWorkflow()) {
  getWorkflowFormController().saveActiveWorkflowForm(workflow);
}

function loadActiveWorkflowForm(workflow = getActiveWorkflow()) {
  getWorkflowFormController().loadActiveWorkflowForm(workflow);
}

function readOutputParamsFromUi() {
  return getWorkflowFormController().readOutputParamsFromUi();
}

function renderSavedPrompts() {
  getPromptController().render();
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
  getPromptController().saveCurrent();
}

function clearSavedPrompts() {
  getPromptController().clearSaved();
}

function applySavedPrompt(promptId) {
  getPromptController().applySaved(promptId);
}

function deleteSavedPrompt(promptId) {
  getPromptController().deleteSaved(promptId);
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
  const isBusy = Boolean(getProviderController().getInFlight());

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

  providerStore?.replaceProfiles(
    Array.isArray(providerProfilesState.profiles) ? providerProfilesState.profiles : [],
    providerProfilesState.active_profile_id || ""
  );
  window.WorkspacePanel?.syncProviderConfig(providerProfilesState.profiles.length > 0);
  const profilePicker = getProviderProfilePicker();
  if (profilePicker) {
    profilePicker.render({
      profiles: providerProfilesState.profiles,
      activeProfileId: providerProfilesState.active_profile_id,
      disabled: Boolean(getProviderController().getInFlight()) || !providerProfilesState.profiles.length,
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
    if (elements.supportsCountParameter) {
      elements.supportsCountParameter.checked = true;
    }
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
  if (elements.supportsCountParameter) {
    elements.supportsCountParameter.checked = activeProfile.supports_count_parameter !== false;
  }
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
    providerProfilesState = await getProviderController().load();
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
    providerProfilesState = await getProviderController().activate(profileId);
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
    supports_count_parameter: Boolean(elements.supportsCountParameter?.checked),
    compat_profile_id: elements.providerCompatProfile?.value || "",
    api_key: elements.apiKey.value.trim(),
  };
}

async function saveProviderProfile() {
  if (getProviderController().getInFlight()) {
    return getProviderController().getInFlight();
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

  const operation = (async () => {
    try {
      providerProfilesState = await getProviderController().save(selectedProfile.id, payload);
      renderProviderProfiles();
      updateSyncIndicators();
      setStatus("success", "当前配置已保存。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Save provider profile failed:", error);
      setStatus("error", error.message);
    } finally {
      syncProviderProfileActionState();
    }
  })();
  syncProviderProfileActionState();

  return operation;
}

async function saveAsProviderProfile() {
  if (getProviderController().getInFlight()) {
    return getProviderController().getInFlight();
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
  const operation = (async () => {
    try {
      providerProfilesState = await getProviderController().create(payload);
      renderProviderProfiles();
      updateSyncIndicators();
      setStatus("success", "新配置已保存，并已切换为当前配置。", { timeoutMs: 2400 });
    } catch (error) {
      console.error("Create provider profile failed:", error);
      setStatus("error", error.message);
    } finally {
      syncProviderProfileActionState();
    }
  })();
  syncProviderProfileActionState();

  return operation;
}

async function deleteProviderProfile(profileId) {
  if (getProviderController().getInFlight()) {
    return getProviderController().getInFlight();
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

  const operation = (async () => {
    try {
      providerProfilesState = await getProviderController().remove(targetProfile.id);
      renderProviderProfiles();
      updateSyncIndicators();
      setStatus("success", "配置已删除。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Delete provider profile failed:", error);
      setStatus("error", error.message);
    } finally {
      syncProviderProfileActionState();
    }
  })();
  syncProviderProfileActionState();

  return operation;
}

async function cleanupEmptyGeneratedDirs() {
  return getJobActionsController().cleanupEmptyGeneratedDirs();
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
  const sourceJobs = galleryItemsState.length ? buildGalleryJobsFromItems(galleryItemsState) : jobsState;
  const sortedJobs = sourceJobs
    .filter((job) => Array.isArray(job.images) && job.images.length > 0)
    .sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return gallerySortAsc ? leftTime - rightTime : rightTime - leftTime;
    });
  return sortedJobs;
}

function buildGalleryJobsFromItems(items) {
  const jobMap = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const job = item?.job;
    const image = item?.image;
    if (!job?.id || !image) {
      return;
    }
    if (!jobMap.has(job.id)) {
      jobMap.set(job.id, {
        ...job,
        images: [],
      });
    }
    jobMap.get(job.id).images.push(image);
  });
  return Array.from(jobMap.values()).map((job) => ({
    ...job,
    images: getSortedJobImages(job),
  }));
}

function getLoadedJobCountText() {
  const total = Number(jobsPaginationState.total || 0);
  const loaded = jobsState.length;
  if (total > loaded) {
    return `已加载 ${loaded}/${total} 个任务`;
  }
  return `${loaded} 个任务`;
}

function getLoadedGalleryCountText() {
  const total = Number(galleryPaginationState.total || 0);
  const loaded = galleryItemsState.length;
  if (total > loaded) {
    return `图库已加载 ${loaded}/${total} 张`;
  }
  return `${loaded} 张图片`;
}

function buildJobsPageUrl(offset, limit, cursor = "") {
  return getJobSyncController().buildJobsPageUrl(offset, limit, cursor);
}

function buildGalleryImagesPageUrl(limit, cursor = "") {
  return getJobSyncController().buildGalleryImagesPageUrl(limit, cursor);
}

function sortJobsByCreatedDesc(jobs) {
  return [...jobs].sort((left, right) => {
    const leftTime = new Date(left.created_at || left.updated_at || 0).getTime();
    const rightTime = new Date(right.created_at || right.updated_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function applyJobsPage(payload, options = {}) {
  const nextState = getJobsController().applyPage(jobsState, jobsPaginationState, payload, options);
  jobsState = nextState.jobs;
  jobsPaginationState = nextState.pagination;
}

function applyGalleryImagesPage(payload, options = {}) {
  const nextState = getGalleryDataController().applyImagesPage(galleryItemsState, galleryPaginationState, payload, options);
  galleryItemsState = nextState.items;
  galleryPaginationState = nextState.pagination;
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
  const button = getGalleryItemPresenter().createActionButton(label, action, jobId, extraClassName);
  button.disabled = getJobActionsController().isActionDisabled(jobId);
  return button;
}

async function downloadGalleryImage(jobId, slot, triggerButton = null) {
  return getJobActionsController().downloadGalleryImage(jobId, slot, triggerButton);
}

function createGalleryTimeNode(value) {
  return getGalleryItemPresenter().createGalleryTimeNode(value);
}

function handleGalleryImageLoaded(card, imageNode) {
  if (!card || !imageNode) {
    return;
  }
  rememberGalleryImageMetrics(card, imageNode);
  galleryController.imageWarmCache.markLoaded(imageNode.dataset.src || imageNode.currentSrc || imageNode.src, imageNode);
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
  galleryHoverController.bind(card);
  galleryController.imageLoader.register(card);
}

function deactivateGalleryImageCard(card) {
  galleryHoverController.unbind(card);
  galleryController.imageLoader.unregister?.(card);
}

function isVirtualGalleryActive() {
  return currentGalleryFilter === "all";
}

function scheduleActiveGalleryLayout() {
  if (isVirtualGalleryActive()) {
    galleryController.virtualMasonry.scheduleRefresh();
    return;
  }
  galleryController.masonryLayout.scheduleRefresh(elements.galleryArea);
}

function refreshGalleryViewportEffects(options = {}) {
  const { refreshLayout = false, refreshLoader = false } = options;
  if (refreshLayout) {
    scheduleActiveGalleryLayout();
  }
  window.requestAnimationFrame(() => {
    if (refreshLoader) {
      galleryController.imageLoader.refresh();
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
    galleryController.imageLoader.refresh();
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

function getSelectedGalleryItems() {
  return gallerySelectionController.getSelectedItems();
}

function clearGallerySelection() {
  gallerySelectionController.clear({ syncCards: true });
}

function finishGallerySelectionGesture() {
  gallerySelectionController.finishGesture();
}

function initGalleryInteractionArchitecture() {
  if (!galleryLayoutCoordinator) {
    galleryLayoutCoordinator = new GALLERY_LAYOUT.GalleryLayoutCoordinator({
      nodes: [document.querySelector(".app"), elements.galleryArea, elements.galleryWindowShell, elements.galleryWindow],
      onLayout: () => scheduleActiveGalleryLayout(),
      onRefresh: () => galleryController.imageLoader.refresh(),
    });
    galleryLayoutCoordinator.start();
  }

  if (!galleryEdgeSelection) {
    galleryEdgeSelection = new GALLERY_LAYOUT.GalleryEdgeSelectionController({
      shell: elements.galleryWindowShell,
      windowNode: elements.galleryWindow,
      selectionBox: elements.selectionBox,
      getInitialKeys: () => gallerySelectionController.snapshot(),
      previewSelection: gallerySelectionController.previewRectSelection,
      clearSelection: clearGallerySelection,
      finishSelection: finishGallerySelectionGesture,
    });
    galleryEdgeSelection.start();
  }
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
  return getGalleryItemPresenter().applyImageDimensions?.(imageNode, image);
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
  previewNode.addEventListener("load", () => galleryController.previewWarmCache.markLoaded(previewUrl, previewNode), { once: true });
  previewNode.addEventListener("error", () => previewNode.classList.add("is-error"), { once: true });
  previewNode.dataset.previewSrc = previewUrl;
  previewNode.fetchPriority = galleryController.previewWarmCache.isReady(previewUrl) ? "auto" : "high";
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
  getGalleryItemPresenter().syncCard(card, entry, openIndex);
}

function resetGalleryCardLayoutStyle(card) {
  getGalleryItemPresenter().resetLayoutStyle(card);
}

function buildImageCard(job, image, options = {}) {
  return getGalleryItemPresenter().buildCard(job, image, {
    ...options,
    registerFlatItem: (item) => galleryFlatList.push(item) - 1,
  });
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

function buildGallerySectionShell(options = {}) {
  const section = createElement("section", "gallery-task-section");
  section.dataset.groupType = String(options.groupType || "");
  section.dataset.groupKey = String(options.groupKey || "");
  const head = createElement("div", "gallery-task-section-head");
  const title = createElement("div", "gallery-task-section-title", options.titleText || "");
  const meta = createElement("div", "gallery-task-section-meta", options.metaText || "");
  const grid = createElement("div", "gallery-task-section-grid");

  head.append(title, meta);
  section.append(head, grid);
  return section;
}

function syncGallerySectionShell(section, options = {}) {
  section.dataset.groupType = String(options.groupType || "");
  section.dataset.groupKey = String(options.groupKey || "");
  const title = section.querySelector(".gallery-task-section-title");
  const meta = section.querySelector(".gallery-task-section-meta");
  if (title) {
    title.textContent = options.titleText || "";
  }
  if (meta) {
    meta.textContent = options.metaText || "";
  }
}

function buildTaskGallerySectionShell(job) {
  return buildGallerySectionShell({
    groupType: "task",
    groupKey: job.id || "",
    titleText: GALLERY_GROUPING.normalizePromptText(job.prompt),
    metaText: `${getWorkflowLabel(job.workflow)} · ${getJobProgressText(job)} · ${formatDateTime(job.updated_at || job.created_at)}`,
  });
}

function syncTaskGallerySection(section, job) {
  syncGallerySectionShell(section, {
    groupType: "task",
    groupKey: job.id || "",
    titleText: GALLERY_GROUPING.normalizePromptText(job.prompt),
    metaText: `${getWorkflowLabel(job.workflow)} · ${getJobProgressText(job)} · ${formatDateTime(job.updated_at || job.created_at)}`,
  });
}

function buildPromptGallerySectionShell(group) {
  return buildGallerySectionShell({
    groupType: "prompt",
    groupKey: group.key,
    titleText: group.prompt,
    metaText: `${group.jobCount} 个任务 · ${group.imageCount} 张图片 · 最近更新 ${formatDateTime(group.latestUpdatedAt)}`,
  });
}

function syncPromptGallerySection(section, group) {
  syncGallerySectionShell(section, {
    groupType: "prompt",
    groupKey: group.key,
    titleText: group.prompt,
    metaText: `${group.jobCount} 个任务 · ${group.imageCount} 张图片 · 最近更新 ${formatDateTime(group.latestUpdatedAt)}`,
  });
}

function collectExistingGallerySections(groupType) {
  if (elements.galleryGrid.classList.contains("is-virtualized")) {
    galleryController.virtualMasonry.clear();
  }
  const existingSections = new Map();
  elements.galleryGrid.querySelectorAll(`.gallery-task-section[data-group-type="${groupType}"]`).forEach((section) => {
    const groupKey = section.dataset.groupKey || "";
    if (groupKey && !existingSections.has(groupKey)) {
      existingSections.set(groupKey, section);
    }
  });
  return existingSections;
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
  getGalleryDataController().replaceFlatItems(galleryFlatList);
  warmGalleryEntries(entries);
  galleryController.virtualMasonry.setItems(entries);
  return entries.length;
}

function warmGalleryEntries(entries) {
  const visiblePriorityEntries = entries.slice(0, GALLERY_PREVIEW_WARM_BATCH_SIZE);
  galleryController.previewWarmCache.warm(visiblePriorityEntries.map((entry) => entry.previewUrl), { immediate: true });
}

function syncGalleryFilterButtons(activeFilter) {
  const normalizedFilter = normalizeGalleryFilter(activeFilter);
  document.querySelectorAll(".gallery-filter button[data-gallery-filter]").forEach((node) => {
    node.classList.toggle("active", node.dataset.galleryFilter === normalizedFilter);
  });
}

function reconcileTaskGallery(jobs, reusableCards) {
  const existingSections = collectExistingGallerySections("task");

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
  getGalleryDataController().replaceFlatItems(allEntries.map((entry) => entry.flatItem));
  elements.galleryGrid.replaceChildren(...sections);
  return renderedCards;
}

function reconcilePromptGallery(jobs, reusableCards) {
  const promptGroups = GALLERY_GROUPING.groupJobsByPrompt(jobs);
  const existingSections = collectExistingGallerySections("prompt");

  const sections = [];
  const allEntries = [];
  let renderedCards = 0;

  promptGroups.forEach((promptGroup) => {
    const entries = [];
    promptGroup.jobs.forEach((job) => {
      getSortedJobImages(job).forEach((image) => {
        const entry = createGalleryImageEntry(job, image);
        if (entry) {
          entries.push(entry);
        }
      });
    });
    if (!entries.length) {
      return;
    }

    assignGalleryLayoutProfiles(entries, { allowFeatured: false });
    allEntries.push(...entries);

    const group = {
      ...promptGroup,
      jobCount: promptGroup.jobs.length,
      imageCount: entries.length,
    };
    const section = existingSections.get(group.key) || buildPromptGallerySectionShell(group);
    const grid = section.querySelector(".gallery-task-section-grid");
    syncPromptGallerySection(section, group);
    renderedCards += reconcileImageGrid(grid, entries, reusableCards);
    sections.push(section);
  });

  warmGalleryEntries(allEntries);
  getGalleryDataController().replaceFlatItems(allEntries.map((entry) => entry.flatItem));
  elements.galleryGrid.replaceChildren(...sections);
  return {
    renderedCards,
    groupCount: sections.length,
  };
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
  refreshRelativeTimes();
}

function renderLeftTaskList() {
  refreshRelativeTimes();
}

function updateSyncIndicators() {
  getGalleryRenderController().updateSyncIndicators();
}

function renderGallery() {
  galleryFlatList = [];
  getGalleryRenderController().renderGallery();
}

function refreshRelativeTimes() {
  getGalleryRenderController().refreshRelativeTimes();
}

function filterGallery(type) {
  getGalleryRenderController().filterGallery(type);
}

function toggleSort() {
  getGalleryRenderController().toggleSort();
}

function applyLightboxZoom() {
  lightboxController.setZoom(lightboxController.getZoomScale());
}

function resetLightboxZoom() {
  lightboxController.resetZoom();
}

function setLightboxZoom(nextScale) {
  lightboxController.setZoom(nextScale);
}

function zoomLightboxBy(delta) {
  lightboxController.zoomBy(delta);
}

function resolveLightboxIndex(index, selection = {}) {
  return lightboxController.resolveIndex(index, selection);
}

function showLightboxItem(index) {
  return lightboxController.showItem(index);
}

function openLightbox(index, selection = {}) {
  lightboxController.open(index, selection);
}

function closeLightbox() {
  lightboxController.close();
}

function syncLightboxSelection() {
  lightboxController.syncSelection();
}

function lightboxNav(direction) {
  lightboxController.nav(direction);
}

function startLightboxPan(event) {
  lightboxController.startPan(event);
}

function updateLightboxPan(event) {
  lightboxController.updatePan(event);
}

function stopLightboxPan(event) {
  lightboxController.stopPan(event);
}

function handleLightboxWheel(event) {
  lightboxController.handleWheel(event);
}

function copyPrompt() {
  getLightboxActionsController().copyPrompt();
}

async function downloadLightboxImage() {
  return getLightboxActionsController().downloadLightboxImage();
}

function findJobImage(jobId, slot) {
  return getJobActionsController().findJobImage(jobId, slot);
}

async function addGalleryImageToSource(jobId, slot) {
  return getLightboxActionsController().addGalleryImageToSource(jobId, slot);
}

async function addLightboxImageToSource() {
  return getLightboxActionsController().addLightboxImageToSource();
}

async function deleteJob(jobId) {
  return getJobActionsController().deleteJob(jobId);
}

async function deleteImage(jobId, slot) {
  return getJobActionsController().deleteImage(jobId, slot);
}

async function batchDownloadSelectedImages() {
  return getJobActionsController().batchDownloadSelectedImages();
}

async function batchDeleteSelectedImages() {
  return getJobActionsController().batchDeleteSelectedImages();
}

function clearBatchSelection() {
  gallerySelectionController.clear();
  renderGallery();
}

async function cancelJob(jobId) {
  return getJobActionsController().cancelJob(jobId);
}

async function retryJob(jobId) {
  return getJobActionsController().retryJob(jobId);
}

async function deleteLightboxImage() {
  const item = lightboxController.getCurrentItem();
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

function submitActiveWorkflow(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const workflow = event?.currentTarget?.dataset.workflow || getActiveWorkflow();
  generate(workflow);
}

async function generate(workflowOverride) {
  return getJobCreateController().generate(workflowOverride);
}

async function refreshJobs(options = {}) {
  return getJobSyncController().refreshJobs(options);
}

async function loadMoreJobs(options = {}) {
  return getJobSyncController().loadMoreJobs(options);
}

async function loadMoreGalleryImages(options = {}) {
  return getJobSyncController().loadMoreGalleryImages(options);
}

function maybeLoadMoreJobsFromScroll(root) {
  if (!root || jobsPaginationState.isLoadingMore || !jobsPaginationState.hasMore) {
    return;
  }
  const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
  if (remaining <= JOBS_LOAD_MORE_THRESHOLD_PX) {
    loadMoreJobs({ source: "scroll", silent: true });
    loadMoreGalleryImages({ source: "scroll", silent: true });
  }
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
  if (action === "download-image") {
    void downloadGalleryImage(jobId, Number(actionButton.dataset.slot || 0), actionButton);
    return;
  }
  if (action === "delete-job") {
    deleteJob(jobId);
    return;
  }
  if (action === "delete-image") {
    deleteImage(jobId, Number(actionButton.dataset.slot || 0));
    return;
  }
  if (action === "toggle-image-selection") {
    gallerySelectionController.toggle(jobId, Number(actionButton.dataset.slot || 0));
    actionButton.blur?.();
    renderGallery();
  }
}

function bindEvents() {
  bindAppEvents({
    document,
    elements,
    formFieldIds: FORM_FIELD_IDS,
    lightboxZoomMin: LIGHTBOX_ZOOM_MIN,
    lightboxZoomStep: LIGHTBOX_ZOOM_STEP,
    workflowState: WORKFLOW_STATE,
    getLightboxZoomScale: () => lightboxController.getZoomScale(),
    getTaskListRenderFrame: () => taskListRenderFrame,
    setTaskListRenderFrame: (nextFrame) => {
      taskListRenderFrame = nextFrame;
    },
    callbacks: {
      activateProviderProfile,
      addLightboxImageToSource,
      applySavedPrompt,
      batchDeleteSelectedImages,
      batchDownloadSelectedImages,
      cleanupEmptyGeneratedDirs,
      clearBatchSelection,
      clearSavedPrompts,
      closeFailurePopup,
      closeLightbox,
      copyPrompt,
      copySavedPrompt: (promptId, button) => getPromptController().copySaved(promptId, button),
      deleteJob,
      deleteLightboxImage,
      deleteSavedPrompt,
      downloadLightboxImage,
      filterGallery,
      handleJobAction,
      handleLightboxWheel,
      initGalleryInteractionArchitecture,
      lightboxNav,
      loadMoreJobs,
      maybeLoadMoreJobsFromScroll,
      openLightbox,
      refreshGallery,
      refreshGalleryViewportEffects,
      refreshJobs,
      renderLeftTaskList,
      resetFormState,
      resetLightboxZoom,
      retryJob,
      saveActiveWorkflowForm,
      saveAsProviderProfile,
      saveCurrentPrompt,
      saveProviderProfile,
      setLightboxZoom,
      startLightboxPan,
      stopLightboxPan,
      submitActiveWorkflow,
      syncSizeOptionsForQuality,
      toggleApiKeyVisibility: () => {
        isApiKeyVisible = !isApiKeyVisible;
        syncApiKeyVisibilityUi();
      },
      toggleSettingsPanel,
      toggleSort,
      updateLightboxPan,
      zoomLightboxBy,
    },
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
  currentGalleryFilter = normalizeGalleryFilter(WORKFLOW_STATE.readGalleryFilter?.());
  syncGalleryFilterButtons(currentGalleryFilter);
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

function exposeLegacyGlobals() {
  Object.assign(window, {
    saveProviderProfile,
    saveAsProviderProfile,
    cleanupEmptyGeneratedDirs,
    clearSavedPrompts,
    resetFormState,
    filterGallery,
    toggleSort,
    toggleSettingsPanel,
    refreshGallery,
    closeLightbox,
    lightboxNav,
    copyPrompt,
    addLightboxImageToSource,
    downloadLightboxImage,
    deleteLightboxImage,
  });
}

async function init() {
  await WORKFLOW_STATE.init({ apiRequest });
  populateOutputOptionSelects();
  bindEvents();
  hydrateStaticUi();
  await loadProviderProfiles({ silent: true });
  updateSyncIndicators();
  await refreshJobs({ silent: true });
  startTimers();
}

export async function initScimageController() {
  await loadLegacyModulesAfterVueMount();
  initControllerStores();
  exposeLegacyGlobals();
  await init();
}
