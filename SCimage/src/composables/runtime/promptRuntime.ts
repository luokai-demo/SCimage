import {
  getDefaultQuality,
  getDefaultSizeOption,
  normalizeQuality,
  normalizeSizeOption,
} from "../../data/outputOptions";
import { usePromptStore, type SavedPrompt } from "../../stores/prompts";
import { useWorkspaceStore } from "../../stores/workspace";
import { formatDateTime } from "../../utils/jobFormatters";
import { useConfirmDialog } from "../useConfirmDialog";
import { usePromptLibraryDialog } from "../usePromptLibraryDialog";
import type { StatusTone } from "./status";
import type { RuntimeWorkspaceForm } from "./workspacePersistence";

interface PromptRuntimeOptions {
  currentForm: () => RuntimeWorkspaceForm;
  getActiveOutputProfileId: () => string;
  getOutputSummary: (form: RuntimeWorkspaceForm & { workflow?: string }, outputProfileId?: string) => string;
  normalizeCurrentOutputForm: () => void;
  persistWorkspaceState: () => Promise<void>;
  schedulePersistWorkspaceState: () => void;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}

export function createPromptRuntime(options: PromptRuntimeOptions) {
  function savePrompt() {
    const promptStore = usePromptStore();
    const workspaceStore = useWorkspaceStore();
    const form = options.currentForm();
    const prompt = form.prompt.trim();
    if (!prompt) {
      options.setStatus("error", "请先输入提示词。", 2200);
      document.getElementById("prompt")?.focus();
      return;
    }
    options.normalizeCurrentOutputForm();
    const now = new Date().toISOString();
    const outputProfileId = options.getActiveOutputProfileId();
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
      optionSummary: options.getOutputSummary({ ...form, workflow }, outputProfileId),
      savedAtText: `保存于 ${formatDateTime(now)}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    promptStore.replacePrompts([
      item,
      ...promptStore.prompts.filter((saved) => !(saved.workflow === workflow && saved.prompt === prompt)),
    ]);
    void options.persistWorkspaceState();
    usePromptLibraryDialog().setOpen(true);
    options.setStatus("success", `已保存到${workflow === "image-to-image" ? "图生图" : "文生图"}词库。`, 2200);
  }

  function applyPrompt(prompt: SavedPrompt) {
    const form = options.currentForm();
    const outputProfileId = options.getActiveOutputProfileId();
    form.prompt = prompt.prompt;
    form.quality = normalizeQuality(prompt.quality, getDefaultQuality(outputProfileId), outputProfileId);
    form.size = normalizeSizeOption(prompt.size, getDefaultSizeOption(), form.quality, outputProfileId);
    form.count = String(prompt.count || 1);
    options.schedulePersistWorkspaceState();
    usePromptLibraryDialog().setOpen(false);
    options.setStatus("success", "提示词已载入。", 2200);
  }

  function appendPromptToken(token: string) {
    const value = token.trim();
    if (!value) return;
    const form = options.currentForm();
    form.prompt = composePromptTokens(splitPromptTokens(form.prompt), [value]);
  }

  function removePromptToken(token: string) {
    const value = token.trim();
    if (!value) return;
    const form = options.currentForm();
    form.prompt = splitPromptTokens(form.prompt).filter((item) => item !== value).join("，");
  }

  function togglePromptToken(token: string) {
    const value = token.trim();
    if (!value) return;
    const currentTokens = splitPromptTokens(options.currentForm().prompt);
    if (currentTokens.includes(value)) {
      removePromptToken(value);
      return;
    }
    appendPromptToken(value);
  }

  function deletePrompt(id: string) {
    const promptStore = usePromptStore();
    promptStore.replacePrompts(promptStore.prompts.filter((item) => !(item.workflow === promptStore.activeWorkflow && item.id === id)));
    void options.persistWorkspaceState();
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
    void options.persistWorkspaceState();
    options.setStatus("success", "提示词库已清空。", 2200);
  }

  return {
    applyPrompt,
    appendPromptToken,
    clearPrompts,
    deletePrompt,
    removePromptToken,
    savePrompt,
    togglePromptToken,
  };
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
