import { useGalleryStore } from "../../stores/gallery";
import { useJobStore } from "../../stores/jobs";
import { usePromptStore } from "../../stores/prompts";
import { useProviderStore } from "../../stores/provider";
import { useWorkspaceStore } from "../../stores/workspace";
import { createScimageJobsRuntime } from "./scimageJobsRuntime";
import { createScimageRuntimeBase } from "./scimageRuntimeBase";
import { createScimageWorkspaceRuntime } from "./scimageWorkspaceRuntime";

export type ScimageRuntime = ReturnType<typeof createScimageRuntime>;

let runtimeInstance: ScimageRuntime | null = null;

export function getScimageRuntime() {
  if (!runtimeInstance) runtimeInstance = createScimageRuntime();
  return runtimeInstance;
}

function createScimageRuntime() {
  const base = createScimageRuntimeBase();
  const jobs = createScimageJobsRuntime(base);
  const workspace = createScimageWorkspaceRuntime({
    refreshJobs: jobs.refreshJobs,
    resetGalleryPaginationForSort: jobs.resetGalleryPaginationForSort,
    setStatus: base.setStatus,
  });

  return {
    ...base,
    ...jobs,
    ...workspace,
    galleryStore: useGalleryStore(),
    jobStore: useJobStore(),
    providerStore: useProviderStore(),
    promptStore: usePromptStore(),
    workspaceStore: useWorkspaceStore(),
  };
}
