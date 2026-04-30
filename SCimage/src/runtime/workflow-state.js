"use strict";

(() => {
  const OUTPUT_OPTIONS = window.OutputOptions;
  if (!OUTPUT_OPTIONS) {
    throw new Error("OutputOptions must be loaded before workflow-state.js");
  }

  const WORKFLOW_STATE_API_PATH = "/api/workspace-state";
  const PERSIST_DEBOUNCE_MS = 160;
  const RETRY_PERSIST_MS = 400;

  const WORKFLOW_IDS = ["generate", "image-to-image"];
  const DEFAULT_WORKFLOW = "generate";
  const GALLERY_FILTER_IDS = ["all", "tasks", "prompts"];
  const DEFAULT_GALLERY_FILTER = "all";

  let apiRequestFn = null;
  let formStoreCache = createEmptyFormStore();
  let promptBankStoreCache = createEmptyPromptBankStore();
  let activeWorkflowCache = DEFAULT_WORKFLOW;
  let galleryUiStateCache = createDefaultGalleryUiState();
  let persistTimer = null;
  let persistInFlight = null;
  let persistDirty = false;

  function isSupportedWorkflow(value) {
    return WORKFLOW_IDS.includes(String(value || "").trim().toLowerCase());
  }

  function normalizeWorkflow(value, fallback = DEFAULT_WORKFLOW) {
    const normalized = String(value || "").trim().toLowerCase();
    if (isSupportedWorkflow(normalized)) {
      return normalized;
    }
    return isSupportedWorkflow(fallback) ? fallback : "";
  }

  function isSupportedGalleryFilter(value) {
    return GALLERY_FILTER_IDS.includes(String(value || "").trim().toLowerCase());
  }

  function normalizeGalleryFilter(value, fallback = DEFAULT_GALLERY_FILTER) {
    const normalized = String(value || "").trim().toLowerCase();
    if (isSupportedGalleryFilter(normalized)) {
      return normalized;
    }
    return isSupportedGalleryFilter(fallback) ? fallback : DEFAULT_GALLERY_FILTER;
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function cloneDefaultForm() {
    return {
      prompt: "",
      size: OUTPUT_OPTIONS.getDefaultSizeOption(),
      quality: OUTPUT_OPTIONS.getDefaultQuality(),
      count: "1",
    };
  }

  function normalizeForm(rawForm, workflow) {
    const defaults = cloneDefaultForm(workflow);
    const form = rawForm && typeof rawForm === "object" ? rawForm : {};
    const rawSize = form.size ?? defaults.size;
    const nextQuality = OUTPUT_OPTIONS.normalizeQuality(
      form.quality ?? OUTPUT_OPTIONS.inferQualityFromSize(rawSize, defaults.quality),
      defaults.quality
    );
    const nextForm = {
      prompt: String(form.prompt ?? defaults.prompt),
      size: OUTPUT_OPTIONS.normalizeSizeOption(rawSize, defaults.size, nextQuality),
      quality: nextQuality,
      count: String(form.count ?? defaults.count),
    };
    if (!nextForm.count || Number.isNaN(Number.parseInt(nextForm.count, 10))) {
      nextForm.count = defaults.count;
    }
    return nextForm;
  }

  function createEmptyFormStore() {
    const workflows = {};
    WORKFLOW_IDS.forEach((workflow) => {
      workflows[workflow] = cloneDefaultForm(workflow);
    });
    return { workflows };
  }

  function normalizeFormStore(rawStore) {
    const store = createEmptyFormStore();
    const raw = rawStore && typeof rawStore === "object" ? rawStore : null;
    if (!raw) {
      return store;
    }

    if (raw.workflows && typeof raw.workflows === "object") {
      WORKFLOW_IDS.forEach((workflow) => {
        store.workflows[workflow] = normalizeForm(raw.workflows[workflow], workflow);
      });
    }
    return store;
  }

  function normalizePromptEntry(entry, fallbackWorkflow) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const prompt = String(entry.prompt || "").trim();
    if (!prompt) {
      return null;
    }
    const workflow = normalizeWorkflow(entry.workflow, fallbackWorkflow);
    const outputProfileId = OUTPUT_OPTIONS.normalizeOutputProfileId(
      entry.outputProfileId ?? entry.output_profile_id,
      OUTPUT_OPTIONS.getActiveOutputProfileId()
    );
    const rawSize = entry.size;
    const nextQuality = OUTPUT_OPTIONS.normalizeQuality(
      entry.quality ?? OUTPUT_OPTIONS.inferQualityFromSize(rawSize, OUTPUT_OPTIONS.getDefaultQuality(outputProfileId), outputProfileId),
      OUTPUT_OPTIONS.getDefaultQuality(outputProfileId),
      outputProfileId
    );
    return {
      id: String(entry.id || createId()),
      workflow,
      prompt,
      outputProfileId,
      size: OUTPUT_OPTIONS.normalizeSizeOption(rawSize, OUTPUT_OPTIONS.getDefaultSizeOption(outputProfileId), nextQuality, outputProfileId),
      quality: nextQuality,
      count: Number.parseInt(entry.count, 10) || 1,
      createdAt: entry.createdAt || entry.created_at || entry.updatedAt || entry.updated_at || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.updated_at || entry.createdAt || entry.created_at || new Date().toISOString(),
    };
  }

  function createEmptyPromptBankStore() {
    const workflows = {};
    WORKFLOW_IDS.forEach((workflow) => {
      workflows[workflow] = [];
    });
    return { workflows };
  }

  function createDefaultGalleryUiState() {
    return {
      filter: DEFAULT_GALLERY_FILTER,
    };
  }

  function normalizeGalleryUiState(rawState) {
    const state = rawState && typeof rawState === "object" ? rawState : {};
    return {
      filter: normalizeGalleryFilter(state.filter, DEFAULT_GALLERY_FILTER),
    };
  }

  function normalizePromptBankStore(rawStore) {
    const store = createEmptyPromptBankStore();
    if (rawStore?.workflows && typeof rawStore.workflows === "object") {
      Object.entries(rawStore.workflows).forEach(([workflow, entries]) => {
        const normalizedWorkflow = normalizeWorkflow(workflow, "");
        if (!normalizedWorkflow || !Array.isArray(entries)) {
          return;
        }
        store.workflows[normalizedWorkflow] = entries
          .map((entry) => normalizePromptEntry(entry, normalizedWorkflow))
          .filter(Boolean);
      });
    }
    return store;
  }

  function createDefaultState() {
    return {
      active_workflow: DEFAULT_WORKFLOW,
      forms: createEmptyFormStore().workflows,
      prompt_bank: createEmptyPromptBankStore().workflows,
      ui: {
        gallery: createDefaultGalleryUiState(),
      },
    };
  }

  function normalizeServerState(payload) {
    const state = createDefaultState();
    if (!payload || typeof payload !== "object") {
      return state;
    }

    state.active_workflow = normalizeWorkflow(payload.active_workflow, DEFAULT_WORKFLOW);

    if (payload.forms && typeof payload.forms === "object") {
      WORKFLOW_IDS.forEach((workflow) => {
        state.forms[workflow] = normalizeForm(payload.forms[workflow], workflow);
      });
    }

    if (payload.prompt_bank && typeof payload.prompt_bank === "object") {
      WORKFLOW_IDS.forEach((workflow) => {
        const entries = payload.prompt_bank[workflow];
        state.prompt_bank[workflow] = Array.isArray(entries)
          ? entries.map((entry) => normalizePromptEntry(entry, workflow)).filter(Boolean)
          : [];
      });
    }

    if (payload.ui && typeof payload.ui === "object") {
      state.ui.gallery = normalizeGalleryUiState(payload.ui.gallery);
    }

    return state;
  }

  function snapshotState() {
    const normalizedForms = normalizeFormStore(formStoreCache);
    const normalizedPromptBank = normalizePromptBankStore(promptBankStoreCache);
    return {
      active_workflow: normalizeWorkflow(activeWorkflowCache, DEFAULT_WORKFLOW),
      forms: normalizedForms.workflows,
      prompt_bank: normalizedPromptBank.workflows,
      ui: {
        gallery: normalizeGalleryUiState(galleryUiStateCache),
      },
    };
  }

  function applyServerState(payload) {
    const normalized = normalizeServerState(payload);
    formStoreCache = { workflows: normalized.forms };
    promptBankStoreCache = { workflows: normalized.prompt_bank };
    activeWorkflowCache = normalized.active_workflow;
    galleryUiStateCache = normalizeGalleryUiState(normalized.ui.gallery);
    return snapshotState();
  }

  function markDirty() {
    persistDirty = true;
    if (!apiRequestFn) {
      return;
    }
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      void flush();
    }, PERSIST_DEBOUNCE_MS);
  }

  async function flush() {
    window.clearTimeout(persistTimer);
    persistTimer = null;

    if (!apiRequestFn || !persistDirty) {
      return snapshotState();
    }
    if (persistInFlight) {
      return persistInFlight;
    }

    persistDirty = false;
    const payload = snapshotState();
    persistInFlight = apiRequestFn(WORKFLOW_STATE_API_PATH, {
      method: "PUT",
      body: payload,
      timeoutMs: 8000,
    })
      .then((serverState) => applyServerState(serverState))
      .catch((error) => {
        console.error("Failed to persist workflow state:", error);
        persistDirty = true;
        return snapshotState();
      })
      .finally(() => {
        persistInFlight = null;
        if (persistDirty && apiRequestFn) {
          window.clearTimeout(persistTimer);
          persistTimer = window.setTimeout(() => {
            void flush();
          }, RETRY_PERSIST_MS);
        }
      });

    return persistInFlight;
  }

  async function init(options = {}) {
    apiRequestFn = typeof options.apiRequest === "function" ? options.apiRequest : null;
    persistDirty = false;
    window.clearTimeout(persistTimer);
    persistTimer = null;
    formStoreCache = createEmptyFormStore();
    promptBankStoreCache = createEmptyPromptBankStore();
    activeWorkflowCache = DEFAULT_WORKFLOW;
    galleryUiStateCache = createDefaultGalleryUiState();

    if (!apiRequestFn) {
      return snapshotState();
    }

    try {
      const serverState = normalizeServerState(
        await apiRequestFn(WORKFLOW_STATE_API_PATH, {
          method: "GET",
          timeoutMs: 5000,
        })
      );
      return applyServerState(serverState);
    } catch (error) {
      console.error("Failed to hydrate workflow state:", error);
      return snapshotState();
    }
  }

  function readFormStore() {
    return normalizeFormStore(formStoreCache);
  }

  function writeFormStore(store) {
    formStoreCache = normalizeFormStore(store);
    markDirty();
  }

  function readForm(workflow) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    return readFormStore().workflows[normalizedWorkflow] || cloneDefaultForm(normalizedWorkflow);
  }

  function writeForm(workflow, form) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    const store = readFormStore();
    store.workflows[normalizedWorkflow] = normalizeForm(form, normalizedWorkflow);
    writeFormStore(store);
  }

  function resetForms() {
    writeFormStore(createEmptyFormStore());
  }

  function readActiveWorkflow() {
    return normalizeWorkflow(activeWorkflowCache, DEFAULT_WORKFLOW);
  }

  function writeActiveWorkflow(workflow) {
    activeWorkflowCache = normalizeWorkflow(workflow);
    markDirty();
  }

  function readGalleryState() {
    return normalizeGalleryUiState(galleryUiStateCache);
  }

  function readGalleryFilter() {
    return readGalleryState().filter;
  }

  function writeGalleryState(state) {
    galleryUiStateCache = normalizeGalleryUiState(state);
    markDirty();
  }

  function writeGalleryFilter(filter) {
    writeGalleryState({
      ...readGalleryState(),
      filter,
    });
  }

  function readPromptBankStore() {
    return normalizePromptBankStore(promptBankStoreCache);
  }

  function writePromptBankStore(store) {
    promptBankStoreCache = normalizePromptBankStore(store);
    markDirty();
  }

  function readPromptBank(workflow) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    return readPromptBankStore().workflows[normalizedWorkflow] || [];
  }

  function writePromptBank(workflow, promptBank) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    const store = readPromptBankStore();
    store.workflows[normalizedWorkflow] = (Array.isArray(promptBank) ? promptBank : [])
      .map((entry) => normalizePromptEntry(entry, normalizedWorkflow))
      .filter(Boolean);
    writePromptBankStore(store);
  }

  function savePrompt(workflow, entry) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    const promptBank = readPromptBank(normalizedWorkflow);
    const prompt = String(entry?.prompt || "").trim();
    const existing = promptBank.find((item) => item.prompt === prompt);
    const nextEntry = normalizePromptEntry(
      {
        ...entry,
        id: existing ? existing.id : createId(),
        workflow: normalizedWorkflow,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      normalizedWorkflow
    );
    if (!nextEntry) {
      return null;
    }
    const nextPromptBank = [nextEntry, ...promptBank.filter((item) => item.prompt !== prompt)].slice(0, 120);
    writePromptBank(normalizedWorkflow, nextPromptBank);
    return nextEntry;
  }

  function findPrompt(workflow, promptId) {
    return readPromptBank(workflow).find((item) => item.id === promptId) || null;
  }

  function deletePrompt(workflow, promptId) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    writePromptBank(
      normalizedWorkflow,
      readPromptBank(normalizedWorkflow).filter((item) => item.id !== promptId)
    );
  }

  function clearPromptBank(workflow) {
    writePromptBank(workflow, []);
  }

  window.WorkflowState = {
    WORKFLOW_IDS,
    DEFAULT_WORKFLOW,
    isSupportedWorkflow,
    normalizeWorkflow,
    isSupportedGalleryFilter,
    normalizeGalleryFilter,
    normalizeForm,
    init,
    flush,
    readForm,
    writeForm,
    resetForms,
    readActiveWorkflow,
    writeActiveWorkflow,
    readPromptBank,
    savePrompt,
    findPrompt,
    deletePrompt,
    clearPromptBank,
    readGalleryState,
    readGalleryFilter,
    writeGalleryState,
    writeGalleryFilter,
  };
})();
