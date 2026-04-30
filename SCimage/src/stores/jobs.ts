import { defineStore } from "pinia";

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

const ACTIVE_STATUSES = new Set(["queued", "running", "canceling"]);

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
    runningJobs: (state) => sortJobsByCreatedDesc(state.jobs.filter((job) => ACTIVE_STATUSES.has(String(job.status || "")))),
    runningCount(): number {
      return this.runningJobs.length;
    },
    hasJobs: (state) => state.jobs.length > 0,
  },
  actions: {
    replaceJobs(jobs: JobSummary[]) {
      this.jobs = jobs;
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
