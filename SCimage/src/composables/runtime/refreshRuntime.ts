import type { GalleryImagesPagePayload, JobsPagePayload, QueueSnapshotPayload } from "../../contracts/api";
import { useGalleryStore } from "../../stores/gallery";
import { useJobStore, type JobSummary } from "../../stores/jobs";
import { emptyQueueSnapshot } from "../../utils/queueSnapshot";
import { apiRequest } from "./apiClient";
import type { StatusTone } from "./status";

export interface RefreshJobsOptions {
  silent?: boolean;
  reset?: boolean;
  manual?: boolean;
}

interface RefreshRuntimeOptions {
  applyGalleryPage: (payload: GalleryImagesPagePayload, append: boolean) => void;
  applyJobsPage: (payload: JobsPagePayload) => void;
  currentGalleryGeneration: () => number;
  currentJobsGeneration: () => number;
  nextGalleryGeneration: () => number;
  nextJobsGeneration: () => number;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
  syncProblemPopups: (jobs: JobSummary[]) => void;
}

export function createRefreshRuntime(options: RefreshRuntimeOptions) {
  let refreshInFlight: Promise<void> | null = null;
  let queuedRefreshOptions: RefreshJobsOptions | null = null;

  function isRefreshInFlight() {
    return Boolean(refreshInFlight);
  }

  async function refreshJobs(refreshOptions: RefreshJobsOptions = {}) {
    if (refreshInFlight) {
      queuedRefreshOptions = mergeRefreshOptions(queuedRefreshOptions, refreshOptions);
      return refreshInFlight;
    }
    const jobStore = useJobStore();
    const galleryStore = useGalleryStore();
    const refreshJobsGeneration = options.nextJobsGeneration();
    const refreshGalleryGeneration = options.nextGalleryGeneration();
    const requestedSortAsc = galleryStore.sortAsc;

    refreshInFlight = (async () => {
      try {
        const [jobsPayload, galleryPayload, queuePayload] = await Promise.all([
          apiRequest<JobsPagePayload>(`/api/jobs?offset=0&limit=${jobStore.pagination.pageSize || 80}`, { method: "GET" }),
          apiRequest<GalleryImagesPagePayload>(`/api/gallery/images?limit=${galleryStore.pagination.pageSize || 160}&sort=${requestedSortAsc ? "asc" : "desc"}`, { method: "GET" }),
          fetchQueueSnapshot(),
        ]);
        jobStore.patchQueue(queuePayload);
        if (refreshJobsGeneration === options.currentJobsGeneration()) {
          options.applyJobsPage(jobsPayload);
          jobStore.markSyncSuccess(new Date());
          options.syncProblemPopups(jobStore.jobs);
        }
        if (refreshGalleryGeneration === options.currentGalleryGeneration() && requestedSortAsc === galleryStore.sortAsc) {
          options.applyGalleryPage(galleryPayload, false);
        }
        if (
          refreshOptions.manual &&
          refreshJobsGeneration === options.currentJobsGeneration() &&
          refreshGalleryGeneration === options.currentGalleryGeneration()
        ) {
          options.setStatus("success", "已刷新。", 1800);
        }
      } catch (error) {
        jobStore.markSyncError(error);
        if (!refreshOptions.silent) {
          options.setStatus("error", error instanceof Error ? error.message : String(error));
        }
      } finally {
        refreshInFlight = null;
        const nextRefreshOptions = queuedRefreshOptions;
        queuedRefreshOptions = null;
        if (nextRefreshOptions) void refreshJobs(nextRefreshOptions);
      }
    })();
    return refreshInFlight;
  }

  return {
    isRefreshInFlight,
    refreshQueueSnapshot,
    refreshJobs,
  };

  async function refreshQueueSnapshot() {
    useJobStore().patchQueue(await fetchQueueSnapshot());
  }
}

async function fetchQueueSnapshot() {
  try {
    return await apiRequest<QueueSnapshotPayload>("/api/queue", { method: "GET", timeoutMs: 8000 });
  } catch {
    return emptyQueueSnapshot();
  }
}

function mergeRefreshOptions(current: RefreshJobsOptions | null, next: RefreshJobsOptions) {
  return {
    silent: current ? Boolean(current.silent && next.silent) : Boolean(next.silent),
    reset: Boolean(current?.reset || next.reset),
    manual: Boolean(current?.manual || next.manual),
  };
}
