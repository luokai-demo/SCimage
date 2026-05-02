export const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "canceling"]);
export const RETRYABLE_JOB_STATUSES = new Set(["failed", "canceled"]);

export function isActiveJobStatus(status?: unknown) {
  return ACTIVE_JOB_STATUSES.has(String(status || ""));
}

export function isRetryableJobStatus(status?: unknown) {
  return RETRYABLE_JOB_STATUSES.has(String(status || ""));
}
