import type { JobSummary } from "../stores/jobs";
import { formatQuality, formatSize, normalizeOutputProfileId } from "../data/outputOptions";
import { formatJobFailureMessage, normalizeErrorText } from "./jobDiagnostics";
import { isActiveJobStatus, isRetryableJobStatus } from "./jobStatus";

export function isActiveStatus(status?: string) {
  return isActiveJobStatus(status);
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

export function formatDateTime(value?: unknown) {
  if (!value) {
    return "--";
  }
  const text = String(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString("zh-CN", { hour12: false });
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
  return formatDurationSeconds(seconds);
}

export function formatDurationSeconds(secondsValue: number) {
  const seconds = Math.max(0, Math.floor(secondsValue));
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}分钟${seconds % 60}秒`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}小时${minutes}分钟${remainingSeconds}秒`;
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

export function getOutputProfileIdForItem(item: Record<string, unknown>, fallbackOutputProfileId: string) {
  return normalizeOutputProfileId(
    item.outputProfileId || item.output_profile_id || fallbackOutputProfileId,
    fallbackOutputProfileId,
  );
}

export function getOutputOptionSummary(item: Record<string, unknown>, fallbackOutputProfileId: string) {
  const outputProfileId = getOutputProfileIdForItem(item, fallbackOutputProfileId);
  const parts = [getWorkflowLabel(String(item.workflow || ""))];
  const sourceImages = Array.isArray(item.source_images) ? item.source_images.length : 0;
  if (item.workflow === "image-to-image") {
    parts.push(`参考图 ${sourceImages} 张`);
  }
  parts.push(`尺寸 ${formatSize(item.size, item.quality, outputProfileId)}`);
  parts.push(`质量 ${formatQuality(item.quality, outputProfileId)}`);
  parts.push(`数量 ${Number.parseInt(String(item.count || 1), 10) || 1}`);
  return parts.join(" · ");
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
      return formatDurationSeconds(seconds);
    }
  }
  return "--";
}

export function isRetryableJob(job: JobSummary) {
  return isRetryableJobStatus(job.status);
}

export function getJobMessage(job: JobSummary) {
  if (job.status === "failed" || job.status === "partial") {
    return formatJobFailureMessage(job);
  }
  const message = [
    normalizeErrorText(job.error),
    ...((Array.isArray(job.warnings) ? job.warnings : []).map(normalizeErrorText).filter(Boolean)),
    normalizeErrorText(job.message),
  ].find(Boolean);
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
