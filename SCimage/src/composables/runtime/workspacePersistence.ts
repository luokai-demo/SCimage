import type { WorkspaceOutputFormPayload, WorkspaceStatePayload } from "../../contracts/api";
import { normalizeOutputForm } from "../../data/outputOptions";
import { useGalleryStore, type GalleryFilter } from "../../stores/gallery";
import { usePromptStore } from "../../stores/prompts";
import { useWorkspaceStore, type WorkflowName } from "../../stores/workspace";
import { apiRequest } from "./apiClient";
import { buildPromptBankPayload, flattenPromptBank } from "./promptBank";

export interface RuntimeWorkspaceForm {
  prompt: string;
  size: string;
  quality: string;
  count: string;
}

interface WorkspacePersistenceOptions {
  forms: Record<WorkflowName, RuntimeWorkspaceForm>;
  getActiveOutputProfileId: () => string;
  syncPromptWorkflowLabel: (workflow: WorkflowName) => void;
}

const WORKFLOWS: WorkflowName[] = ["generate", "image-to-image"];

export function createWorkspacePersistenceController(options: WorkspacePersistenceOptions) {
  let persistTimer = 0;
  let persistRetryTimer = 0;
  let persistInFlight: Promise<void> | null = null;
  let persistDirty = false;
  let isHydrating = false;

  function promptBankPayload() {
    const promptStore = usePromptStore();
    return buildPromptBankPayload(promptStore.prompts, options.getActiveOutputProfileId());
  }

  async function loadWorkspaceState() {
    let payload: WorkspaceStatePayload;
    try {
      payload = await apiRequest<WorkspaceStatePayload>("/api/workspace-state", { method: "GET" });
    } catch {
      return;
    }
    isHydrating = true;
    try {
      const workspaceStore = useWorkspaceStore();
      const promptStore = usePromptStore();
      const active = payload?.active_workflow === "image-to-image" ? "image-to-image" : "generate";
      workspaceStore.setWorkflow(active);
      options.syncPromptWorkflowLabel(active);
      WORKFLOWS.forEach((workflow) => {
        const form: WorkspaceOutputFormPayload = payload?.forms?.[workflow] || {};
        const normalized = normalizeOutputForm(form, options.getActiveOutputProfileId());
        options.forms[workflow].prompt = normalized.prompt;
        options.forms[workflow].size = normalized.size;
        options.forms[workflow].quality = normalized.quality;
        options.forms[workflow].count = normalized.count;
      });
      promptStore.replacePrompts(flattenPromptBank(
        payload?.prompt_bank || payload?.saved_prompts,
        options.getActiveOutputProfileId(),
      ));
      const filter = payload?.ui?.gallery?.filter;
      if (isGalleryFilter(filter)) {
        useGalleryStore().setFilter(filter);
      }
    } finally {
      isHydrating = false;
    }
  }

  async function persistWorkspaceState() {
    if (isHydrating) return persistInFlight || Promise.resolve();
    persistDirty = true;
    window.clearTimeout(persistTimer);
    if (persistInFlight) return persistInFlight;
    const workspaceStore = useWorkspaceStore();
    const galleryStore = useGalleryStore();
    persistDirty = false;
    window.clearTimeout(persistRetryTimer);
    persistInFlight = apiRequest("/api/workspace-state", {
      method: "PUT",
      timeoutMs: 8000,
      body: {
        active_workflow: workspaceStore.activeWorkflow,
        forms: options.forms,
        prompt_bank: promptBankPayload(),
        ui: { gallery: { filter: galleryStore.filter } },
      },
    })
      .then(() => undefined)
      .catch(() => {
        persistDirty = true;
      })
      .finally(() => {
        persistInFlight = null;
        if (persistDirty && !isHydrating) {
          window.clearTimeout(persistRetryTimer);
          persistRetryTimer = window.setTimeout(() => void persistWorkspaceState(), 400);
        }
      });
    return persistInFlight;
  }

  function schedulePersistWorkspaceState() {
    if (isHydrating) return;
    persistDirty = true;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => void persistWorkspaceState(), 160);
  }

  function isHydratingWorkspaceState() {
    return isHydrating;
  }

  return {
    isHydratingWorkspaceState,
    loadWorkspaceState,
    persistWorkspaceState,
    schedulePersistWorkspaceState,
  };
}

function isGalleryFilter(value: unknown): value is GalleryFilter {
  return value === "tasks" || value === "prompts" || value === "all";
}
