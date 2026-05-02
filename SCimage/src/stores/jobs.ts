import { defineStore } from "pinia";
import { isActiveJobStatus } from "../utils/jobStatus";

export interface JobPaginationState {
  total: number;
  hasMore: boolean;
  pageSize: number;
  nextOffset: number;
  nextCursor: string;
  isLoadingMore: boolean;
}

export interface JobSummary {
  id?: string;
  status?: string;
  prompt?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

function sortJobsByCreatedDesc(jobs: JobSummary[]) {
  return [...jobs].sort((left, right) => {
    const leftTime = new Date(left.created_at || left.updated_at || 0).getTime();
    const rightTime = new Date(right.created_at || right.updated_at || 0).getTime();
    return rightTime - leftTime;
  });
}

export const useJobStore = defineStore("jobs", {
  state: () => ({
    jobs: [] as JobSummary[],
    pagination: {
      total: 0,
      hasMore: false,
      pageSize: 80,
      nextOffset: 0,
      nextCursor: "",
      isLoadingMore: false,
    } as JobPaginationState,
    lastSyncAt: "" as string,
    lastSyncError: "" as string,
  }),
  getters: {
    sortedJobs: (state) => sortJobsByCreatedDesc(state.jobs),
    runningJobs: (state) => sortJobsByCreatedDesc(state.jobs.filter((job) => isActiveJobStatus(job.status))),
    runningCount(): number {
      return this.runningJobs.length;
    },
    hasJobs: (state) => state.jobs.length > 0,
  },
  actions: {
    replaceJobs(jobs: JobSummary[]) {
      this.jobs = jobs;
    },
    patchJob(jobId: string, patch: Partial<JobSummary>) {
      this.jobs = this.jobs.map((job) => (
        String(job.id || "") === String(jobId) ? { ...job, ...patch } : job
      ));
    },
    patchPagination(pagination: Partial<JobPaginationState>) {
      this.pagination = { ...this.pagination, ...pagination };
    },
    markSyncSuccess(date = new Date()) {
      this.lastSyncAt = date.toISOString();
      this.lastSyncError = "";
    },
    markSyncError(error: unknown) {
      this.lastSyncError = error instanceof Error ? error.message : String(error || "");
    },
  },
});
