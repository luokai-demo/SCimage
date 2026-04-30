import type { JobSummary } from "../../stores/jobs";

export const ACTIVE_STATUSES = new Set(["queued", "running", "canceling"]);

export function isActiveStatus(status?: string) {
  return ACTIVE_STATUSES.has(String(status || ""));
}

export function getStatusMeta(status?: string) {
  switch (status) {
    case "queued":
      return { label: "排队中", className: "queued" };
    case "running":
      return { label: "生成中", className: "running" };
    case "canceling":
      return { label: "中断中", className: "canceling" };
    case "completed":
      return { label: "完成", className: "completed" };
    case "partial":
      return { label: "部分完成", className: "partial" };
    case "failed":
      return { label: "失败", className: "failed" };
    case "canceled":
      return { label: "已中断", className: "canceled" };
    default:
      return { label: "未知", className: "unknown" };
  }
}

export function getWorkflowLabel(workflow?: string) {
  return workflow === "image-to-image" ? "图生图" : "文生图";
}

export function truncateText(value: unknown, maxLength = 42) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function formatElapsed(value?: string) {
  if (!value) {
    return "--";
  }
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) {
    return "--";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}分钟`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}小时${minutes}分钟`;
}

export function getJobProgressText(job: JobSummary) {
  const total = Number(job.count || 0);
  const completed = Array.isArray(job.images) ? job.images.length : 0;
  if (!total) {
    return completed ? `${completed} 张` : "--";
  }
  return `${completed}/${total}`;
}

export function getJobProgressPercent(job: JobSummary) {
  const total = Number(job.count || 0);
  const completed = Array.isArray(job.images) ? job.images.length : 0;
  if (!total) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function getJobDurationText(job: JobSummary) {
  const runStartedAt = String(job.run_started_at || job.created_at || "");
  if (!runStartedAt) {
    return "--";
  }
  if (isActiveStatus(job.status)) {
    return formatElapsed(runStartedAt);
  }
  if (job.updated_at) {
    const startedAt = new Date(runStartedAt);
    const finishedAt = new Date(String(job.updated_at));
    if (!Number.isNaN(startedAt.getTime()) && !Number.isNaN(finishedAt.getTime())) {
      const seconds = Math.max(0, Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000));
      if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}小时${minutes}分钟`;
      }
      if (seconds >= 60) {
        return `${Math.floor(seconds / 60)}分钟${seconds % 60}秒`;
      }
      return `${seconds}秒`;
    }
  }
  return "--";
}

export function isRetryableJob(job: JobSummary) {
  return ["failed", "canceled", "partial"].includes(String(job.status || ""));
}

export function getJobMessage(job: JobSummary) {
  const message = String(job.message || job.error || "");
  if (message) {
    return message;
  }
  if (isActiveStatus(job.status)) {
    return "正在等待上游生成结果。";
  }
  if (job.status === "completed") {
    return "图片已生成。";
  }
  return "";
}
