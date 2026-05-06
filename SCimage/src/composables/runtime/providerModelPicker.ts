import { nextTick, reactive } from "vue";
import type { ProviderModelsPayload } from "../../contracts/api";
import { apiRequest } from "./apiClient";
import { normalizeBaseUrlForSignature } from "./providerProfiles";
import type { StatusTone } from "./status";

export type ModelPickerStatus = "idle" | "loading" | "ready" | "stale" | "error";
export type ModelPickerTone = "loading" | "success" | "warning" | "error" | "";

export interface ModelOption {
  id: string;
  label: string;
  category: "image" | "other";
}

export interface LoadModelsOptions {
  preferredModel?: string;
  showStatus?: boolean;
  sourceProfileId?: string;
}

export interface ProviderFormState {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  compat_profile_id: string;
  supports_count_parameter: boolean;
}

interface ProviderModelPickerOptions {
  providerForm: ProviderFormState;
  getSelectedProviderSourceId: () => string;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
  shouldSuppressProviderFormWatch: () => boolean;
  setSuppressProviderFormWatch: (value: boolean) => void;
}

export const MODEL_PLACEHOLDER_TEXT = "请选择 API 支持的模型";
export const MODEL_LOADING_TEXT = "正在拉取模型…";
export const MODEL_EMPTY_TEXT = "当前 API 没有返回可用模型";
export const MODEL_STALE_TEXT = "连接信息已变化，请先拉取模型";
export const MODEL_READY_HINT_PREFIX = "已加载";
export const MODEL_INVALID_SELECTION_TEXT = "当前已保存模型不在该 API 支持列表中，请重新选择。";
export const MODEL_FETCH_FAILED_TEXT = "拉取模型失败，请重试。";

export function createProviderModelPicker(options: ProviderModelPickerOptions) {
  const modelPicker = reactive({
    loading: false,
    message: "",
    messageTone: "" as ModelPickerTone,
    options: [] as ModelOption[],
    hasLoaded: false,
    status: "idle" as ModelPickerStatus,
    loadedSignature: "",
  });
  let modelPickerRequestId = 0;

  function currentModelSignature(sourceProfileId = options.getSelectedProviderSourceId()) {
    const baseUrl = normalizeBaseUrlForSignature(options.providerForm.base_url);
    const apiKey = options.providerForm.api_key.trim();
    const authToken = apiKey ? `key:${apiKey}` : `source:${String(sourceProfileId || "").trim()}`;
    return `${baseUrl}::${authToken}`;
  }

  function hasSelectedSupportedModel() {
    const selectedModel = options.providerForm.model.trim();
    return Boolean(selectedModel) && modelPicker.options.some((model) => model.id === selectedModel);
  }

  function setModelPickerMessage(message = "", tone: ModelPickerTone = "") {
    modelPicker.message = message;
    modelPicker.messageTone = tone;
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

  function invalidateModelPicker() {
    modelPickerRequestId += 1;
  }

  function handleProviderConnectionChanged() {
    if (options.shouldSuppressProviderFormWatch()) return;
    resetModelPicker(MODEL_STALE_TEXT);
  }

  async function loadModels(loadOptions: LoadModelsOptions = {}) {
    const sourceProfileId = String(loadOptions.sourceProfileId || options.getSelectedProviderSourceId() || "").trim();
    const baseUrl = options.providerForm.base_url.trim();
    const apiKey = options.providerForm.api_key.trim();
    if (!options.providerForm.base_url.trim()) {
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
        options.setSuppressProviderFormWatch(true);
        options.providerForm.base_url = String(payload.normalized_base_url);
        void nextTick(() => {
          options.setSuppressProviderFormWatch(false);
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
        if (loadOptions.showStatus !== false) options.setStatus("error", MODEL_EMPTY_TEXT, 2200);
        return;
      }
      const preferredModel = String(loadOptions.preferredModel || options.providerForm.model || "").trim();
      const hasPreferredModel = modelPicker.options.some((model) => model.id === preferredModel);
      options.providerForm.model = hasPreferredModel ? preferredModel : "";
      modelPicker.status = "ready";
      if (hasPreferredModel) {
        setModelPickerMessage(`${MODEL_READY_HINT_PREFIX} ${modelPicker.options.length} 个模型`, "success");
      } else {
        setModelPickerMessage(MODEL_INVALID_SELECTION_TEXT, "warning");
      }
      if (loadOptions.showStatus !== false) {
        options.setStatus("success", `${MODEL_READY_HINT_PREFIX} ${modelPicker.options.length} 个模型。`, 1800);
      }
    } catch (error) {
      if (requestId !== modelPickerRequestId) return;
      modelPicker.status = "error";
      modelPicker.loadedSignature = "";
      modelPicker.options = [];
      modelPicker.hasLoaded = false;
      const message = error instanceof Error ? error.message : String(error || MODEL_FETCH_FAILED_TEXT);
      setModelPickerMessage(message || MODEL_FETCH_FAILED_TEXT, "error");
      if (loadOptions.showStatus !== false) options.setStatus("error", message || MODEL_FETCH_FAILED_TEXT, 2200);
    } finally {
      if (requestId === modelPickerRequestId) {
        modelPicker.loading = false;
      }
    }
  }

  return {
    currentModelSignature,
    handleProviderConnectionChanged,
    hasSelectedSupportedModel,
    invalidateModelPicker,
    loadModels,
    modelPicker,
    resetModelPicker,
  };
}
