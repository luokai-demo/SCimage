export type JobStatus =
  | "queued"
  | "running"
  | "canceling"
  | "completed"
  | "partial"
  | "failed"
  | "canceled"
  | "unknown";

export interface JobStatusMeta {
  status: JobStatus;
  label: string;
  className: string;
  phase: "active" | "terminal" | "unknown";
  canCancel: boolean;
  canRetry: boolean;
  canDelete: boolean;
}

export const JOB_STATUS_META: Record<JobStatus, JobStatusMeta> = {
  queued: {
    status: "queued",
    label: "排队中",
    className: "queued",
    phase: "active",
    canCancel: true,
    canRetry: false,
    canDelete: false,
  },
  running: {
    status: "running",
    label: "生成中",
    className: "running",
    phase: "active",
    canCancel: true,
    canRetry: false,
    canDelete: false,
  },
  canceling: {
    status: "canceling",
    label: "中断中",
    className: "canceling",
    phase: "active",
    canCancel: true,
    canRetry: false,
    canDelete: false,
  },
  completed: {
    status: "completed",
    label: "完成",
    className: "completed",
    phase: "terminal",
    canCancel: false,
    canRetry: false,
    canDelete: true,
  },
  partial: {
    status: "partial",
    label: "部分完成",
    className: "partial",
    phase: "terminal",
    canCancel: false,
    canRetry: false,
    canDelete: true,
  },
  failed: {
    status: "failed",
    label: "失败",
    className: "failed",
    phase: "terminal",
    canCancel: false,
    canRetry: true,
    canDelete: true,
  },
  canceled: {
    status: "canceled",
    label: "已中断",
    className: "canceled",
    phase: "terminal",
    canCancel: false,
    canRetry: true,
    canDelete: true,
  },
  unknown: {
    status: "unknown",
    label: "未知",
    className: "unknown",
    phase: "unknown",
    canCancel: false,
    canRetry: false,
    canDelete: false,
  },
};

export const ACTIVE_JOB_STATUSES = new Set(["queued", "running", "canceling"]);
export const RETRYABLE_JOB_STATUSES = new Set(["failed", "canceled"]);
export const TERMINAL_JOB_STATUSES = new Set(["completed", "partial", "failed", "canceled"]);

export function normalizeJobStatus(status?: unknown): JobStatus {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized in JOB_STATUS_META ? normalized as JobStatus : "unknown";
}

export function jobStatusMeta(status?: unknown): JobStatusMeta {
  return JOB_STATUS_META[normalizeJobStatus(status)];
}

export function isActiveJobStatus(status?: unknown) {
  return jobStatusMeta(status).phase === "active";
}

export function isRetryableJobStatus(status?: unknown) {
  return jobStatusMeta(status).canRetry;
}

export function isTerminalJobStatus(status?: unknown) {
  return jobStatusMeta(status).phase === "terminal";
}

export function canCancelJob(status?: unknown) {
  return jobStatusMeta(status).canCancel;
}

export function canRetryJob(status?: unknown) {
  return jobStatusMeta(status).canRetry;
}

export function canDeleteJob(status?: unknown) {
  return jobStatusMeta(status).canDelete;
}

export function canDeleteJobImage(status?: unknown) {
  return canDeleteJob(status);
}
