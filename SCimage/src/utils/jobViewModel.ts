import type { JobSummary } from "../stores/jobs";
import {
  getJobDurationText,
  getJobMessage,
  getJobProgressText,
  getStatusMeta,
  getWorkflowLabel,
  isActiveStatus,
  isRetryableJob,
  truncateText,
} from "./jobFormatters";

export type JobCardAction = "cancel" | "retry" | "delete";

export interface JobCardActionView {
  action: JobCardAction;
  label: string;
  title: string;
  className: string;
}

export interface JobCardViewModel {
  id: string;
  workflowLabel: string;
  statusLabel: string;
  statusClassName: string;
  promptText: string;
  message: string;
  progressText: string;
  durationLabel: string;
  active: boolean;
  retryable: boolean;
  actions: JobCardActionView[];
}

interface JobPanelSummary {
  countText: string;
  compactCountText: string;
  previewText: string;
}

export type JobPanelListItem =
  | {
    id: string;
    count: number;
    title: string;
    type: "group";
  }
  | {
    id: string;
    job: JobSummary;
    type: "job";
  };

export function createJobCardViewModel(job: JobSummary, options: { activeDuration?: boolean } = {}): JobCardViewModel {
  const active = isActiveStatus(String(job.status || ""));
  const retryable = isRetryableJob(job);
  const duration = getJobDurationText(job);
  const statusMeta = getStatusMeta(String(job.status || ""));
  return {
    id: String(job.id || ""),
    workflowLabel: getWorkflowLabel(String(job.workflow || "")),
    statusLabel: statusMeta.label,
    statusClassName: statusMeta.className,
    promptText: String(job.prompt || "未提供提示词"),
    message: getJobMessage(job),
    progressText: getJobProgressText(job),
    durationLabel: active || options.activeDuration ? duration : `耗时 ${duration}`,
    active,
    retryable,
    actions: getJobCardActions(active, retryable),
  };
}

export function createJobPanelSummary(jobs: JobSummary[], paginationTotal: number | string | undefined, runningCount: number): JobPanelSummary {
  const loaded = jobs.length;
  const total = Number(paginationTotal || 0) || loaded;
  return {
    countText: `${total} 个任务`,
    compactCountText: `${total} 个`,
    previewText: createJobPanelPreview(jobs, runningCount),
  };
}

function createJobPanelPreview(jobs: JobSummary[], runningCount: number) {
  if (!jobs.length) return "暂无任务";
  if (runningCount > 0) return `${runningCount} 个进行中`;
  const latestJob = jobs[0];
  const statusMeta = getStatusMeta(String(latestJob.status || ""));
  return `${statusMeta.label} · ${truncateText(latestJob.prompt || "未提供提示词", 14)}`;
}

export function createJobPanelListItems(jobs: JobSummary[]): JobPanelListItem[] {
  const activeJobs = jobs.filter((job) => isActiveStatus(job.status));
  const inactiveJobs = jobs.filter((job) => !isActiveStatus(job.status));

  return [
    ...createJobPanelGroup("active", "进行中", activeJobs),
    ...createJobPanelJobItems(inactiveJobs),
  ];
}

function getJobCardActions(active: boolean, retryable: boolean): JobCardActionView[] {
  if (active) {
    return [{ action: "cancel", label: "中断", title: "中断任务", className: "is-primary" }];
  }
  if (retryable) {
    return [
      { action: "retry", label: "重试", title: "重试任务", className: "" },
      { action: "delete", label: "删除", title: "删除任务", className: "gallery-del-btn is-danger" },
    ];
  }
  return [{ action: "delete", label: "删除", title: "删除任务", className: "gallery-del-btn is-danger" }];
}

function createJobPanelGroup(id: string, title: string, jobs: JobSummary[]): JobPanelListItem[] {
  if (!jobs.length) return [];
  return [
    { id: `group-${id}`, count: jobs.length, title, type: "group" },
    ...createJobPanelJobItems(jobs),
  ];
}

function createJobPanelJobItems(jobs: JobSummary[]): JobPanelListItem[] {
  return jobs.map((job) => ({
    id: `job-${String(job.id || "")}`,
    job,
    type: "job" as const,
  }));
}
