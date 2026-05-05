import type { JobSummary } from "../../stores/jobs";
import { isTerminalJobStatus } from "../../utils/jobStatus";

export function sortJobs(jobs: JobSummary[]) {
  return [...jobs].sort((left, right) => {
    const leftTime = new Date(String(left.created_at || left.updated_at || 0)).getTime();
    const rightTime = new Date(String(right.created_at || right.updated_at || 0)).getTime();
    return rightTime - leftTime;
  });
}

export function mergeJobsById(
  currentJobs: JobSummary[],
  nextJobs: JobSummary[],
  options: {
    reset?: boolean;
    locallyCanceledJobIds?: Set<string>;
  } = {},
) {
  const locallyCanceledJobIds = options.locallyCanceledJobIds || new Set<string>();
  const currentJobMap = new Map<string, JobSummary>();
  currentJobs.forEach((job) => {
    const id = String(job.id || "").trim();
    if (id) currentJobMap.set(id, job);
  });
  const jobMap = new Map<string, JobSummary>();
  if (!options.reset) {
    currentJobMap.forEach((job, id) => jobMap.set(id, job));
  }
  nextJobs.forEach((job) => {
    const id = String(job.id || "").trim();
    if (!id) return;
    const currentJob = currentJobMap.get(id);
    if (
      currentJob &&
      locallyCanceledJobIds.has(id) &&
      isTerminalJobStatus(currentJob.status) &&
      !isTerminalJobStatus(job.status)
    ) {
      jobMap.set(id, currentJob);
      return;
    }
    if (isTerminalJobStatus(job.status)) {
      locallyCanceledJobIds.delete(id);
    }
    jobMap.set(id, job);
  });
  return sortJobs(Array.from(jobMap.values()));
}
