// @ts-nocheck

export function createJobsController({
  maxRetained,
  defaultPageSize,
  sortJobsByCreatedDesc,
  jobStore,
}) {
  function applyPage(currentJobs, currentPagination, payload, options = {}) {
    const pageJobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    const total = Math.max(0, Number(payload?.total ?? pageJobs.length));
    const offset = Math.max(0, Number(payload?.offset || 0));
    const limit = Math.max(1, Number(payload?.limit || currentPagination.pageSize || defaultPageSize));
    const shouldReset = Boolean(options.reset);

    const jobMap = new Map();
    if (!shouldReset) {
      currentJobs.forEach((job) => {
        if (job?.id) {
          jobMap.set(job.id, job);
        }
      });
    }
    pageJobs.forEach((job) => {
      if (job?.id) {
        jobMap.set(job.id, job);
      }
    });

    let jobs = sortJobsByCreatedDesc(Array.from(jobMap.values()));
    if (jobs.length > maxRetained) {
      jobs = jobs.slice(0, maxRetained);
    }
    const nextOffset = shouldReset
      ? offset + pageJobs.length
      : Math.max(Number(currentPagination.nextOffset || 0), offset + pageJobs.length);
    const pagination = {
      ...currentPagination,
      total,
      pageSize: limit,
      nextOffset,
      nextCursor: String(payload?.next_cursor || ""),
      hasMore: Boolean(payload?.has_more) || nextOffset < total,
    };

    jobStore?.replaceJobs(jobs);
    jobStore?.patchPagination(pagination);
    return { jobs, pagination };
  }

  function patchPagination(currentPagination, patch) {
    const pagination = {
      ...currentPagination,
      ...patch,
    };
    jobStore?.patchPagination(pagination);
    return pagination;
  }

  function markSyncSuccess(date = new Date()) {
    jobStore?.markSyncSuccess(date);
  }

  function markSyncError(error) {
    jobStore?.markSyncError(error);
  }

  return {
    applyPage,
    markSyncError,
    markSyncSuccess,
    patchPagination,
  };
}
