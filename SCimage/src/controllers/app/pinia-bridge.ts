import { useGalleryStore } from "../../stores/gallery";
import { useJobStore } from "../../stores/jobs";
import { usePromptStore } from "../../stores/prompts";
import { useProviderStore } from "../../stores/provider";
import { useWorkspaceStore } from "../../stores/workspace";

export function createPiniaBridge() {
  return {
    galleryStore: useGalleryStore(),
    jobStore: useJobStore(),
    promptStore: usePromptStore(),
    providerStore: useProviderStore(),
    workspaceStore: useWorkspaceStore(),
  };
}
