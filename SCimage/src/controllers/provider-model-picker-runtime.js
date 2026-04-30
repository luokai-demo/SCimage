"use strict";

(() => {
  const MODEL_PLACEHOLDER_TEXT = "请选择 API 支持的模型";
  const MODEL_LOADING_TEXT = "正在拉取模型…";
  const MODEL_EMPTY_TEXT = "当前 API 没有返回可用模型";
  const MODEL_STALE_TEXT = "连接信息已变化，请先拉取模型";
  const MODEL_READY_HINT_PREFIX = "已加载";
  const MODEL_INVALID_SELECTION_TEXT = "当前已保存模型不在该 API 支持列表中，请重新选择。";

  const elements = {
    baseUrl: document.getElementById("baseUrl"),
    apiKey: document.getElementById("apiKey"),
    model: document.getElementById("model"),
    modelReloadBtn: document.getElementById("modelReloadBtn"),
    modelStatusHint: document.getElementById("modelStatusHint"),
  };

  const state = {
    apiRequest: null,
    sourceProfileIdResolver: null,
    availabilityChangeHandler: null,
    externalMessageHandler: null,
    requestId: 0,
    loadedSignature: "",
    models: [],
    profileModelId: "",
    status: "idle",
    message: "",
  };

  function init(options = {}) {
    state.apiRequest = options.apiRequest || null;
    state.sourceProfileIdResolver = options.resolveSourceProfileId || null;
    state.availabilityChangeHandler = options.onAvailabilityChange || null;
    state.externalMessageHandler = options.onMessage || null;

    bindEvents();
    renderPlaceholder(MODEL_PLACEHOLDER_TEXT);
    updateHint("", "");
    syncAvailability();
  }

  function bindEvents() {
    elements.baseUrl?.addEventListener("input", handleConnectionChange);
    elements.apiKey?.addEventListener("input", handleConnectionChange);
    elements.modelReloadBtn?.addEventListener("click", () => {
      fetchModels({ showStatus: true });
    });
    elements.model?.addEventListener("change", () => {
      syncAvailability();
    });
  }

  function applyProfile(profile) {
    if (!profile) {
      reset();
      return Promise.resolve();
    }
    state.profileModelId = String(profile.model || "").trim();
    return fetchModels({
      preferredModel: state.profileModelId,
      sourceProfileId: String(profile.id || "").trim(),
      showStatus: false,
    });
  }

  function reset() {
    state.requestId += 1;
    state.loadedSignature = "";
    state.models = [];
    state.profileModelId = "";
    state.status = "idle";
    state.message = "";
    renderPlaceholder(MODEL_PLACEHOLDER_TEXT);
    updateHint("", "");
    updateLoadingState(false);
    syncAvailability();
  }

  function canSave() {
    if (state.status === "loading") {
      return false;
    }
    if (state.status !== "ready") {
      return false;
    }
    if (state.loadedSignature !== currentSignature(resolveSourceProfileId())) {
      return false;
    }
    return hasSelectedSupportedModel();
  }

  function getSaveBlockMessage() {
    if (state.status === "loading") {
      return MODEL_LOADING_TEXT;
    }
    if (state.status === "stale") {
      return MODEL_STALE_TEXT;
    }
    if (state.status === "error") {
      return state.message || "拉取模型失败，请重试。";
    }
    if (!state.models.length) {
      return MODEL_EMPTY_TEXT;
    }
    if (!hasSelectedSupportedModel()) {
      return state.message === MODEL_INVALID_SELECTION_TEXT ? MODEL_INVALID_SELECTION_TEXT : MODEL_PLACEHOLDER_TEXT;
    }
    if (state.loadedSignature !== currentSignature(resolveSourceProfileId())) {
      return MODEL_STALE_TEXT;
    }
    return "";
  }

  function getSelectedModel() {
    return String(elements.model?.value || "").trim();
  }

  async function fetchModels(options = {}) {
    if (typeof state.apiRequest !== "function") {
      return;
    }

    const sourceProfileId = String(options.sourceProfileId || resolveSourceProfileId() || "").trim();
    const baseUrl = String(elements.baseUrl?.value || "").trim();
    const apiKey = String(elements.apiKey?.value || "").trim();
    if (!baseUrl) {
      state.status = "error";
      state.message = "请先填写 Base URL。";
      renderPlaceholder(MODEL_PLACEHOLDER_TEXT);
      updateHint(state.message, "error");
      syncAvailability();
      return;
    }
    if (!apiKey && !sourceProfileId) {
      state.status = "error";
      state.message = "请先填写 API Key。";
      renderPlaceholder(MODEL_PLACEHOLDER_TEXT);
      updateHint(state.message, "error");
      syncAvailability();
      return;
    }

    const requestId = state.requestId + 1;
    state.requestId = requestId;
    state.status = "loading";
    state.message = MODEL_LOADING_TEXT;
    updateLoadingState(true);
    renderPlaceholder(MODEL_LOADING_TEXT);
    updateHint(MODEL_LOADING_TEXT, "loading");
    syncAvailability();

    try {
      const payload = await state.apiRequest("/api/provider-profiles/models", {
        method: "POST",
        body: {
          base_url: baseUrl,
          api_key: apiKey,
          source_profile_id: sourceProfileId,
        },
      });

      if (requestId !== state.requestId) {
        return;
      }

      const normalizedBaseUrl = String(payload.normalized_base_url || "").trim() || baseUrl;
      if (elements.baseUrl) {
        elements.baseUrl.value = normalizedBaseUrl;
      }

      const models = Array.isArray(payload.models) ? payload.models : [];
      state.models = models
        .map((model) => ({
          id: String(model?.id || "").trim(),
          category: String(model?.category || "other").trim() === "image" ? "image" : "other",
        }))
        .filter((model) => model.id);
      state.loadedSignature = currentSignature(sourceProfileId);

      if (!state.models.length) {
        state.status = "error";
        state.message = MODEL_EMPTY_TEXT;
        renderPlaceholder(MODEL_EMPTY_TEXT);
        updateHint(MODEL_EMPTY_TEXT, "error");
        if (options.showStatus) {
          emitMessage("error", MODEL_EMPTY_TEXT);
        }
        return;
      }

      const preferredModel = String(
        options.preferredModel || getSelectedModel() || state.profileModelId,
      ).trim();
      const hasPreferredModel = state.models.some((model) => model.id === preferredModel);
      renderModels({
        models: state.models,
        selectedModel: hasPreferredModel ? preferredModel : "",
      });

      if (hasPreferredModel) {
        state.status = "ready";
        state.message = `${MODEL_READY_HINT_PREFIX} ${state.models.length} 个模型`;
        updateHint(state.message, "success");
        if (options.showStatus) {
          emitMessage("success", state.message);
        }
      } else {
        state.status = "ready";
        state.message = MODEL_INVALID_SELECTION_TEXT;
        updateHint(MODEL_INVALID_SELECTION_TEXT, "warning");
        if (options.showStatus) {
          emitMessage("success", `${MODEL_READY_HINT_PREFIX} ${state.models.length} 个模型`);
        }
      }
    } catch (error) {
      if (requestId !== state.requestId) {
        return;
      }
      state.status = "error";
      state.message = error?.message || "拉取模型失败，请重试。";
      state.models = [];
      state.loadedSignature = "";
      renderPlaceholder(MODEL_PLACEHOLDER_TEXT);
      updateHint(state.message, "error");
      if (options.showStatus) {
        emitMessage("error", state.message);
      }
    } finally {
      if (requestId === state.requestId) {
        updateLoadingState(false);
        syncAvailability();
      }
    }
  }

  function handleConnectionChange() {
    if (state.status === "loading") {
      state.requestId += 1;
      updateLoadingState(false);
    }
    state.models = [];
    state.loadedSignature = "";
    state.status = "stale";
    state.message = MODEL_STALE_TEXT;
    renderPlaceholder(MODEL_PLACEHOLDER_TEXT);
    updateHint(MODEL_STALE_TEXT, "warning");
    syncAvailability();
  }

  function renderModels(options) {
    if (!elements.model) {
      return;
    }
    const models = Array.isArray(options?.models) ? options.models : [];
    const selectedModel = String(options?.selectedModel || "").trim();
    elements.model.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = MODEL_PLACEHOLDER_TEXT;
    placeholder.disabled = true;
    placeholder.selected = !selectedModel;
    elements.model.appendChild(placeholder);

    appendModelGroup("图片模型", models.filter((model) => model.category === "image"));
    appendModelGroup("其他模型", models.filter((model) => model.category !== "image"));

    if (selectedModel) {
      elements.model.value = selectedModel;
    }
  }

  function appendModelGroup(label, models) {
    if (!elements.model || !models.length) {
      return;
    }
    const group = document.createElement("optgroup");
    group.label = label;
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.id;
      group.appendChild(option);
    });
    elements.model.appendChild(group);
  }

  function renderPlaceholder(text) {
    if (!elements.model) {
      return;
    }
    elements.model.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = text;
    option.selected = true;
    option.disabled = true;
    elements.model.appendChild(option);
    elements.model.value = "";
  }

  function updateLoadingState(isLoading) {
    if (elements.model) {
      elements.model.disabled = Boolean(isLoading);
    }
    if (elements.modelReloadBtn) {
      elements.modelReloadBtn.disabled = Boolean(isLoading);
      elements.modelReloadBtn.classList.toggle("is-loading", Boolean(isLoading));
    }
  }

  function updateHint(message, tone) {
    if (!elements.modelStatusHint) {
      return;
    }
    elements.modelStatusHint.textContent = message || "";
    elements.modelStatusHint.dataset.tone = tone || "";
  }

  function syncAvailability() {
    if (typeof state.availabilityChangeHandler === "function") {
      state.availabilityChangeHandler({
        canSave: canSave(),
        reason: getSaveBlockMessage(),
        isLoading: state.status === "loading",
      });
    }
  }

  function emitMessage(type, message) {
    if (typeof state.externalMessageHandler === "function" && message) {
      state.externalMessageHandler(type, message);
    }
  }

  function hasSelectedSupportedModel() {
    const selectedModel = getSelectedModel();
    return Boolean(selectedModel) && state.models.some((model) => model.id === selectedModel);
  }

  function resolveSourceProfileId() {
    if (typeof state.sourceProfileIdResolver === "function") {
      return String(state.sourceProfileIdResolver() || "").trim();
    }
    return "";
  }

  function currentSignature(sourceProfileId) {
    const baseUrl = normalizeBaseUrlForSignature(String(elements.baseUrl?.value || ""));
    const apiKey = String(elements.apiKey?.value || "").trim();
    const authToken = apiKey ? `key:${apiKey}` : `source:${String(sourceProfileId || "").trim()}`;
    return `${baseUrl}::${authToken}`;
  }

  function normalizeBaseUrlForSignature(value) {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (!normalized) {
      return "";
    }
    try {
      const url = new URL(normalized);
      if (!url.pathname || url.pathname === "/") {
        url.pathname = "/v1";
      }
      return url.toString().replace(/\/+$/, "");
    } catch (error) {
      return normalized;
    }
  }

  window.ProviderModelPicker = {
    applyProfile,
    canSave,
    fetchModels,
    getSaveBlockMessage,
    getSelectedModel,
    init,
    reset,
  };
})();
