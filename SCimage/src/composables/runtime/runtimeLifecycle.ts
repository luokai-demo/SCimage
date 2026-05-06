import { nextTick, type Ref, watch } from "vue";
import type { WorkflowName } from "../../stores/workspace";
import type { RuntimeWorkspaceForm } from "./workspacePersistence";

interface RuntimeLifecycleOptions {
  activeOutputProfileId: Ref<string>;
  forms: Record<WorkflowName, RuntimeWorkspaceForm>;
  getCurrentForm: () => RuntimeWorkspaceForm;
  handleProviderConnectionChanged: () => void;
  loadProviderProfiles: () => Promise<void>;
  loadWorkspaceState: () => Promise<void>;
  onProviderLoadError: (error: unknown) => void;
  persistWorkspaceState: () => Promise<void>;
  providerForm: {
    base_url: string;
    api_key: string;
    compat_profile_id: string;
  };
  refreshJobs: (options?: { silent?: boolean; reset?: boolean; manual?: boolean }) => Promise<void>;
  schedulePersistWorkspaceState: () => void;
  syncCurrentSizeForQuality: () => void;
  syncOutputFormsForProfile: () => void;
  syncPromptWorkflowLabel: (workflow: WorkflowName) => void;
  syncWorkflowAvailability: () => void;
  updateClockTick: () => void;
}

export function createRuntimeLifecycleController(options: RuntimeLifecycleOptions) {
  let initialized = false;
  let watchersInitialized = false;
  let pollTimer = 0;
  let clockTimer = 0;

  async function initRuntime(activeWorkflow: WorkflowName) {
    if (initialized) return;
    initialized = true;
    initWatchers();
    options.syncPromptWorkflowLabel(activeWorkflow);
    await options.loadWorkspaceState();
    options.syncPromptWorkflowLabel(activeWorkflow);
    await options.loadProviderProfiles().catch(options.onProviderLoadError);
    await options.refreshJobs({ silent: true });
    startTimers();
    await nextTick();
  }

  function initWatchers() {
    if (watchersInitialized) return;
    watchersInitialized = true;
    watch(options.forms, () => options.schedulePersistWorkspaceState(), { deep: true });
    watch(() => options.getCurrentForm().quality, () => options.syncCurrentSizeForQuality(), { flush: "post" });
    watch(options.activeOutputProfileId, () => {
      options.syncOutputFormsForProfile();
      options.syncWorkflowAvailability();
    });
    watch(() => options.providerForm.compat_profile_id, () => options.syncWorkflowAvailability());
    watch(() => [options.providerForm.base_url, options.providerForm.api_key], () => options.handleProviderConnectionChanged());
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("beforeunload", onBeforeUnload);
  }

  function startTimers() {
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => void options.refreshJobs({ silent: true }), 3500);
    window.clearInterval(clockTimer);
    clockTimer = window.setInterval(options.updateClockTick, 1000);
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") void options.persistWorkspaceState();
    if (document.visibilityState === "visible") void options.refreshJobs({ silent: true });
  }

  function onWindowFocus() {
    void options.refreshJobs({ silent: true });
  }

  function onBeforeUnload() {
    void options.persistWorkspaceState();
  }

  return {
    initRuntime,
  };
}
