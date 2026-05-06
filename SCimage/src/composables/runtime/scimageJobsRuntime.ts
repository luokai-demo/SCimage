import { createGalleryListRuntime } from "./galleryListRuntime";
import { createJobActionRuntime } from "./jobActionRuntime";
import { createJobListRuntime } from "./jobListRuntime";
import { createRefreshRuntime } from "./refreshRuntime";
import type { ScimageRuntimeBase } from "./scimageRuntimeBase";

export function createScimageJobsRuntime(base: ScimageRuntimeBase) {
  const locallyCanceledJobIds = new Set<string>();
  const jobsListRuntime = createJobListRuntime({ locallyCanceledJobIds });
  const galleryListRuntime = createGalleryListRuntime({
    syncLightboxSelection: base.syncLightboxSelection,
  });
  const refreshRuntime = createRefreshRuntime({
    applyGalleryPage: galleryListRuntime.applyGalleryPage,
    applyJobsPage: jobsListRuntime.applyJobsPage,
    currentGalleryGeneration: galleryListRuntime.currentGalleryGeneration,
    currentJobsGeneration: jobsListRuntime.currentJobsGeneration,
    nextGalleryGeneration: galleryListRuntime.nextGalleryGeneration,
    nextJobsGeneration: jobsListRuntime.nextJobsGeneration,
    setStatus: base.setStatus,
    syncProblemPopups: base.syncProblemPopups,
  });
  const jobActionRuntime = createJobActionRuntime({
    closeFailurePopup: base.closeFailurePopup,
    clearFailurePopupEntries: base.clearFailurePopupEntries,
    closeLightbox: base.closeLightbox,
    failurePopup: base.failurePopup,
    lightbox: base.lightbox,
    locallyCanceledJobIds,
    refreshJobs: refreshRuntime.refreshJobs,
    setStatus: base.setStatus,
    syncLightboxSelection: base.syncLightboxSelection,
  });

  async function loadMoreJobs() {
    return jobsListRuntime.loadMoreJobs(refreshRuntime.isRefreshInFlight);
  }

  async function loadMoreGallery() {
    return galleryListRuntime.loadMoreGallery(refreshRuntime.isRefreshInFlight);
  }

  return {
    ...jobActionRuntime,
    loadMoreGallery,
    loadMoreJobs,
    refreshJobs: refreshRuntime.refreshJobs,
    resetGalleryPaginationForSort: galleryListRuntime.resetGalleryPaginationForSort,
  };
}

export type ScimageJobsRuntime = ReturnType<typeof createScimageJobsRuntime>;
