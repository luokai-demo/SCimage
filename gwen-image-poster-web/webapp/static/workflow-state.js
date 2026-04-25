"use strict";

(() => {
  const OUTPUT_OPTIONS = window.OutputOptions;
  if (!OUTPUT_OPTIONS) {
    throw new Error("OutputOptions must be loaded before workflow-state.js");
  }

  const FORM_STORAGE_KEY = "image_workbench_form_state_v1";
  const PROMPT_BANK_KEY = "image_workbench_saved_prompts_v1";
  const ACTIVE_WORKFLOW_KEY = "image_workbench_active_tab_v1";
  const LEGACY_STORAGE_KEYS = {
    [FORM_STORAGE_KEY]: ["gwen_local_form_state_v1"],
    [PROMPT_BANK_KEY]: ["gwen_saved_prompts_v1"],
    [ACTIVE_WORKFLOW_KEY]: ["gwen_active_tab_v1"],
  };

  const WORKFLOW_IDS = ["generate", "image-to-image"];
  const DEFAULT_WORKFLOW = "generate";
  const FORM_STORE_VERSION = 3;
  const DEFAULT_FORM_BY_WORKFLOW = {
    generate: {
      prompt: "",
      size: OUTPUT_OPTIONS.DEFAULT_SIZE_OPTION,
      quality: OUTPUT_OPTIONS.DEFAULT_QUALITY,
      count: "1",
    },
    "image-to-image": {
      prompt: "",
      size: OUTPUT_OPTIONS.DEFAULT_SIZE_OPTION,
      quality: OUTPUT_OPTIONS.DEFAULT_QUALITY,
      count: "1",
    },
  };

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

  function parseJsonStorage(storageKey, fallback) {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error(`Failed to parse localStorage key ${storageKey}:`, error);
      return fallback;
    }
  }

  function writeJsonStorage(storageKey, value) {
    localStorage.setItem(storageKey, JSON.stringify(value));
  }

  function migrateLegacyStorage() {
    Object.entries(LEGACY_STORAGE_KEYS).forEach(([targetKey, legacyKeys]) => {
      if (localStorage.getItem(targetKey) != null) {
        return;
      }
      const legacyKey = legacyKeys.find((key) => localStorage.getItem(key) != null);
      if (!legacyKey) {
        return;
      }
      localStorage.setItem(targetKey, localStorage.getItem(legacyKey));
    });
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function cloneDefaultForm(workflow) {
    return { ...DEFAULT_FORM_BY_WORKFLOW[normalizeWorkflow(workflow)] };
  }

  function normalizeForm(rawForm, workflow) {
    const defaults = cloneDefaultForm(workflow);
    const form = rawForm && typeof rawForm === "object" ? rawForm : {};
    const nextForm = {
      prompt: String(form.prompt ?? defaults.prompt),
      size: OUTPUT_OPTIONS.normalizeSizeOption(form.size ?? defaults.size, defaults.size),
      quality: OUTPUT_OPTIONS.normalizeQuality(form.quality ?? defaults.quality, defaults.quality),
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
    return { version: FORM_STORE_VERSION, workflows };
  }

  function normalizeLegacyForm(rawForm, workflow) {
    const defaults = cloneDefaultForm(workflow);
    const form = rawForm && typeof rawForm === "object" ? rawForm : {};
    return normalizeForm(
      {
        prompt: form.prompt ?? defaults.prompt,
        size: defaults.size,
        quality: defaults.quality,
        count: form.count ?? defaults.count,
      },
      workflow
    );
  }

  function normalizePromptMap(rawPrompts, legacyPrompt = "") {
    const prompts = {};
    WORKFLOW_IDS.forEach((workflow) => {
      prompts[workflow] = "";
    });
    const hasWorkflowPromptState = rawPrompts && typeof rawPrompts === "object" && !Array.isArray(rawPrompts);
    if (hasWorkflowPromptState) {
      Object.entries(rawPrompts).forEach(([workflow, prompt]) => {
        const normalizedWorkflow = normalizeWorkflow(workflow, "");
        if (normalizedWorkflow) {
          prompts[normalizedWorkflow] = String(prompt || "");
        }
      });
      return prompts;
    }
    if (typeof legacyPrompt === "string") {
      prompts.generate = legacyPrompt;
    }
    return prompts;
  }

  function normalizeFormStore(rawStore) {
    const store = createEmptyFormStore();
    const raw = rawStore && typeof rawStore === "object" ? rawStore : null;
    if (!raw) {
      return store;
    }

    if (raw.workflows && typeof raw.workflows === "object") {
      const useLegacyOutputDefaults = Number(raw.version || 0) < FORM_STORE_VERSION;
      WORKFLOW_IDS.forEach((workflow) => {
        store.workflows[workflow] = useLegacyOutputDefaults
          ? normalizeLegacyForm(raw.workflows[workflow], workflow)
          : normalizeForm(raw.workflows[workflow], workflow);
      });
      return store;
    }

    const prompts = normalizePromptMap(raw.promptsByWorkflow, raw.prompt);
    WORKFLOW_IDS.forEach((workflow) => {
      store.workflows[workflow] = normalizeLegacyForm(
        {
          prompt: prompts[workflow],
          count: raw.count,
        },
        workflow
      );
    });
    return store;
  }

  function readFormStore() {
    migrateLegacyStorage();
    return normalizeFormStore(parseJsonStorage(FORM_STORAGE_KEY, null));
  }

  function writeFormStore(store) {
    writeJsonStorage(FORM_STORAGE_KEY, normalizeFormStore(store));
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
    migrateLegacyStorage();
    return normalizeWorkflow(localStorage.getItem(ACTIVE_WORKFLOW_KEY), DEFAULT_WORKFLOW);
  }

  function writeActiveWorkflow(workflow) {
    localStorage.setItem(ACTIVE_WORKFLOW_KEY, normalizeWorkflow(workflow));
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
    return {
      id: String(entry.id || createId()),
      workflow,
      prompt,
      size: OUTPUT_OPTIONS.normalizeSizeOption(entry.size),
      quality: OUTPUT_OPTIONS.normalizeQuality(entry.quality),
      count: Number.parseInt(entry.count, 10) || 1,
      createdAt: entry.createdAt || entry.updatedAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
    };
  }

  function createEmptyPromptBankStore() {
    const workflows = {};
    WORKFLOW_IDS.forEach((workflow) => {
      workflows[workflow] = [];
    });
    return { version: 2, workflows };
  }

  function normalizePromptBankStore(rawStore) {
    const store = createEmptyPromptBankStore();
    if (Array.isArray(rawStore)) {
      rawStore.forEach((entry) => {
        const normalizedEntry = normalizePromptEntry(entry, normalizeWorkflow(entry?.workflow, DEFAULT_WORKFLOW));
        if (normalizedEntry) {
          store.workflows[normalizedEntry.workflow].push(normalizedEntry);
        }
      });
      return store;
    }

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

  function readPromptBankStore() {
    migrateLegacyStorage();
    return normalizePromptBankStore(parseJsonStorage(PROMPT_BANK_KEY, null));
  }

  function writePromptBankStore(store) {
    writeJsonStorage(PROMPT_BANK_KEY, normalizePromptBankStore(store));
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
    normalizeForm,
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
  };
})();
