import { computed, nextTick, reactive, ref, watch } from "vue";
import { useGalleryStore, type GalleryFilter, type GalleryFlatItem } from "../stores/gallery";
import { useJobStore, type JobSummary } from "../stores/jobs";
import { usePromptStore, type SavedPrompt } from "../stores/prompts";
import { useProviderStore, type ProviderProfilesState } from "../stores/provider";
import { useWorkspaceStore, type WorkflowName } from "../stores/workspace";
import type {
  ApiJobImage,
  CreateJobResponse,
  GalleryImagesPagePayload,
  JobActionResponse,
  JobsPagePayload,
  MaintenanceCleanupPayload,
  ProviderModelsPayload,
  WorkspaceOutputFormPayload,
  WorkspaceStatePayload,
} from "../contracts/api";
import { apiRequest } from "./runtime/apiClient";
import { createFailurePopupController } from "./runtime/failurePopup";
import { patchGalleryPageJobStatus } from "./runtime/galleryJobPatches";
import { mergeGalleryPageItems } from "./runtime/galleryPages";
import { mergeJobsById } from "./runtime/jobs";
import { useRuntimeLightbox } from "./runtime/lightbox";
import { buildPromptBankPayload, flattenPromptBank } from "./runtime/promptBank";
import { normalizeBaseUrlForSignature, normalizeProviderState } from "./runtime/providerProfiles";
import {
  attachSourceImageMetadata,
  buildSourceOriginFromGalleryItem,
  sourceImageKey,
  sourceImageOrigin,
  type SourceImageItem,
  type SourceImageOrigin,
  type SourceImageReference,
} from "./runtime/sourceImages";
import { createStatusController, type StatusTone } from "./runtime/status";
import {
  DEFAULT_OUTPUT_PROFILE_ID,
  getDefaultQuality,
  getDefaultSizeOption,
  getQualityOptions,
  getSizeOptionsForValue,
  normalizeOutputForm,
  normalizeOutputProfileId,
  normalizeQuality,
  normalizeSizeOption,
} from "../data/outputOptions";
import { imageKeyFromParts } from "../utils/galleryKeys";
import { formatDateTime, getOutputOptionSummary, truncateText } from "../utils/jobFormatters";
import { isActiveJobStatus, isRetryableJobStatus } from "../utils/jobStatus";
import {
  downloadImageFromUrl,
  galleryItemFromPayload,
  normalizeImageUrl,
} from "../services/imageActions";
import { useConfirmDialog } from "./useConfirmDialog";
import { usePromptLibraryDialog } from "./usePromptLibraryDialog";

type ModelPickerStatus = "idle" | "loading" | "ready" | "stale" | "error";
type ModelPickerTone = "loading" | "success" | "warning" | "error" | "";

interface ModelOption {
  id: string;
  label: string;
  category: "image" | "other";
}

interface WorkspaceForm {
  prompt: string;
  size: string;
  quality: string;
  count: string;
}

interface LoadModelsOptions {
  preferredModel?: string;
  showStatus?: boolean;
  sourceProfileId?: string;
}

interface RefreshJobsOptions {
  silent?: boolean;
  reset?: boolean;
  manual?: boolean;
}

interface GalleryActionContext {
  item?: GalleryFlatItem;
  imageCount?: number;
}

const MODEL_PLACEHOLDER_TEXT = "请选择 API 支持的模型";
const MODEL_LOADING_TEXT = "正在拉取模型…";
const MODEL_EMPTY_TEXT = "当前 API 没有返回可用模型";
const MODEL_STALE_TEXT = "连接信息已变化，请先拉取模型";
const MODEL_READY_HINT_PREFIX = "已加载";
const MODEL_INVALID_SELECTION_TEXT = "当前已保存模型不在该 API 支持列表中，请重新选择。";
const MODEL_FETCH_FAILED_TEXT = "拉取模型失败，请重试。";
const CANCELED_JOB_MESSAGE = "任务已中断，后台请求已停止，已生成图片会自动保留。";

const forms = reactive<Record<WorkflowName, WorkspaceForm>>({
  generate: { prompt: "", size: getDefaultSizeOption(), quality: getDefaultQuality(), count: "1" },
  "image-to-image": { prompt: "", size: getDefaultSizeOption(), quality: getDefaultQuality(), count: "1" },
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
  messageTone: "" as ModelPickerTone,
  options: [] as ModelOption[],
  hasLoaded: false,
  status: "idle" as ModelPickerStatus,
  loadedSignature: "",
});
const statusController = createStatusController(status);
const galleryFlatItems = computed(() => useGalleryStore().flatItems);
const {
  lightbox,
  lightboxItems,
  currentLightboxItem,
  openLightbox,
  openLightboxFromItems,
  closeLightbox,
  syncLightboxSelection,
  navLightbox,
} = useRuntimeLightbox({ galleryItems: galleryFlatItems });
const {
  failurePopup,
  syncProblemPopups,
  closeFailurePopup,
  clearFailurePopupEntries,
} = createFailurePopupController();

let initialized = false;
let watchersInitialized = false;
let pollTimer = 0;
let clockTimer = 0;
let workspacePersistTimer = 0;
let workspacePersistRetryTimer = 0;
let workspacePersistInFlight: Promise<void> | null = null;
let workspacePersistDirty = false;
let refreshInFlight: Promise<void> | null = null;
let queuedRefreshOptions: RefreshJobsOptions | null = null;
let createJobInFlight: Promise<unknown> | null = null;
let suppressProviderFormWatch = false;
let isHydratingWorkspaceState = false;
let modelPickerRequestId = 0;
let jobsListGeneration = 0;
let galleryListGeneration = 0;
let cleanupGeneratedPromise: Promise<void> | null = null;
const locallyCanceledJobIds = new Set<string>();
const busyJobIds = ref(new Set<string>());
const clockTick = ref(Date.now());
const isCreatingJob = ref(false);
const isCleaningGeneratedDirs = ref(false);
const selectedProviderProfile = computed(() => {
  const providerStore = useProviderStore();
  return providerStore.selectedProfile;
});
const selectedProviderSourceId = computed(() => selectedProviderProfile.value?.id || useProviderStore().activeProfileId || "");
const providerSaveBlockMessage = computed(() => {
  if (!providerForm.base_url.trim()) return "请先填写 Base URL。";
  if (!providerForm.api_key.trim() && !selectedProviderSourceId.value) return "请先填写 API Key。";
  if (modelPicker.status === "loading") return MODEL_LOADING_TEXT;
  if (modelPicker.status === "stale") return MODEL_STALE_TEXT;
  if (modelPicker.status === "error") return modelPicker.message || MODEL_FETCH_FAILED_TEXT;
  if (!modelPicker.options.length) return MODEL_EMPTY_TEXT;
  if (!hasSelectedSupportedModel()) {
    return modelPicker.message === MODEL_INVALID_SELECTION_TEXT ? MODEL_INVALID_SELECTION_TEXT : MODEL_PLACEHOLDER_TEXT;
  }
  if (modelPicker.status !== "ready" || modelPicker.loadedSignature !== currentModelSignature()) return MODEL_STALE_TEXT;
  return "";
});
const providerCanSave = computed(() => !useProviderStore().isSaving && !modelPicker.loading && !providerSaveBlockMessage.value);
const providerCanSaveCurrent = computed(() => providerCanSave.value && Boolean(useProviderStore().activeProfileId));
const providerCanSaveAs = computed(() => providerCanSave.value);
const providerCanLoadModels = computed(() => (
  !useProviderStore().isSaving &&
  !modelPicker.loading &&
  Boolean(providerForm.base_url.trim()) &&
  Boolean(providerForm.api_key.trim() || selectedProviderSourceId.value)
));
const selectedCompatProfile = computed(() => {
  const providerStore = useProviderStore();
  const selectedCompatProfileId = providerForm.compat_profile_id || providerStore.activeProfile?.compat_profile_id || providerStore.compatProfiles[0]?.id || "";
  return providerStore.compatProfiles.find((item) => item.id === selectedCompatProfileId) || null;
});
const providerWorkflowAvailability = computed<Record<WorkflowName, boolean>>(() => {
  const compat = selectedCompatProfile.value;
  return {
    generate: true,
    "image-to-image": compat ? compat.supports_image_to_image !== false : true,
  };
});
const activeOutputProfileId = computed(() => {
  return normalizeOutputProfileId(selectedCompatProfile.value?.output_profile_id || DEFAULT_OUTPUT_PROFILE_ID);
});
const qualityOptions = computed(() => getQualityOptions(activeOutputProfileId.value));
const sizeOptions = computed(() => {
  const form = currentForm();
  return getSizeOptionsForValue(form.quality, form.size, activeOutputProfileId.value);
});
const canGenerate = computed(() => {
  const workspaceStore = useWorkspaceStore();
  const form = forms[workspaceStore.activeWorkflow];
  if (isCreatingJob.value) return false;
  if (!providerWorkflowAvailability.value[workspaceStore.activeWorkflow]) return false;
  if (!form.prompt.trim()) return false;
  if (workspaceStore.activeWorkflow === "image-to-image" && !sourceImages.value.length) return false;
  return true;
});

function setStatus(tone: StatusTone, message: string, timeoutMs = 0) {
  statusController.setStatus(tone, message, timeoutMs);
}

function currentModelSignature(sourceProfileId = selectedProviderSourceId.value) {
  const baseUrl = normalizeBaseUrlForSignature(providerForm.base_url);
  const apiKey = providerForm.api_key.trim();
  const authToken = apiKey ? `key:${apiKey}` : `source:${String(sourceProfileId || "").trim()}`;
  return `${baseUrl}::${authToken}`;
}

function hasSelectedSupportedModel() {
  const selectedModel = providerForm.model.trim();
  return Boolean(selectedModel) && modelPicker.options.some((model) => model.id === selectedModel);
}

function setModelPickerMessage(message = "", tone: ModelPickerTone = "") {
  modelPicker.message = message;
  modelPicker.messageTone = tone;
}

function syncProviderForm(options: { validateModels?: boolean } = {}) {
  const providerStore = useProviderStore();
  const active = providerStore.activeProfile;
  modelPickerRequestId += 1;
  suppressProviderFormWatch = true;
  providerForm.name = active?.name || "";
  providerForm.base_url = active?.base_url || "";
  providerForm.model = active?.model || "";
  providerForm.compat_profile_id = active?.compat_profile_id || providerStore.compatProfiles[0]?.id || "";
  providerForm.supports_count_parameter = active?.supports_count_parameter !== false;
  providerForm.api_key = active?.api_key || "";
  void nextTick(() => {
    suppressProviderFormWatch = false;
  });
  resetModelPicker();
  syncWorkflowAvailability();
  if (options.validateModels && active?.base_url && active.model && active.has_api_key !== false) {
    void loadModels({ preferredModel: active.model, sourceProfileId: active.id, showStatus: false });
  }
}

function resetModelPicker(message = "", status: ModelPickerStatus = message ? "stale" : "idle", tone: ModelPickerTone = message ? "warning" : "") {
  modelPickerRequestId += 1;
  modelPicker.loading = false;
  modelPicker.status = status;
  modelPicker.loadedSignature = "";
  modelPicker.options = [];
  modelPicker.hasLoaded = false;
  setModelPickerMessage(message, tone);
}

function syncWorkflowAvailability() {
  const workspaceStore = useWorkspaceStore();
  const availability = providerWorkflowAvailability.value;
  workspaceStore.setWorkflowAvailability("generate", availability.generate);
  workspaceStore.setWorkflowAvailability("image-to-image", availability["image-to-image"]);
  if (!availability[workspaceStore.activeWorkflow]) {
    workspaceStore.setWorkflow("generate");
    syncPromptWorkflowLabel("generate");
    void persistWorkspaceState();
  }
}

async function loadProviderProfiles() {
  const providerStore = useProviderStore();
  providerStore.setLoading(true);
  try {
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>("/api/provider-profiles", { method: "GET" }));
    providerStore.replaceState(payload);
    syncProviderForm({ validateModels: true });
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
    syncProviderForm({ validateModels: true });
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
  if (asNew ? !providerCanSaveAs.value : !providerCanSaveCurrent.value) {
    setStatus("error", !asNew && !providerStore.activeProfileId ? "请先使用“另存为新配置”创建第一套配置。" : providerSaveBlockMessage.value, 2200);
    return;
  }
  providerStore.setSaving(true);
  try {
    const selectedId = providerStore.activeProfileId;
    if (!asNew && !selectedId) {
      setStatus("error", "请先另存为新配置。", 2200);
      return;
    }
    const path = asNew ? "/api/provider-profiles" : `/api/provider-profiles/${selectedId}`;
    const method = asNew ? "POST" : "PUT";
    const body = providerPayload();
    if (asNew && !String(body.api_key || "").trim() && selectedProviderSourceId.value) {
      body.source_profile_id = selectedProviderSourceId.value;
    }
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(path, { method, body }));
    providerStore.replaceState(payload);
    syncProviderForm({ validateModels: true });
    setStatus("success", asNew ? "新配置已保存。" : "当前配置已保存。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    providerStore.setSaving(false);
  }
}

async function deleteProviderProfile(profileId: string) {
  if (!profileId) return;
  const providerStore = useProviderStore();
  const targetProfile = providerStore.profiles.find((profile) => profile.id === profileId) || null;
  if (!targetProfile) {
    setStatus("error", "要删除的配置不存在。", 2200);
    return;
  }
  const isLastProfile = providerStore.profiles.length === 1;
  const isActiveProfile = targetProfile.id === providerStore.activeProfileId;
  let description = `确定删除配置「${targetProfile.name}」吗？`;
  if (isLastProfile) {
    description = `确定删除配置「${targetProfile.name}」吗？删除后需要重新创建提供方配置。`;
  } else if (isActiveProfile) {
    description = `确定删除当前配置「${targetProfile.name}」吗？删除后会自动切换到其他已保存配置。`;
  }
  const confirmed = await useConfirmDialog().confirm({
    title: "删除 API 配置",
    description,
    confirmText: "删除配置",
    tone: "danger",
  });
  if (!confirmed) return;
  providerStore.setSaving(true);
  try {
    const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(`/api/provider-profiles/${targetProfile.id}`, { method: "DELETE" }));
    providerStore.replaceState(payload);
    syncProviderForm({ validateModels: true });
    setStatus("success", "配置已删除。", 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    providerStore.setSaving(false);
  }
}

async function loadModels(options: LoadModelsOptions = {}) {
  const sourceProfileId = String(options.sourceProfileId || selectedProviderSourceId.value || "").trim();
  const baseUrl = providerForm.base_url.trim();
  const apiKey = providerForm.api_key.trim();
  if (!providerForm.base_url.trim()) {
    resetModelPicker("请先填写 Base URL。", "error", "error");
    return;
  }
  if (!apiKey && !sourceProfileId) {
    resetModelPicker("请先填写 API Key。", "error", "error");
    return;
  }
  const requestId = modelPickerRequestId + 1;
  modelPickerRequestId = requestId;
  modelPicker.loading = true;
  modelPicker.status = "loading";
  modelPicker.loadedSignature = "";
  modelPicker.hasLoaded = false;
  setModelPickerMessage(MODEL_LOADING_TEXT, "loading");
  try {
    const payload = await apiRequest<ProviderModelsPayload>("/api/provider-profiles/models", {
      method: "POST",
      body: { base_url: baseUrl, api_key: apiKey, source_profile_id: sourceProfileId },
      timeoutMs: 30000,
    });
    if (requestId !== modelPickerRequestId) return;
    if (payload.normalized_base_url) {
      suppressProviderFormWatch = true;
      providerForm.base_url = String(payload.normalized_base_url);
      void nextTick(() => {
        suppressProviderFormWatch = false;
      });
    }
    const models = payload.models || payload.data || [];
    modelPicker.options = models.map((model) => {
      const category: ModelOption["category"] = String(model.category || "other").trim() === "image" ? "image" : "other";
      return {
        id: String(model.id || "").trim(),
        label: String(model.label || model.id || "").trim(),
        category,
      };
    }).filter((model) => model.id);
    modelPicker.hasLoaded = true;
    modelPicker.loadedSignature = currentModelSignature(sourceProfileId);
    if (!modelPicker.options.length) {
      modelPicker.status = "error";
      setModelPickerMessage(MODEL_EMPTY_TEXT, "error");
      if (options.showStatus !== false) setStatus("error", MODEL_EMPTY_TEXT, 2200);
      return;
    }
    const preferredModel = String(options.preferredModel || providerForm.model || "").trim();
    const hasPreferredModel = modelPicker.options.some((model) => model.id === preferredModel);
    providerForm.model = hasPreferredModel ? preferredModel : "";
    modelPicker.status = "ready";
    if (hasPreferredModel) {
      setModelPickerMessage(`${MODEL_READY_HINT_PREFIX} ${modelPicker.options.length} 个模型`, "success");
    } else {
      setModelPickerMessage(MODEL_INVALID_SELECTION_TEXT, "warning");
    }
    if (options.showStatus !== false) {
      setStatus("success", `${MODEL_READY_HINT_PREFIX} ${modelPicker.options.length} 个模型。`, 1800);
    }
  } catch (error) {
    if (requestId !== modelPickerRequestId) return;
    modelPicker.status = "error";
    modelPicker.loadedSignature = "";
    modelPicker.options = [];
    modelPicker.hasLoaded = false;
    const message = error instanceof Error ? error.message : String(error || MODEL_FETCH_FAILED_TEXT);
    setModelPickerMessage(message || MODEL_FETCH_FAILED_TEXT, "error");
    if (options.showStatus !== false) setStatus("error", message || MODEL_FETCH_FAILED_TEXT, 2200);
  } finally {
    if (requestId === modelPickerRequestId) {
      modelPicker.loading = false;
    }
  }
}

function getOutputSummary(form: Pick<WorkspaceForm, "size" | "quality" | "count"> & { workflow?: string }, outputProfileId = activeOutputProfileId.value) {
  return getOutputOptionSummary(form as Record<string, unknown>, outputProfileId);
}

function promptBankPayload() {
  const promptStore = usePromptStore();
  return buildPromptBankPayload(promptStore.prompts, activeOutputProfileId.value);
}

async function loadWorkspaceState() {
  let payload: WorkspaceStatePayload;
  try {
    payload = await apiRequest<WorkspaceStatePayload>("/api/workspace-state", { method: "GET" });
  } catch {
    // Workspace state is a convenience cache; the app can run without it.
    return;
  }
  isHydratingWorkspaceState = true;
  try {
    const workspaceStore = useWorkspaceStore();
    const promptStore = usePromptStore();
    const active = payload?.active_workflow === "image-to-image" ? "image-to-image" : "generate";
    workspaceStore.setWorkflow(active);
    syncPromptWorkflowLabel(active);
    (["generate", "image-to-image"] as WorkflowName[]).forEach((workflow) => {
      const form: WorkspaceOutputFormPayload = payload?.forms?.[workflow] || {};
      const normalized = normalizeOutputForm(form, activeOutputProfileId.value);
      forms[workflow].prompt = normalized.prompt;
      forms[workflow].size = normalized.size;
      forms[workflow].quality = normalized.quality;
      forms[workflow].count = normalized.count;
    });
    promptStore.replacePrompts(flattenPromptBank(payload?.prompt_bank || payload?.saved_prompts, activeOutputProfileId.value));
    const filter = payload?.ui?.gallery?.filter;
    if (filter === "tasks" || filter === "prompts" || filter === "all") {
      useGalleryStore().setFilter(filter);
    }
  } finally {
    isHydratingWorkspaceState = false;
  }
}

async function persistWorkspaceState() {
  if (isHydratingWorkspaceState) return workspacePersistInFlight || Promise.resolve();
  workspacePersistDirty = true;
  window.clearTimeout(workspacePersistTimer);
  if (workspacePersistInFlight) return workspacePersistInFlight;
  const workspaceStore = useWorkspaceStore();
  const promptStore = usePromptStore();
  const galleryStore = useGalleryStore();
  workspacePersistDirty = false;
  window.clearTimeout(workspacePersistRetryTimer);
  workspacePersistInFlight = apiRequest("/api/workspace-state", {
    method: "PUT",
    timeoutMs: 8000,
    body: {
      active_workflow: workspaceStore.activeWorkflow,
      forms,
      prompt_bank: promptBankPayload(),
      ui: { gallery: { filter: galleryStore.filter } },
    },
  })
    .then(() => undefined)
    .catch(() => {
      workspacePersistDirty = true;
    })
    .finally(() => {
      workspacePersistInFlight = null;
      if (workspacePersistDirty && !isHydratingWorkspaceState) {
        window.clearTimeout(workspacePersistRetryTimer);
        workspacePersistRetryTimer = window.setTimeout(() => void persistWorkspaceState(), 400);
      }
    });
  return workspacePersistInFlight;
}

function schedulePersistWorkspaceState() {
  if (isHydratingWorkspaceState) return;
  workspacePersistDirty = true;
  window.clearTimeout(workspacePersistTimer);
  workspacePersistTimer = window.setTimeout(() => void persistWorkspaceState(), 160);
}

function currentForm() {
  return forms[useWorkspaceStore().activeWorkflow];
}

function normalizeCurrentOutputForm() {
  const form = currentForm();
  const normalized = normalizeOutputForm(form, activeOutputProfileId.value);
  form.prompt = normalized.prompt;
  form.quality = normalized.quality;
  form.size = normalized.size;
  form.count = normalized.count;
}

function syncCurrentSizeForQuality(preferredSize?: string) {
  const form = currentForm();
  form.quality = normalizeQuality(form.quality, getDefaultQuality(activeOutputProfileId.value), activeOutputProfileId.value);
  form.size = normalizeSizeOption(preferredSize ?? form.size, getDefaultSizeOption(), form.quality, activeOutputProfileId.value);
}

function resetFormState() {
  (["generate", "image-to-image"] as WorkflowName[]).forEach((workflow) => {
    const normalized = normalizeOutputForm({}, activeOutputProfileId.value);
    forms[workflow].prompt = normalized.prompt;
    forms[workflow].size = normalized.size;
    forms[workflow].quality = normalized.quality;
    forms[workflow].count = normalized.count;
  });
  clearSourceImages();
  useWorkspaceStore().setWorkflow("generate");
  syncPromptWorkflowLabel("generate");
  void persistWorkspaceState();
  setStatus("success", "表单已重置。", 2000);
}

function setWorkflow(workflow: WorkflowName) {
  if (!providerWorkflowAvailability.value[workflow]) {
    setStatus("error", "当前提供方配置不支持图生图。", 2400);
    return false;
  }
  useWorkspaceStore().setWorkflow(workflow);
  syncPromptWorkflowLabel(workflow);
  void persistWorkspaceState();
  return true;
}

function syncPromptWorkflowLabel(workflow: WorkflowName) {
  const promptStore = usePromptStore();
  promptStore.setActiveWorkflow(workflow);
  promptStore.setEmptyLabel(`还没有保存的${workflow === "image-to-image" ? "图生图" : "文生图"}提示词`);
}

function addSourceFiles(files: Iterable<File>) {
  const next = [...sourceImages.value];
  Array.from(files).forEach((file) => {
    if (!file || (file.type && !file.type.startsWith("image/"))) return;
    const key = sourceImageKey(file);
    if (next.some((item) => item.key === key)) return;
    const origin = sourceImageOrigin(file);
    next.push({ key, file, name: file.name, url: URL.createObjectURL(file), origin });
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

function clearSourceImages() {
  sourceImages.value.forEach((item) => URL.revokeObjectURL(item.url));
  sourceImages.value = [];
  useWorkspaceStore().setSourceFileCount(0);
}

async function addSourceImageFromGallery(item: GalleryFlatItem) {
  return addSourceImageFromUrl({
    url: item.src,
    filename: item.filename || "reference.png",
    prompt: item.prompt,
    origin: buildSourceOriginFromGalleryItem(item),
  }, "已加入图生图参考图。", "这张图片已经在图生图参考图中。");
}

async function addSourceImageFromUrl(
  source: SourceImageReference,
  successMessage = "已加入图生图参考图。",
  duplicateMessage = "这张图片已经在图生图参考图中。",
) {
  if (!providerWorkflowAvailability.value["image-to-image"]) {
    setStatus("error", "当前提供方配置不支持图生图。", 2400);
    return;
  }
  try {
    const imageUrl = normalizeImageUrl(source.url);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`图片读取失败：${response.status}`);
    }
    const blob = await response.blob();
    const file = new File([blob], source.filename || "reference.png", { type: blob.type || "image/png", lastModified: Date.now() });
    attachSourceImageMetadata(file, `gallery:${imageUrl}`, source.origin);
    const beforeCount = sourceImages.value.length;
    if (!setWorkflow("image-to-image")) return;
    addSourceFiles([file]);
    setStatus("success", sourceImages.value.length > beforeCount ? successMessage : duplicateMessage, 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error || "加入参考图失败。"), 2600);
  }
}

function applyJobsPage(payload: JobsPagePayload, append = false) {
  const jobStore = useJobStore();
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const nextJobs = mergeJobsById(jobStore.jobs, jobs, {
    reset: !append,
    locallyCanceledJobIds,
  });
  const pageSize = Math.max(1, Number(payload?.limit || payload?.page_size || jobStore.pagination.pageSize || 80));
  const nextOffset = append
    ? Math.max(Number(jobStore.pagination.nextOffset || 0), Number(payload?.next_offset || nextJobs.length))
    : Number(payload?.next_offset || jobs.length);
  jobStore.patchPagination({
    total: Math.max(0, Number(payload?.total ?? nextJobs.length)),
    hasMore: Boolean(payload?.has_more) || nextOffset < Number(payload?.total || 0),
    pageSize,
    nextOffset,
    nextCursor: String(payload?.next_cursor || ""),
    isLoadingMore: false,
  });
  jobStore.replaceJobs(nextJobs);
}

function applyGalleryPage(payload: GalleryImagesPagePayload, append = false) {
  const galleryStore = useGalleryStore();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const pageItems = mergeGalleryPageItems(galleryStore.pageItems, items, {
    reset: !append,
    sortAsc: galleryStore.sortAsc,
  });
  const flatItems = pageItems.map(galleryItemFromPayload).filter(Boolean) as GalleryFlatItem[];
  galleryStore.replacePageItems(pageItems);
  galleryStore.replaceFlatItems(flatItems);
  galleryStore.patchPagination({
    total: Math.max(0, Number(payload?.total ?? flatItems.length)),
    hasMore: Boolean(payload?.has_more),
    pageSize: Math.max(1, Number(payload?.limit || payload?.page_size || galleryStore.pagination.pageSize || 160)),
    nextCursor: String(payload?.next_cursor || ""),
    isLoadingMore: false,
  });
  syncLightboxSelection();
}

function mergeRefreshOptions(current: RefreshJobsOptions | null, next: RefreshJobsOptions) {
  return {
    silent: current ? Boolean(current.silent && next.silent) : Boolean(next.silent),
    reset: Boolean(current?.reset || next.reset),
    manual: Boolean(current?.manual || next.manual),
  };
}

async function refreshJobs(options: RefreshJobsOptions = {}) {
  if (refreshInFlight) {
    queuedRefreshOptions = mergeRefreshOptions(queuedRefreshOptions, options);
    return refreshInFlight;
  }
  const jobStore = useJobStore();
  const galleryStore = useGalleryStore();
  const refreshJobsGeneration = ++jobsListGeneration;
  const refreshGalleryGeneration = ++galleryListGeneration;
  const requestedSortAsc = galleryStore.sortAsc;
  refreshInFlight = (async () => {
    try {
      const [jobsPayload, galleryPayload] = await Promise.all([
        apiRequest<JobsPagePayload>(`/api/jobs?offset=0&limit=${jobStore.pagination.pageSize || 80}`, { method: "GET" }),
        apiRequest<GalleryImagesPagePayload>(`/api/gallery/images?limit=${galleryStore.pagination.pageSize || 160}&sort=${requestedSortAsc ? "asc" : "desc"}`, { method: "GET" }),
      ]);
      if (refreshJobsGeneration === jobsListGeneration) {
        applyJobsPage(jobsPayload);
        jobStore.markSyncSuccess(new Date());
        syncProblemPopups(jobStore.jobs);
      }
      if (refreshGalleryGeneration === galleryListGeneration && requestedSortAsc === galleryStore.sortAsc) {
        applyGalleryPage(galleryPayload, false);
      }
      if (options.manual && refreshJobsGeneration === jobsListGeneration && refreshGalleryGeneration === galleryListGeneration) {
        setStatus("success", "已刷新。", 1800);
      }
    } catch (error) {
      jobStore.markSyncError(error);
      if (!options.silent) setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      refreshInFlight = null;
      const nextRefreshOptions = queuedRefreshOptions;
      queuedRefreshOptions = null;
      if (nextRefreshOptions) void refreshJobs(nextRefreshOptions);
    }
  })();
  return refreshInFlight;
}

async function loadMoreJobs() {
  const jobStore = useJobStore();
  if (refreshInFlight) return;
  if (jobStore.pagination.isLoadingMore || !jobStore.pagination.hasMore) return;
  const requestGeneration = jobsListGeneration;
  jobStore.patchPagination({ isLoadingMore: true });
  try {
    const payload = await apiRequest<JobsPagePayload>(`/api/jobs?offset=${jobStore.pagination.nextOffset}&limit=${jobStore.pagination.pageSize}&cursor=${encodeURIComponent(jobStore.pagination.nextCursor)}`, { method: "GET" });
    if (requestGeneration === jobsListGeneration) applyJobsPage(payload, true);
  } catch (error) {
    jobStore.markSyncError(error);
    jobStore.patchPagination({ isLoadingMore: false });
  } finally {
    if (requestGeneration !== jobsListGeneration) jobStore.patchPagination({ isLoadingMore: false });
  }
}

async function loadMoreGallery() {
  const galleryStore = useGalleryStore();
  if (refreshInFlight) return;
  if (galleryStore.pagination.isLoadingMore || !galleryStore.pagination.hasMore) return;
  const requestGeneration = galleryListGeneration;
  const requestedSortAsc = galleryStore.sortAsc;
  galleryStore.patchPagination({ isLoadingMore: true });
  try {
    const payload = await apiRequest<GalleryImagesPagePayload>(`/api/gallery/images?limit=${galleryStore.pagination.pageSize}&cursor=${encodeURIComponent(galleryStore.pagination.nextCursor)}&sort=${requestedSortAsc ? "asc" : "desc"}`, { method: "GET" });
    if (requestGeneration === galleryListGeneration && requestedSortAsc === galleryStore.sortAsc) applyGalleryPage(payload, true);
  } catch {
    galleryStore.patchPagination({ isLoadingMore: false });
  } finally {
    if (requestGeneration !== galleryListGeneration || requestedSortAsc !== galleryStore.sortAsc) {
      galleryStore.patchPagination({ isLoadingMore: false });
    }
  }
}

async function generate() {
  if (createJobInFlight) return createJobInFlight;
  const workspaceStore = useWorkspaceStore();
  const form = currentForm();
  normalizeCurrentOutputForm();
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
    sourceImages.value.forEach((item) => {
      formData.append("source_image", item.file, item.name);
      formData.append("source_image_origin", JSON.stringify(item.origin || null));
    });
    body = formData;
  } else {
    body = base;
  }
  createJobInFlight = (async () => {
    isCreatingJob.value = true;
    setStatus("loading", "正在创建任务...");
    await persistWorkspaceState();
    try {
      const job = await apiRequest<CreateJobResponse>("/api/jobs", { method: "POST", body, timeoutMs: 30000 });
      usePromptLibraryDialog().setOpen(false);
      await refreshJobs({ silent: true, reset: true });
      setStatus("success", `任务已创建，开始请求生成 ${job.count || base.count} 张图片。`, 2600);
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      createJobInFlight = null;
      isCreatingJob.value = false;
    }
  })();
  return createJobInFlight;
}

function getJob(jobId: string) {
  return useJobStore().jobs.find((job) => String(job.id || "") === String(jobId)) || null;
}

function getGalleryJobSnapshot(jobId: string) {
  const item = useGalleryStore().flatItems.find((candidate) => candidate.jobId === jobId);
  return item?.jobSnapshot || null;
}

function getJobForGalleryItem(item: Pick<GalleryFlatItem, "jobId" | "jobSnapshot">) {
  return getJob(item.jobId) || item.jobSnapshot || getGalleryJobSnapshot(item.jobId);
}

function getActionJob(jobId: string) {
  return getJob(jobId) || getGalleryJobSnapshot(jobId);
}

function isActiveStatus(status: string) {
  return isActiveJobStatus(status);
}

function isRetryableJob(job: JobSummary | null | undefined) {
  return Boolean(job && isRetryableJobStatus(job.status));
}

function setJobBusy(jobId: string, busy: boolean) {
  const next = new Set(busyJobIds.value);
  if (busy) next.add(jobId);
  else next.delete(jobId);
  busyJobIds.value = next;
}

function closeLightboxIfMissing() {
  const galleryStore = useGalleryStore();
  if (!lightbox.open) return;
  if (galleryStore.flatItems.length <= 0) {
    closeLightbox();
    return;
  }
  syncLightboxSelection();
}

function patchCanceledGalleryItems(jobId: string) {
  const galleryStore = useGalleryStore();
  const pageItems = patchGalleryPageJobStatus(galleryStore.pageItems, jobId, {
    status: "canceled",
    message: CANCELED_JOB_MESSAGE,
  });
  const flatItems = galleryStore.flatItems.map((item) => (
    item.jobId === String(jobId)
      ? {
          ...item,
          jobStatus: "canceled",
          jobSnapshot: item.jobSnapshot
            ? { ...item.jobSnapshot, status: "canceled", message: CANCELED_JOB_MESSAGE }
            : item.jobSnapshot,
        }
      : item
  ));
  galleryStore.replacePageItems(pageItems);
  galleryStore.replaceFlatItems(flatItems);
}

function markJobCanceledLocally(jobId: string, images?: unknown) {
  locallyCanceledJobIds.add(String(jobId));
  useJobStore().patchJob(jobId, {
    status: "canceled",
    message: CANCELED_JOB_MESSAGE,
    ...(Array.isArray(images) ? { images } : {}),
  });
  patchCanceledGalleryItems(jobId);
  if (failurePopup.jobId === jobId) closeFailurePopup();
}

function restoreJobSnapshotLocally(jobId: string, snapshot: JobSummary) {
  locallyCanceledJobIds.delete(String(jobId));
  useJobStore().patchJob(jobId, snapshot);
  const galleryStore = useGalleryStore();
  const status = String(snapshot.status || "");
  const message = String(snapshot.message || "");
  galleryStore.replacePageItems(patchGalleryPageJobStatus(galleryStore.pageItems, jobId, snapshot));
  galleryStore.replaceFlatItems(galleryStore.flatItems.map((item) => (
    item.jobId === String(jobId)
      ? { ...item, jobStatus: status, jobSnapshot: { ...(item.jobSnapshot || {}), ...snapshot, message } }
      : item
  )));
}

async function jobAction(jobId: string, action: "cancel" | "retry" | "delete") {
  if (!jobId) return;
  const job = getActionJob(jobId);
  if (!job) {
    setStatus("error", "任务不存在。", 2200);
    return;
  }
  if (action === "cancel" && !isActiveStatus(String(job.status || ""))) {
    setStatus("error", "只有运行中的任务可以中断。", 2200);
    return;
  }
  if (action === "retry" && !isRetryableJob(job)) {
    setStatus("error", "这个任务当前不能重试。", 2200);
    return;
  }
  const method = action === "delete" ? "DELETE" : "POST";
  const path = action === "delete" ? `/api/jobs/${jobId}` : `/api/jobs/${jobId}/${action}`;
  if (action === "delete") {
    const imageCount = Array.isArray(job.images) ? job.images.length : 0;
    const promptLabel = truncateText(job.prompt || "这个任务", 24);
    const confirmed = await useConfirmDialog().confirm({
      title: "删除任务",
      description: imageCount > 1
        ? `确定删除「${promptLabel}」这个任务？会同时删除已生成的 ${imageCount} 张图片。`
        : `确定删除「${promptLabel}」这个任务吗？`,
      confirmText: "删除任务",
      tone: "danger",
    });
    if (!confirmed) return;
  }
  setJobBusy(jobId, true);
  try {
    if (action === "retry") {
      locallyCanceledJobIds.delete(String(jobId));
    }
    if (action === "cancel") {
      markJobCanceledLocally(jobId);
    }
    if (action === "retry" || action === "delete") clearFailurePopupEntries(jobId);
    const payload = await apiRequest<JobActionResponse>(path, { method, timeoutMs: action === "cancel" ? 8000 : 30000 });
    if (action === "cancel") {
      markJobCanceledLocally(jobId, payload?.images);
      void refreshJobs({ silent: true });
      setStatus("success", "任务已中断。", 2200);
      return;
    }
    if (failurePopup.jobId === jobId) closeFailurePopup();
    await refreshJobs({ silent: true, reset: true });
    if (action === "delete") closeLightboxIfMissing();
    setStatus("success", action === "retry" ? "任务已重新加入队列。" : "任务已删除。", 2200);
  } catch (error) {
    if (action === "cancel") {
      restoreJobSnapshotLocally(jobId, job);
    }
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    setJobBusy(jobId, false);
  }
}

async function deleteImage(jobId: string, slot: number, context: GalleryActionContext = {}) {
  const contextItem = context.item?.jobId === jobId ? context.item : null;
  const job = getActionJob(jobId) || contextItem?.jobSnapshot || (
    contextItem
      ? {
          id: jobId,
          status: contextItem.jobStatus,
          prompt: contextItem.prompt,
          created_at: contextItem.createdAt,
          updated_at: contextItem.updatedAt,
          images: [{ slot, url: contextItem.src, name: contextItem.filename }],
        }
      : null
  );
  if (!job) {
    setStatus("error", "任务不存在。", 2200);
    return;
  }
  const images = Array.isArray(job.images) ? job.images : [];
  const imageCount = context.imageCount || context.item?.imageCount || images.length || 1;
  const targetImage = images.find((image: ApiJobImage) => Number(image?.slot || 0) === Number(slot)) || (
    context.item && context.item.jobId === jobId && Number(context.item.slot || 0) === Number(slot)
      ? { slot, url: context.item.src, name: context.item.filename }
      : null
  );
  if (!targetImage) {
    setStatus("error", "要删除的图片不存在。", 2200);
    return;
  }
  const confirmed = await useConfirmDialog().confirm({
    title: "删除图片",
    description: imageCount > 1
      ? `确定删除这张图片吗？本次任务的其余 ${imageCount - 1} 张图片会保留。`
      : "确定删除这张图片吗？任务记录会保留，但图库中将不再显示这次结果。",
    confirmText: "删除图片",
    tone: "danger",
  });
  if (!confirmed) return;
  setJobBusy(jobId, true);
  try {
    const payload = await apiRequest<{ deleted_job?: boolean }>(`/api/jobs/${jobId}/images/${slot}`, { method: "DELETE", timeoutMs: 30000 });
    await refreshJobs({ silent: true, reset: true });
    closeLightboxIfMissing();
    setStatus(
      "success",
      payload.deleted_job ? "图片已删除，这个任务已自动移除。" : "图片已删除，其余图片和任务记录已保留。",
      2200,
    );
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    setJobBusy(jobId, false);
  }
}

async function resolveGalleryTerminalAction(item: GalleryFlatItem) {
  const job = getJobForGalleryItem(item);
  if (job && isActiveStatus(String(job.status || ""))) {
    await jobAction(item.jobId, "cancel");
    return;
  }
  await deleteImage(item.jobId, item.slot, { item });
}

function toggleSelection(item: GalleryFlatItem) {
  const galleryStore = useGalleryStore();
  const key = imageKeyFromParts(item.jobId, item.slot);
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
    const payload = await apiRequest<{ removed_count?: number }>("/api/gallery/batch/delete", { method: "POST", body: { items } });
    galleryStore.clearSelection();
    await refreshJobs({ silent: true, reset: true });
    setStatus("success", `已删除 ${payload.removed_count || items.length} 张图片。`, 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  }
}

async function batchDownload() {
  const galleryStore = useGalleryStore();
  const items = galleryStore.selectedItems;
  if (!items.length) return;
  try {
    const response = await fetch("/api/gallery/batch/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(String(payload?.error || "批量下载失败。"));
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "SCimage-selected-images.zip";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("success", `已打包下载 ${items.length} 张图片。`, 2200);
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  }
}

async function downloadItem(item: GalleryFlatItem) {
  const imageUrl = normalizeImageUrl(item.src);
  if (!imageUrl) {
    setStatus("error", "图片地址无效，无法下载。", 2200);
    return;
  }
  try {
    const result = await downloadImageFromUrl(imageUrl, item.filename);
    if (result.saved) {
      setStatus("success", "图片已保存。", 1600);
    }
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error || "下载图片失败。"), 2400);
  }
}

async function deleteLightboxItem() {
  const galleryItems = useGalleryStore().flatItems;
  const item = galleryItems.find((candidate) => imageKeyFromParts(candidate.jobId, candidate.slot) === lightbox.selectionKey) || galleryItems[lightbox.index];
  if (!item) return;
  await resolveGalleryTerminalAction(item);
}

function setGalleryFilter(filter: GalleryFilter) {
  useGalleryStore().setFilter(filter);
  void persistWorkspaceState();
}

function toggleSort() {
  const galleryStore = useGalleryStore();
  galleryListGeneration += 1;
  galleryStore.setSortAsc(!galleryStore.sortAsc);
  galleryStore.replacePageItems([]);
  galleryStore.replaceFlatItems([]);
  galleryStore.patchPagination({
    total: 0,
    hasMore: false,
    nextCursor: "",
    isLoadingMore: false,
  });
  void refreshJobs({ silent: true, reset: true });
}

function savePrompt() {
  const promptStore = usePromptStore();
  const workspaceStore = useWorkspaceStore();
  const form = currentForm();
  const prompt = form.prompt.trim();
  if (!prompt) {
    setStatus("error", "请先输入提示词。", 2200);
    document.getElementById("prompt")?.focus();
    return;
  }
  normalizeCurrentOutputForm();
  const now = new Date().toISOString();
  const outputProfileId = activeOutputProfileId.value;
  const workflow = workspaceStore.activeWorkflow;
  const existing = promptStore.prompts.find((item) => item.workflow === workflow && item.prompt === prompt);
  const item: SavedPrompt = {
    id: existing?.id || crypto.randomUUID?.() || String(Date.now()),
    workflow,
    prompt,
    outputProfileId,
    size: form.size,
    quality: form.quality,
    count: Number.parseInt(form.count, 10) || 1,
    optionSummary: getOutputSummary({ ...form, workflow }, outputProfileId),
    savedAtText: `保存于 ${formatDateTime(now)}`,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  promptStore.replacePrompts([
    item,
    ...promptStore.prompts.filter((saved) => !(saved.workflow === workflow && saved.prompt === prompt)),
  ]);
  void persistWorkspaceState();
  usePromptLibraryDialog().setOpen(true);
  setStatus("success", `已保存到${workflow === "image-to-image" ? "图生图" : "文生图"}词库。`, 2200);
}

function applyPrompt(prompt: SavedPrompt) {
  const form = currentForm();
  const outputProfileId = activeOutputProfileId.value;
  form.prompt = prompt.prompt;
  form.quality = normalizeQuality(prompt.quality, getDefaultQuality(outputProfileId), outputProfileId);
  form.size = normalizeSizeOption(prompt.size, getDefaultSizeOption(), form.quality, outputProfileId);
  form.count = String(prompt.count || 1);
  schedulePersistWorkspaceState();
  usePromptLibraryDialog().setOpen(false);
  setStatus("success", "提示词已载入。", 2200);
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

function removePromptToken(token: string) {
  const value = token.trim();
  if (!value) return;
  currentForm().prompt = splitPromptTokens(currentForm().prompt).filter((item) => item !== value).join("，");
}

function togglePromptToken(token: string) {
  const value = token.trim();
  if (!value) return;
  const currentTokens = splitPromptTokens(currentForm().prompt);
  if (currentTokens.includes(value)) {
    removePromptToken(value);
    return;
  }
  appendPromptToken(value);
}

function deletePrompt(id: string) {
  const promptStore = usePromptStore();
  promptStore.replacePrompts(promptStore.prompts.filter((item) => !(item.workflow === promptStore.activeWorkflow && item.id === id)));
  void persistWorkspaceState();
}

async function clearPrompts() {
  const promptStore = usePromptStore();
  if (!promptStore.activePrompts.length) return;
  const confirmed = await useConfirmDialog().confirm({
    title: "清空提示词库",
    description: `确定清空${promptStore.activeWorkflow === "image-to-image" ? "图生图" : "文生图"}已保存提示词？`,
    confirmText: "清空",
    tone: "danger",
  });
  if (!confirmed) return;
  promptStore.replacePrompts(promptStore.prompts.filter((item) => item.workflow !== promptStore.activeWorkflow));
  void persistWorkspaceState();
  setStatus("success", "提示词库已清空。", 2200);
}

async function cleanupEmptyGeneratedDirs() {
  if (cleanupGeneratedPromise) return cleanupGeneratedPromise;
  cleanupGeneratedPromise = (async () => {
    isCleaningGeneratedDirs.value = true;
    try {
      const payload = await apiRequest<MaintenanceCleanupPayload>("/api/maintenance/generated/cleanup-empty-dirs", { method: "POST" });
      setStatus("success", payload?.removed_count ? `已清理 ${payload.removed_count} 个空文件夹。` : "没有需要清理的空文件夹。", 2200);
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      isCleaningGeneratedDirs.value = false;
      cleanupGeneratedPromise = null;
    }
  })();
  return cleanupGeneratedPromise;
}

async function initRuntime() {
  if (initialized) return;
  initialized = true;
  if (!watchersInitialized) {
    watchersInitialized = true;
    watch(forms, () => schedulePersistWorkspaceState(), { deep: true });
    watch(() => currentForm().quality, () => syncCurrentSizeForQuality(), { flush: "post" });
    watch(activeOutputProfileId, () => {
      (["generate", "image-to-image"] as WorkflowName[]).forEach((workflow) => {
        const normalized = normalizeOutputForm(forms[workflow], activeOutputProfileId.value);
        forms[workflow].quality = normalized.quality;
        forms[workflow].size = normalized.size;
        forms[workflow].count = normalized.count;
      });
      syncWorkflowAvailability();
    });
    watch(() => providerForm.compat_profile_id, () => syncWorkflowAvailability());
    watch(() => [providerForm.base_url, providerForm.api_key], () => {
      if (suppressProviderFormWatch) return;
      resetModelPicker("连接信息已变化，请先拉取模型");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void persistWorkspaceState();
      if (document.visibilityState === "visible") void refreshJobs({ silent: true });
    });
    window.addEventListener("focus", () => void refreshJobs({ silent: true }));
    window.addEventListener("beforeunload", () => void persistWorkspaceState());
  }
  syncPromptWorkflowLabel(useWorkspaceStore().activeWorkflow);
  await loadWorkspaceState();
  syncPromptWorkflowLabel(useWorkspaceStore().activeWorkflow);
  await loadProviderProfiles().catch((error) => setStatus("error", error instanceof Error ? error.message : String(error)));
  await refreshJobs({ silent: true });
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => void refreshJobs({ silent: true }), 3500);
  window.clearInterval(clockTimer);
  clockTimer = window.setInterval(() => {
    clockTick.value = Date.now();
  }, 1000);
  await nextTick();
}

export function useScimageRuntime() {
  const galleryStore = useGalleryStore();
  const jobStore = useJobStore();
  const providerStore = useProviderStore();
  const promptStore = usePromptStore();
  const workspaceStore = useWorkspaceStore();

  const visibleGalleryItems = galleryFlatItems;
  const currentWorkflowForm = computed(() => forms[workspaceStore.activeWorkflow]);

  return {
    addSourceFiles,
    addSourceImageFromGallery,
    addSourceImageFromUrl,
    activateProviderProfile,
    applyPrompt,
    appendPromptToken,
    removePromptToken,
    togglePromptToken,
    batchDelete,
    batchDownload,
    busyJobIds,
    clockTick,
    cleanupEmptyGeneratedDirs,
    clearPrompts,
    clearSelection,
    clearSourceImages,
    closeFailurePopup,
    closeLightbox,
    currentLightboxItem,
    currentWorkflowForm,
    deleteImage,
    deleteLightboxItem,
    deletePrompt,
    deleteProviderProfile,
    downloadItem,
    failurePopup,
    forms,
    galleryStore,
    generate,
    initRuntime,
    canGenerate,
    isCreatingJob,
    isCleaningGeneratedDirs,
    isActiveStatus,
    isRetryableJob,
    jobAction,
    jobStore,
    lightbox,
    lightboxItems,
    loadModels,
    loadMoreGallery,
    loadMoreJobs,
    modelPicker,
    navLightbox,
    openLightbox,
    openLightboxFromItems,
    providerForm,
    providerCanLoadModels,
    providerCanSaveAs,
    providerCanSaveCurrent,
    resolveGalleryTerminalAction,
    providerSaveBlockMessage,
    providerWorkflowAvailability,
    providerStore,
    promptStore,
    refreshJobs,
    removeSourceImage,
    resetFormState,
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
