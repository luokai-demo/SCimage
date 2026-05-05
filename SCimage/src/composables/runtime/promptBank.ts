import type { PromptBankEntryPayload, PromptBankPayload } from "../../contracts/api";
import {
  getDefaultQuality,
  getDefaultSizeOption,
  normalizeOutputForm,
  normalizeOutputProfileId,
} from "../../data/outputOptions";
import type { SavedPrompt } from "../../stores/prompts";
import type { WorkflowName } from "../../stores/workspace";
import { formatDateTime, getOutputOptionSummary } from "../../utils/jobFormatters";

export function normalizePromptEntry(
  entry: PromptBankEntryPayload,
  fallbackWorkflow: WorkflowName,
  activeOutputProfileId: string,
): SavedPrompt | null {
  const prompt = String(entry?.prompt || "").trim();
  if (!prompt) return null;
  const workflow = entry?.workflow === "image-to-image" ? "image-to-image" : fallbackWorkflow;
  const outputProfileId = normalizeOutputProfileId(entry?.outputProfileId || entry?.output_profile_id || activeOutputProfileId);
  const normalized = normalizeOutputForm(entry || {}, outputProfileId);
  const rawSize = String(entry?.size ?? "").trim();
  const summarySource = { ...normalized, size: rawSize || normalized.size, workflow, outputProfileId };
  const createdAt = String(entry?.createdAt || entry?.created_at || entry?.updatedAt || entry?.updated_at || new Date().toISOString());
  const updatedAt = String(entry?.updatedAt || entry?.updated_at || createdAt);
  return {
    id: String(entry?.id || crypto.randomUUID?.() || Date.now()),
    workflow,
    prompt,
    outputProfileId,
    size: normalized.size,
    quality: normalized.quality,
    count: Number.parseInt(normalized.count, 10) || 1,
    optionSummary: getOutputOptionSummary(summarySource, outputProfileId),
    savedAtText: `保存于 ${formatDateTime(updatedAt)}`,
    createdAt,
    updatedAt,
  };
}

export function flattenPromptBank(
  promptBank: PromptBankPayload | undefined,
  activeOutputProfileId: string,
): SavedPrompt[] {
  if (Array.isArray(promptBank)) {
    return promptBank
      .map((entry) => normalizePromptEntry(entry, "generate", activeOutputProfileId))
      .filter(Boolean) as SavedPrompt[];
  }
  const result: SavedPrompt[] = [];
  (["generate", "image-to-image"] as WorkflowName[]).forEach((workflow) => {
    const entries = Array.isArray(promptBank?.[workflow]) ? promptBank[workflow] : [];
    entries.forEach((entry) => {
      const normalized = normalizePromptEntry(entry, workflow, activeOutputProfileId);
      if (normalized) result.push(normalized);
    });
  });
  return result;
}

export function buildPromptBankPayload(
  prompts: SavedPrompt[],
  activeOutputProfileId: string,
) {
  return (["generate", "image-to-image"] as WorkflowName[]).reduce((payload, workflow) => {
    payload[workflow] = prompts
      .filter((item) => item.workflow === workflow)
      .map((item) => ({
        id: item.id,
        workflow,
        prompt: item.prompt,
        outputProfileId: item.outputProfileId || activeOutputProfileId,
        size: item.size || getDefaultSizeOption(),
        quality: item.quality || getDefaultQuality(item.outputProfileId || activeOutputProfileId),
        count: Number.parseInt(String(item.count || 1), 10) || 1,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      }));
    return payload;
  }, {} as Record<WorkflowName, Array<Record<string, unknown>>>);
}
