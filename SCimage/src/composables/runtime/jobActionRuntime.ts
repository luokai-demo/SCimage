import { ref } from "vue";
import { useGalleryStore, type GalleryFlatItem } from "../../stores/gallery";
import { useJobStore, type JobSummary } from "../../stores/jobs";
import { imageKeyFromParts } from "../../utils/galleryKeys";
import { isActiveJobStatus, isRetryableJobStatus } from "../../utils/jobStatus";
import { cancelJobCommand } from "./jobCancelCommand";
import { deleteImageCommand, type GalleryActionContext } from "./imageDeleteCommand";
import { deleteJobCommand } from "./jobDeleteCommand";
import { retryJobCommand } from "./jobRetryCommand";
import type { FailurePopupState } from "./failurePopup";
import { getGalleryJobSnapshot } from "./jobGallerySync";
import type { RuntimeLightboxState } from "./lightbox";
import type { StatusTone } from "./status";

interface JobActionRuntimeOptions {
  closeFailurePopup: () => void;
  clearFailurePopupEntries: (jobId: string) => void;
  closeLightbox: () => void;
  failurePopup: FailurePopupState;
  lightbox: RuntimeLightboxState;
  locallyCanceledJobIds?: Set<string>;
  refreshJobs: (options?: { silent?: boolean; reset?: boolean }) => Promise<void>;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
  syncLightboxSelection: () => void;
}

export function createJobActionRuntime(options: JobActionRuntimeOptions) {
  const locallyCanceledJobIds = options.locallyCanceledJobIds || new Set<string>();
  const busyJobIds = ref(new Set<string>());

  function getJob(jobId: string) {
    return useJobStore().jobs.find((job) => String(job.id || "") === String(jobId)) || null;
  }

  function getJobForGalleryItem(item: Pick<GalleryFlatItem, "jobId" | "jobSnapshot">) {
    return getJob(item.jobId) || item.jobSnapshot || getGalleryJobSnapshot(item.jobId);
  }

  function getActionJob(jobId: string) {
    return getJob(jobId) || getGalleryJobSnapshot(jobId);
  }

  function isActiveStatus(status: string) {
    return isActiveJobStatus(status);
  }

  function isRetryableJob(job: JobSummary | null | undefined) {
    return Boolean(job && isRetryableJobStatus(job.status));
  }

  function setJobBusy(jobId: string, busy: boolean) {
    const next = new Set(busyJobIds.value);
    if (busy) next.add(jobId);
    else next.delete(jobId);
    busyJobIds.value = next;
  }

  function closeLightboxIfMissing() {
    const galleryStore = useGalleryStore();
    if (!options.lightbox.open) return;
    if (galleryStore.flatItems.length <= 0) {
      options.closeLightbox();
      return;
    }
    options.syncLightboxSelection();
  }

  function getSharedActionContext() {
    return {
      clearFailurePopupEntries: options.clearFailurePopupEntries,
      closeFailurePopup: options.closeFailurePopup,
      closeLightboxIfMissing,
      failurePopupJobId: () => options.failurePopup.jobId,
      getActionJob,
      lightbox: options.lightbox,
      locallyCanceledJobIds,
      refreshJobs: options.refreshJobs,
      setJobBusy,
      setStatus: options.setStatus,
    };
  }

  async function jobAction(jobId: string, action: "cancel" | "retry" | "delete") {
    if (!jobId) return;
    const context = getSharedActionContext();
    if (action === "cancel") return cancelJobCommand(jobId, context);
    if (action === "retry") return retryJobCommand(jobId, context);
    return deleteJobCommand(jobId, context);
  }

  async function deleteImage(jobId: string, slot: number, context: GalleryActionContext = {}) {
    return deleteImageCommand(jobId, slot, context, getSharedActionContext());
  }

  async function resolveGalleryTerminalAction(item: GalleryFlatItem) {
    const job = getJobForGalleryItem(item);
    if (job && isActiveStatus(String(job.status || ""))) {
      await jobAction(item.jobId, "cancel");
      return;
    }
    await deleteImage(item.jobId, item.slot, { item });
  }

  async function deleteLightboxItem() {
    const galleryItems = useGalleryStore().flatItems;
    const item = galleryItems.find((candidate) => imageKeyFromParts(candidate.jobId, candidate.slot) === options.lightbox.selectionKey) || galleryItems[options.lightbox.index];
    if (!item) return;
    await resolveGalleryTerminalAction(item);
  }

  return {
    busyJobIds,
    deleteImage,
    deleteLightboxItem,
    getJobForGalleryItem,
    isActiveStatus,
    isRetryableJob,
    jobAction,
    locallyCanceledJobIds,
    resolveGalleryTerminalAction,
  };
}
