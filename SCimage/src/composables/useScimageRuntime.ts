import { computed, nextTick, reactive, ref } from "vue";
import { useGalleryStore, type GalleryFilter, type GalleryFlatItem } from "../stores/gallery";
import { useJobStore, type JobSummary } from "../stores/jobs";
import { usePromptStore, type SavedPrompt } from "../stores/prompts";
import { useProviderStore, type ProviderProfilesState } from "../stores/provider";
import { useWorkspaceStore, type WorkflowName } from "../stores/workspace";
import { useConfirmDialog } from "./useConfirmDialog";
import { usePromptLibraryDialog } from "./usePromptLibraryDialog";

type StatusTone = "loading" | "success" | "error" | "";

interface WorkspaceForm {
  prompt: string;
  size: string;
  quality: string;
  count: string;
}

interface SourceImageItem {
  key: string;
  file: File;
  url: string;
  name: string;
}

interface LightboxState {
  open: boolean;
  index: number;
  zoom: number;
  panX: number;
  panY: number;
  dragging: boolean;
  dragStartX: number;
  dragStartY: number;
  startPanX: number;
  startPanY: number;
}

interface FailurePopupState {
  open: boolean;
  jobId: string;
  prompt: string;
  message: string;
  retryable: boolean;
  queue: Array<{
    jobId: string;
    prompt: string;
    message: string;
    retryable: boolean;
  }>;
  seenKeys: Set<string>;
  ready: boolean;
}

const ACTIVE_STATUSES = new Set(["queued", "running", "canceling"]);
const RETRYABLE_STATUSES = new Set(["failed", "canceled"]);

const sizeOptions = [
  { value: "1024x1024", label: "1024 x 1024" },
  { value: "1024x1536", label: "1024 x 1536" },
  { value: "1536x1024", label: "1536 x 1024" },
  { value: "auto", label: "自动" },
];

const qualityOptions = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

const forms = reactive<Record<WorkflowName, WorkspaceForm>>({
  generate: { prompt: "", size: "auto", quality: "auto", count: "1" },
  "image-to-image": { prompt: "", size: "auto", quality: "auto", count: "1" },
});

const status = reactive({ tone: "" as StatusTone, message: "" });
const sourceImages = ref<SourceImageItem[]>([]);
const providerForm = reactive({
  name: "",
  base_url: "",
  api_key: "",
  model: "",
  compat_profile_id: "",
  supports_count_parameter: true,
});
const modelPicker = reactive({
  loading: false,
  message: "",
  options: [] as Array<{ id: string; label: string }>,
});
const lightbox = reactive<LightboxState>({
  open: false,
  index: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  startPanX: 0,
  startPanY: 0,
});
const failurePopup = reactive<FailurePopupState>({
  open: false,
  jobId: "",
  prompt: "",
  message: "",
  retryable: false,
  queue: [],
  seenKeys: new Set(),
  ready: false,
});

let initialized = false;
let pollTimer = 0;
let statusTimer = 0;
let refreshInFlight: Promise<void> | null = null;
let createJobInFlight: Promise<unknown> | null = null;
const busyJobIds = ref(new Set<string>());

type ApiRequestOptions = Omit<RequestInit, "body"> & { body?: unknown; timeoutMs?: number };

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  const headers = new Headers(options.headers || {});
  let body = options.body as BodyInit | null | undefined;
  if (body && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    const response = await fetch(path, { ...fetchOptions, headers, body, signal: controller.signal });
    const contentType = response.headers.get("Content-Type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error((payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "") || response.statusText);
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function setStatus(tone: StatusTone, message: string, timeoutMs = 0) {
  window.clearTimeout(statusTimer);
  status.tone = tone;
  status.message = message;
  if (timeoutMs) {
    statusTimer = window.setTimeout(() => {
      status.tone = "";
      status.message = "";
    }, timeoutMs);
  }
}

function imageKey(jobId: string, slot: number) {
  return `${jobId}:${Number(slot || 0)}`;
}

function normalizeImageUrl(url = "") {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function sortJobs(jobs: JobSummary[]) {
  return [...jobs].sort((left, right) => {
    const leftTime = new Date(String(left.created_at || left.updated_at || 0)).getTime();
    const rightTime = new Date(String(right.created_at || right.updated_at || 0)).getTime();
    return rightTime - leftTime;
  });
}

function syncProviderForm() {
  const providerStore = useProviderStore();
  const active = providerStore.activeProfile;
  providerForm.name = active?.name || "";
  providerForm.base_url = active?.base_url || "";
  providerForm.model = active?.model || "";
  providerForm.compat_profile_id = active?.compat_profile_id || providerStore.compatProfiles[0]?.id || "";
  providerForm.supports_count_parameter = active?.supports_count_parameter !== false;
  providerForm.api_key = "";
}

function normalizeProviderState(payload: ProviderProfilesState): ProviderProfilesState {
  return {
    active_profile_id: payload?.active_profile_id || null,
    compat_profiles: Array.isArray(payload?.compat_profiles) ? payload.compat_profiles : [],
    profiles: Array.isArray(payload?.profiles) ? payload.profiles : [],
    active_profile: payload?.active_profile || null,
    is_ready: Boolean(payload?.is_ready),
  };
}

async function loadProviderProfiles() {
  const providerStore = useProviderStore();
  providerStore.setLoading(true);
  try {
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>("/api/provider-profiles", { method: "GET" }));
    providerStore.replaceState(payload);
    syncProviderForm();
  } finally {
    providerStore.setLoading(false);
  }
}

async function activateProviderProfile(profileId: string) {
  if (!profileId) return;
  const providerStore = useProviderStore();
  providerStore.setSaving(true);
  try {
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(`/api/provider-profiles/${profileId}/activate`, { method: "POST" }));
    providerStore.replaceState(payload);
    syncProviderForm();
    setStatus("success", "已切换当前配置。", 1800);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    providerStore.setSaving(false);
  }
}

function providerPayload() {
  const payload: Record<string, unknown> = {
    name: providerForm.name.trim(),
    base_url: providerForm.base_url.trim(),
    model: providerForm.model.trim(),
    supports_count_parameter: providerForm.supports_count_parameter,
    compat_profile_id: providerForm.compat_profile_id,
  };
  if (providerForm.api_key.trim()) payload.api_key = providerForm.api_key.trim();
  return payload;
}

async function saveProviderProfile(asNew = false) {
  const providerStore = useProviderStore();
  providerStore.setSaving(true);
  try {
    const selectedId = providerStore.activeProfileId;
    if (!asNew && !selectedId) {
      setStatus("error", "请先另存为新配置。", 2200);
      return;
    }
    const path = asNew ? "/api/provider-profiles" : `/api/provider-profiles/${selectedId}`;
    const method = asNew ? "POST" : "PUT";
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(path, { method, body: providerPayload() }));
    providerStore.replaceState(payload);
    syncProviderForm();
    setStatus("success", asNew ? "新配置已保存。" : "当前配置已保存。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    providerStore.setSaving(false);
  }
}

async function deleteProviderProfile(profileId: string) {
  if (!profileId) return;
  const confirmed = await useConfirmDialog().confirm({
    title: "删除 API 配置",
    description: "这个 API 配置会从本地保存列表中移除，当前正在使用它时也会同步切换到下一个可用配置。",
    confirmText: "删除配置",
    tone: "danger",
  });
  if (!confirmed) return;
  const providerStore = useProviderStore();
  providerStore.setSaving(true);
  try {
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(`/api/provider-profiles/${profileId}`, { method: "DELETE" }));
    providerStore.replaceState(payload);
    syncProviderForm();
    setStatus("success", "配置已删除。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    providerStore.setSaving(false);
  }
}

async function loadModels() {
  modelPicker.loading = true;
  modelPicker.message = "正在拉取模型...";
  try {
    const payload = await apiRequest<{ models?: Array<{ id?: string; label?: string }>; data?: Array<{ id?: string; label?: string }> }>("/api/provider-profiles/models", {
      method: "POST",
      body: { base_url: providerForm.base_url, api_key: providerForm.api_key },
      timeoutMs: 30000,
    });
    const models = payload.models || payload.data || [];
    modelPicker.options = models.map((model) => ({ id: String(model.id || ""), label: String(model.label || model.id || "") })).filter((model) => model.id);
    modelPicker.message = modelPicker.options.length ? `已拉取 ${modelPicker.options.length} 个模型。` : "没有返回可用模型。";
  } catch (error) {
    modelPicker.message = error instanceof Error ? error.message : String(error);
  } finally {
    modelPicker.loading = false;
  }
}

async function loadWorkspaceState() {
  try {
    const payload = await apiRequest<any>("/api/workspace-state", { method: "GET" });
    const workspaceStore = useWorkspaceStore();
    const promptStore = usePromptStore();
    const active = payload?.active_workflow === "image-to-image" ? "image-to-image" : "generate";
    workspaceStore.setWorkflow(active);
    (["generate", "image-to-image"] as WorkflowName[]).forEach((workflow) => {
      const form = payload?.forms?.[workflow] || {};
      forms[workflow].prompt = String(form.prompt || "");
      forms[workflow].size = String(form.size || "auto");
      forms[workflow].quality = String(form.quality || "auto");
      forms[workflow].count = String(form.count || "1");
    });
    promptStore.replacePrompts(Array.isArray(payload?.saved_prompts) ? payload.saved_prompts : []);
    const filter = payload?.ui?.gallery?.filter;
    if (filter === "tasks" || filter === "prompts" || filter === "all") {
      useGalleryStore().setFilter(filter);
    }
  } catch {
    // Workspace state is a convenience cache; the app can run without it.
  }
}

async function persistWorkspaceState() {
  const workspaceStore = useWorkspaceStore();
  const promptStore = usePromptStore();
  const galleryStore = useGalleryStore();
  await apiRequest("/api/workspace-state", {
    method: "PUT",
    body: {
      active_workflow: workspaceStore.activeWorkflow,
      forms,
      saved_prompts: promptStore.prompts,
      ui: { gallery: { filter: galleryStore.filter } },
    },
  }).catch(() => undefined);
}

function currentForm() {
  return forms[useWorkspaceStore().activeWorkflow];
}

function setWorkflow(workflow: WorkflowName) {
  const providerStore = useProviderStore();
  const compat = providerStore.compatProfiles.find((item) => item.id === providerStore.activeProfile?.compat_profile_id);
  if (workflow === "image-to-image" && compat && compat.supports_image_to_image === false) {
    setStatus("error", "当前提供方配置不支持图生图。", 2400);
    return;
  }
  useWorkspaceStore().setWorkflow(workflow);
  usePromptStore().setActiveWorkflow(workflow);
  void persistWorkspaceState();
}

function addSourceFiles(files: Iterable<File>) {
  const next = [...sourceImages.value];
  Array.from(files).forEach((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (next.some((item) => item.key === key)) return;
    next.push({ key, file, name: file.name, url: URL.createObjectURL(file) });
  });
  sourceImages.value = next;
  useWorkspaceStore().setSourceFileCount(next.length);
}

function removeSourceImage(key: string) {
  const target = sourceImages.value.find((item) => item.key === key);
  if (target) URL.revokeObjectURL(target.url);
  sourceImages.value = sourceImages.value.filter((item) => item.key !== key);
  useWorkspaceStore().setSourceFileCount(sourceImages.value.length);
}

async function addSourceImageFromGallery(item: GalleryFlatItem) {
  const response = await fetch(item.src);
  const blob = await response.blob();
  const file = new File([blob], item.filename || "reference.png", { type: blob.type || "image/png" });
  addSourceFiles([file]);
  setWorkflow("image-to-image");
  setStatus("success", "已加入图生图参考图。", 2200);
}

function applyJobsPage(payload: any) {
  const jobStore = useJobStore();
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  jobStore.replaceJobs(sortJobs(jobs));
  jobStore.patchPagination({
    total: Number(payload?.total || jobs.length),
    hasMore: Boolean(payload?.has_more),
    pageSize: Number(payload?.page_size || jobStore.pagination.pageSize),
    nextOffset: Number(payload?.next_offset || jobs.length),
    nextCursor: String(payload?.next_cursor || ""),
    isLoadingMore: false,
  });
}

function galleryItemFromPayload(item: any): GalleryFlatItem | null {
  const job = item.job || item;
  const image = item.image || item;
  const jobId = String(job.id || item.job_id || "");
  const slot = Number(image.slot || item.slot || 0);
  const url = normalizeImageUrl(String(image.url || item.url || ""));
  if (!jobId || !url) return null;
  return {
    src: url,
    previewSrc: normalizeImageUrl(String(image.preview?.url || image.preview_url || url)),
    prompt: String(job.prompt || item.prompt || ""),
    filename: String(image.name || item.name || `image-${slot || 1}.png`),
    jobId,
    slot,
  };
}

function applyGalleryPage(payload: any, append = false) {
  const galleryStore = useGalleryStore();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const flatItems = items.map(galleryItemFromPayload).filter(Boolean) as GalleryFlatItem[];
  galleryStore.replacePageItems(append ? [...galleryStore.pageItems, ...items] : items);
  galleryStore.replaceFlatItems(append ? [...galleryStore.flatItems, ...flatItems] : flatItems);
  galleryStore.patchPagination({
    total: Number(payload?.total || flatItems.length),
    hasMore: Boolean(payload?.has_more),
    pageSize: Number(payload?.page_size || galleryStore.pagination.pageSize),
    nextCursor: String(payload?.next_cursor || ""),
    isLoadingMore: false,
  });
}

function syncProblemPopups(jobs: JobSummary[]) {
  const failed = jobs.filter((job) => String(job.status || "") === "failed");
  if (!failurePopup.ready) {
    failed.forEach((job) => failurePopup.seenKeys.add(`${job.id}:${job.updated_at || ""}`));
    failurePopup.ready = true;
    return;
  }
  failed.forEach((job) => {
    const key = `${job.id}:${job.updated_at || ""}`;
    if (failurePopup.seenKeys.has(key)) return;
    failurePopup.seenKeys.add(key);
    failurePopup.queue.push({
      jobId: String(job.id || ""),
      prompt: String(job.prompt || ""),
      message: String(job.error || job.message || "生成失败。"),
      retryable: isRetryableJob(job),
    });
  });
  showNextFailurePopup();
}

function showNextFailurePopup() {
  if (failurePopup.open || !failurePopup.queue.length) return;
  const next = failurePopup.queue.shift();
  if (!next) return;
  failurePopup.jobId = next.jobId;
  failurePopup.prompt = next.prompt;
  failurePopup.message = next.message;
  failurePopup.retryable = next.retryable;
  failurePopup.open = true;
}

function closeFailurePopup() {
  failurePopup.open = false;
  failurePopup.jobId = "";
  window.setTimeout(showNextFailurePopup, 120);
}

async function refreshJobs(options: { silent?: boolean; reset?: boolean; manual?: boolean } = {}) {
  if (refreshInFlight) return refreshInFlight;
  const jobStore = useJobStore();
  const galleryStore = useGalleryStore();
  refreshInFlight = (async () => {
    try {
      const [jobsPayload, galleryPayload] = await Promise.all([
        apiRequest<any>(`/api/jobs?offset=0&limit=${jobStore.pagination.pageSize || 80}`, { method: "GET" }),
        apiRequest<any>(`/api/gallery/images?limit=${galleryStore.pagination.pageSize || 160}&sort=${galleryStore.sortAsc ? "asc" : "desc"}`, { method: "GET" }),
      ]);
      applyJobsPage(jobsPayload);
      applyGalleryPage(galleryPayload, false);
      jobStore.markSyncSuccess(new Date());
      syncProblemPopups(jobStore.jobs);
      if (options.manual) setStatus("success", "已刷新。", 1800);
    } catch (error) {
      jobStore.markSyncError(error);
      if (!options.silent) setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function loadMoreJobs() {
  const jobStore = useJobStore();
  if (jobStore.pagination.isLoadingMore || !jobStore.pagination.hasMore) return;
  jobStore.patchPagination({ isLoadingMore: true });
  try {
    const payload = await apiRequest<any>(`/api/jobs?offset=${jobStore.pagination.nextOffset}&limit=${jobStore.pagination.pageSize}&cursor=${encodeURIComponent(jobStore.pagination.nextCursor)}`, { method: "GET" });
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    jobStore.replaceJobs(sortJobs([...jobStore.jobs, ...jobs]));
    jobStore.patchPagination({
      total: Number(payload?.total || jobStore.jobs.length),
      hasMore: Boolean(payload?.has_more),
      nextOffset: Number(payload?.next_offset || jobStore.jobs.length),
      nextCursor: String(payload?.next_cursor || ""),
      isLoadingMore: false,
    });
  } catch (error) {
    jobStore.markSyncError(error);
    jobStore.patchPagination({ isLoadingMore: false });
  }
}

async function loadMoreGallery() {
  const galleryStore = useGalleryStore();
  if (galleryStore.pagination.isLoadingMore || !galleryStore.pagination.hasMore) return;
  galleryStore.patchPagination({ isLoadingMore: true });
  try {
    const payload = await apiRequest<any>(`/api/gallery/images?limit=${galleryStore.pagination.pageSize}&cursor=${encodeURIComponent(galleryStore.pagination.nextCursor)}&sort=${galleryStore.sortAsc ? "asc" : "desc"}`, { method: "GET" });
    applyGalleryPage(payload, true);
  } catch {
    galleryStore.patchPagination({ isLoadingMore: false });
  }
}

async function generate() {
  if (createJobInFlight) return createJobInFlight;
  const workspaceStore = useWorkspaceStore();
  const form = currentForm();
  const prompt = form.prompt.trim();
  if (!prompt) {
    setStatus("error", "请输入提示词。", 2200);
    return;
  }
  const workflow = workspaceStore.activeWorkflow;
  let body: FormData | Record<string, unknown>;
  const base = { workflow, prompt, quality: form.quality, size: form.size, count: Number.parseInt(form.count, 10) || 1 };
  if (workflow === "image-to-image") {
    if (!sourceImages.value.length) {
      setStatus("error", "请先上传至少 1 张参考图。", 2200);
      return;
    }
    const formData = new FormData();
    Object.entries(base).forEach(([key, value]) => formData.append(key, String(value)));
    sourceImages.value.forEach((item) => formData.append("source_image", item.file, item.name));
    body = formData;
  } else {
    body = base;
  }
  createJobInFlight = (async () => {
    setStatus("loading", "正在创建任务...");
    await persistWorkspaceState();
    try {
      const job = await apiRequest<any>("/api/jobs", { method: "POST", body, timeoutMs: 30000 });
      usePromptLibraryDialog().setOpen(false);
      await refreshJobs({ silent: true, reset: true });
      setStatus("success", `任务已创建，开始请求生成 ${job.count || base.count} 张图片。`, 2600);
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      createJobInFlight = null;
    }
  })();
  return createJobInFlight;
}

function getJob(jobId: string) {
  return useJobStore().jobs.find((job) => String(job.id || "") === String(jobId)) || null;
}

function isActiveStatus(status: string) {
  return ACTIVE_STATUSES.has(status);
}

function isRetryableJob(job: JobSummary | null | undefined) {
  return Boolean(job && RETRYABLE_STATUSES.has(String(job.status || "")));
}

function setJobBusy(jobId: string, busy: boolean) {
  const next = new Set(busyJobIds.value);
  if (busy) next.add(jobId);
  else next.delete(jobId);
  busyJobIds.value = next;
}

async function jobAction(jobId: string, action: "cancel" | "retry" | "delete") {
  if (!jobId) return;
  const method = action === "delete" ? "DELETE" : "POST";
  const path = action === "delete" ? `/api/jobs/${jobId}` : `/api/jobs/${jobId}/${action}`;
  if (action === "delete") {
    const confirmed = await useConfirmDialog().confirm({
      title: "删除任务",
      description: "这个任务记录会被删除，任务下的图片也会从图库中移除。",
      confirmText: "删除任务",
      tone: "danger",
    });
    if (!confirmed) return;
  }
  setJobBusy(jobId, true);
  try {
    await apiRequest(path, { method, timeoutMs: 30000 });
    if (failurePopup.jobId === jobId) closeFailurePopup();
    await refreshJobs({ silent: true, reset: true });
    setStatus("success", action === "cancel" ? "任务已送出中断请求。" : action === "retry" ? "任务已重新加入队列。" : "任务已删除。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    setJobBusy(jobId, false);
  }
}

async function deleteImage(jobId: string, slot: number) {
  const confirmed = await useConfirmDialog().confirm({
    title: "删除图片",
    description: "这张图片会从图库和本地生成记录中移除。",
    confirmText: "删除图片",
    tone: "danger",
  });
  if (!confirmed) return;
  setJobBusy(jobId, true);
  try {
    await apiRequest(`/api/jobs/${jobId}/images/${slot}`, { method: "DELETE" });
    await refreshJobs({ silent: true, reset: true });
    setStatus("success", "图片已删除。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    setJobBusy(jobId, false);
  }
}

function toggleSelection(item: GalleryFlatItem) {
  const galleryStore = useGalleryStore();
  const key = imageKey(item.jobId, item.slot);
  const next = new Set(galleryStore.selectedKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  galleryStore.replaceSelection(next);
}

function clearSelection() {
  useGalleryStore().clearSelection();
}

function selectByRect(rect: DOMRect) {
  const galleryStore = useGalleryStore();
  const next = new Set(galleryStore.selectedKeys);
  document.querySelectorAll<HTMLElement>(".gallery-item[data-gallery-key]").forEach((node) => {
    const box = node.getBoundingClientRect();
    const intersects = !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom);
    if (intersects) next.add(node.dataset.galleryKey || "");
  });
  galleryStore.replaceSelection([...next].filter(Boolean));
}

async function batchDelete() {
  const galleryStore = useGalleryStore();
  const items = galleryStore.selectedItems;
  if (!items.length) return;
  const confirmed = await useConfirmDialog().confirm({
    title: "批量删除图片",
    description: `选中的 ${items.length} 张图片会从图库和本地生成记录中移除。`,
    confirmText: "删除图片",
    tone: "danger",
  });
  if (!confirmed) return;
  try {
    await apiRequest("/api/gallery/batch/delete", { method: "POST", body: { items } });
    galleryStore.clearSelection();
    await refreshJobs({ silent: true, reset: true });
    setStatus("success", `已删除 ${items.length} 张图片。`, 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  }
}

async function batchDownload() {
  const galleryStore = useGalleryStore();
  const items = galleryStore.selectedItems;
  if (!items.length) return;
  const response = await fetch("/api/gallery/batch/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "SCimage-selected-images.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadItem(item: GalleryFlatItem) {
  const link = document.createElement("a");
  link.href = item.src;
  link.download = item.filename || "image.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function openLightbox(index: number) {
  lightbox.index = Math.max(0, Math.min(index, useGalleryStore().flatItems.length - 1));
  lightbox.open = true;
  lightbox.zoom = 1;
  lightbox.panX = 0;
  lightbox.panY = 0;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.open = false;
  document.body.style.overflow = "";
}

function navLightbox(delta: number) {
  const total = useGalleryStore().flatItems.length;
  if (!total) return;
  lightbox.index = (lightbox.index + delta + total) % total;
  lightbox.zoom = 1;
  lightbox.panX = 0;
  lightbox.panY = 0;
}

function setGalleryFilter(filter: GalleryFilter) {
  useGalleryStore().setFilter(filter);
  void persistWorkspaceState();
}

function toggleSort() {
  const galleryStore = useGalleryStore();
  galleryStore.setSortAsc(!galleryStore.sortAsc);
  void refreshJobs({ silent: true, reset: true });
}

function savePrompt() {
  const promptStore = usePromptStore();
  const workspaceStore = useWorkspaceStore();
  const form = currentForm();
  if (!form.prompt.trim()) return;
  const item: SavedPrompt = {
    id: crypto.randomUUID?.() || String(Date.now()),
    workflow: workspaceStore.activeWorkflow,
    prompt: form.prompt.trim(),
    optionSummary: `${form.size} · ${form.quality} · ${form.count} 张`,
    savedAtText: new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
  };
  promptStore.replacePrompts([item, ...promptStore.prompts]);
  void persistWorkspaceState();
}

function applyPrompt(prompt: SavedPrompt) {
  currentForm().prompt = prompt.prompt;
  usePromptLibraryDialog().setOpen(false);
}

function splitPromptTokens(prompt: string) {
  return prompt.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
}

function composePromptTokens(baseTokens: string[], libraryTokens: string[]) {
  const result: string[] = [];
  [...baseTokens, ...libraryTokens].forEach((token) => {
    if (token && !result.includes(token)) result.push(token);
  });
  return result.join("，");
}

function appendPromptToken(token: string) {
  const value = token.trim();
  if (!value) return;
  const form = currentForm();
  form.prompt = composePromptTokens(splitPromptTokens(form.prompt), [value]);
}

function deletePrompt(id: string) {
  const promptStore = usePromptStore();
  promptStore.replacePrompts(promptStore.prompts.filter((item) => item.id !== id));
  void persistWorkspaceState();
}

function clearPrompts() {
  const promptStore = usePromptStore();
  promptStore.replacePrompts(promptStore.prompts.filter((item) => item.workflow !== promptStore.activeWorkflow));
  void persistWorkspaceState();
}

async function cleanupEmptyGeneratedDirs() {
  try {
    const payload = await apiRequest<any>("/api/maintenance/generated/cleanup-empty-dirs", { method: "POST" });
    setStatus("success", payload?.removed_count ? `已清理 ${payload.removed_count} 个空文件夹。` : "没有需要清理的空文件夹。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  }
}

async function initRuntime() {
  if (initialized) return;
  initialized = true;
  const promptStore = usePromptStore();
  promptStore.setActiveWorkflow(useWorkspaceStore().activeWorkflow);
  await loadWorkspaceState();
  await loadProviderProfiles().catch((error) => setStatus("error", error instanceof Error ? error.message : String(error)));
  await refreshJobs({ silent: true });
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => void refreshJobs({ silent: true }), 3500);
  await nextTick();
}

export function useScimageRuntime() {
  const galleryStore = useGalleryStore();
  const jobStore = useJobStore();
  const providerStore = useProviderStore();
  const promptStore = usePromptStore();
  const workspaceStore = useWorkspaceStore();

  const visibleGalleryItems = computed(() => galleryStore.flatItems);
  const currentLightboxItem = computed(() => galleryStore.flatItems[lightbox.index] || null);
  const currentWorkflowForm = computed(() => forms[workspaceStore.activeWorkflow]);

  return {
    addSourceFiles,
    addSourceImageFromGallery,
    activateProviderProfile,
    applyPrompt,
    appendPromptToken,
    batchDelete,
    batchDownload,
    busyJobIds,
    cleanupEmptyGeneratedDirs,
    clearPrompts,
    clearSelection,
    closeFailurePopup,
    closeLightbox,
    currentLightboxItem,
    currentWorkflowForm,
    deleteImage,
    deletePrompt,
    deleteProviderProfile,
    downloadItem,
    failurePopup,
    forms,
    galleryStore,
    generate,
    initRuntime,
    isActiveStatus,
    isRetryableJob,
    jobAction,
    jobStore,
    lightbox,
    loadModels,
    loadMoreGallery,
    loadMoreJobs,
    modelPicker,
    navLightbox,
    openLightbox,
    providerForm,
    providerStore,
    refreshJobs,
    removeSourceImage,
    savePrompt,
    saveProviderProfile,
    selectByRect,
    setGalleryFilter,
    setStatus,
    setWorkflow,
    sourceImages,
    status,
    toggleSelection,
    toggleSort,
    visibleGalleryItems,
    workspaceStore,
    sizeOptions,
    qualityOptions,
  };
}
