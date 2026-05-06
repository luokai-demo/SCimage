import type { JobsPagePayload } from "../../contracts/api";
import { useJobStore } from "../../stores/jobs";
import { apiRequest } from "./apiClient";
import { mergeJobsById } from "./jobs";

interface JobListRuntimeOptions {
  locallyCanceledJobIds: Set<string>;
}

export function createJobListRuntime(options: JobListRuntimeOptions) {
  let jobsListGeneration = 0;

  function nextJobsGeneration() {
    jobsListGeneration += 1;
    return jobsListGeneration;
  }

  function currentJobsGeneration() {
    return jobsListGeneration;
  }

  function applyJobsPage(payload: JobsPagePayload, append = false) {
    const jobStore = useJobStore();
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    const nextJobs = mergeJobsById(jobStore.jobs, jobs, {
      reset: !append,
      locallyCanceledJobIds: options.locallyCanceledJobIds,
    });
    const pageSize = Math.max(1, Number(payload?.limit || payload?.page_size || jobStore.pagination.pageSize || 80));
    const nextOffset = append
      ? Math.max(Number(jobStore.pagination.nextOffset || 0), Number(payload?.next_offset || nextJobs.length))
      : Number(payload?.next_offset || jobs.length);
    jobStore.patchPagination({
      total: Math.max(0, Number(payload?.total ?? nextJobs.length)),
      hasMore: Boolean(payload?.has_more) || nextOffset < Number(payload?.total || 0),
      pageSize,
      nextOffset,
      nextCursor: String(payload?.next_cursor || ""),
      isLoadingMore: false,
    });
    jobStore.replaceJobs(nextJobs);
  }

  async function loadMoreJobs(isRefreshInFlight: () => boolean) {
    const jobStore = useJobStore();
    if (isRefreshInFlight()) return;
    if (jobStore.pagination.isLoadingMore || !jobStore.pagination.hasMore) return;
    const requestGeneration = jobsListGeneration;
    jobStore.patchPagination({ isLoadingMore: true });
    try {
      const payload = await apiRequest<JobsPagePayload>(`/api/jobs?offset=${jobStore.pagination.nextOffset}&limit=${jobStore.pagination.pageSize}&cursor=${encodeURIComponent(jobStore.pagination.nextCursor)}`, { method: "GET" });
      if (requestGeneration === jobsListGeneration) applyJobsPage(payload, true);
    } catch (error) {
      jobStore.markSyncError(error);
      jobStore.patchPagination({ isLoadingMore: false });
    } finally {
      if (requestGeneration !== jobsListGeneration) jobStore.patchPagination({ isLoadingMore: false });
    }
  }

  return {
    applyJobsPage,
    currentJobsGeneration,
    loadMoreJobs,
    nextJobsGeneration,
  };
}
