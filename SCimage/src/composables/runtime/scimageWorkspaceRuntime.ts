import { ref } from "vue";
import { useWorkspaceStore } from "../../stores/workspace";
import { createGalleryActionRuntime } from "./galleryActionRuntime";
import { createJobCreateRuntime } from "./jobCreateRuntime";
import { createMaintenanceRuntime } from "./maintenanceRuntime";
import { createPromptRuntime } from "./promptRuntime";
import { createProviderRuntime } from "./providerRuntime";
import { createRuntimeLifecycleController } from "./runtimeLifecycle";
import {
  createWorkflowBridge,
  createWorkspacePersistenceBridge,
} from "./runtimeDependencyBridge";
import { createSourceImageRuntime } from "./sourceImageRuntime";
import type { StatusTone } from "./status";
import {
  createWorkspaceFormRuntime,
  syncPromptWorkflowLabel,
} from "./workspaceFormRuntime";
import { createWorkspacePersistenceController } from "./workspacePersistence";

interface ScimageWorkspaceRuntimeOptions {
  refreshJobs: (options?: { silent?: boolean; reset?: boolean; manual?: boolean }) => Promise<void>;
  resetGalleryPaginationForSort: () => void;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}

export function createScimageWorkspaceRuntime(options: ScimageWorkspaceRuntimeOptions) {
  const persistenceBridge = createWorkspacePersistenceBridge();
  const workflowBridge = createWorkflowBridge();
  const clockTick = ref(Date.now());
  const isCreatingJob = ref(false);
  const providerRuntime = createProviderRuntime({
    setStatus: options.setStatus,
    syncPromptWorkflowLabel,
    persistWorkspaceState: persistenceBridge.persistWorkspaceState,
  });
  const sourceImagesRuntime = createSourceImageRuntime({
    providerWorkflowAvailability: providerRuntime.providerWorkflowAvailability,
    setStatus: options.setStatus,
    setWorkflow: workflowBridge.setWorkflow,
  });
  const workspaceFormRuntime = createWorkspaceFormRuntime({
    activeOutputProfileId: providerRuntime.activeOutputProfileId,
    clearSourceImages: sourceImagesRuntime.clearSourceImages,
    getSourceImages: () => sourceImagesRuntime.sourceImages.value,
    isCreatingJob,
    persistWorkspaceState: persistenceBridge.persistWorkspaceState,
    providerWorkflowAvailability: providerRuntime.providerWorkflowAvailability,
    setStatus: options.setStatus,
  });
  workflowBridge.setTarget(workspaceFormRuntime.setWorkflow);
  persistenceBridge.setTarget(createWorkspacePersistenceController({
    forms: workspaceFormRuntime.forms,
    getActiveOutputProfileId: () => providerRuntime.activeOutputProfileId.value,
    syncPromptWorkflowLabel,
  }));
  const jobCreateRuntime = createJobCreateRuntime({
    currentForm: workspaceFormRuntime.currentForm,
    getActiveWorkflow: () => useWorkspaceStore().activeWorkflow,
    getSourceImages: () => sourceImagesRuntime.sourceImages.value,
    isCreatingJob,
    normalizeCurrentOutputForm: workspaceFormRuntime.normalizeCurrentOutputForm,
    persistWorkspaceState: persistenceBridge.persistWorkspaceState,
    refreshJobs: options.refreshJobs,
    setStatus: options.setStatus,
  });
  const maintenanceRuntime = createMaintenanceRuntime({
    setStatus: options.setStatus,
  });
  const promptRuntime = createPromptRuntime({
    currentForm: workspaceFormRuntime.currentForm,
    getActiveOutputProfileId: () => providerRuntime.activeOutputProfileId.value,
    getOutputSummary: workspaceFormRuntime.getOutputSummary,
    normalizeCurrentOutputForm: workspaceFormRuntime.normalizeCurrentOutputForm,
    persistWorkspaceState: persistenceBridge.persistWorkspaceState,
    schedulePersistWorkspaceState: persistenceBridge.schedulePersistWorkspaceState,
    setStatus: options.setStatus,
  });
  const galleryActionRuntime = createGalleryActionRuntime({
    refreshJobs: options.refreshJobs,
    resetGalleryPaginationForSort: options.resetGalleryPaginationForSort,
    persistWorkspaceState: persistenceBridge.persistWorkspaceState,
    setStatus: options.setStatus,
  });
  const lifecycle = createRuntimeLifecycleController({
    activeOutputProfileId: providerRuntime.activeOutputProfileId,
    forms: workspaceFormRuntime.forms,
    getCurrentForm: workspaceFormRuntime.currentForm,
    handleProviderConnectionChanged: providerRuntime.handleProviderConnectionChanged,
    loadProviderProfiles: providerRuntime.loadProviderProfiles,
    loadWorkspaceState: persistenceBridge.loadWorkspaceState,
    onProviderLoadError: (error) => options.setStatus("error", error instanceof Error ? error.message : String(error)),
    persistWorkspaceState: persistenceBridge.persistWorkspaceState,
    providerForm: providerRuntime.providerForm,
    refreshJobs: options.refreshJobs,
    schedulePersistWorkspaceState: persistenceBridge.schedulePersistWorkspaceState,
    syncCurrentSizeForQuality: workspaceFormRuntime.syncCurrentSizeForQuality,
    syncOutputFormsForProfile: workspaceFormRuntime.syncOutputFormsForProfile,
    syncPromptWorkflowLabel,
    syncWorkflowAvailability: providerRuntime.syncWorkflowAvailability,
    updateClockTick: () => {
      clockTick.value = Date.now();
    },
  });

  async function initRuntime() {
    return lifecycle.initRuntime(useWorkspaceStore().activeWorkflow);
  }

  return {
    ...galleryActionRuntime,
    ...jobCreateRuntime,
    ...maintenanceRuntime,
    ...promptRuntime,
    ...providerRuntime,
    ...sourceImagesRuntime,
    ...workspaceFormRuntime,
    clockTick,
    initRuntime,
    isCreatingJob,
    subscribeRuntimeUpdate: lifecycle.subscribeRuntimeUpdate,
  };
}

export type ScimageWorkspaceRuntime = ReturnType<typeof createScimageWorkspaceRuntime>;
