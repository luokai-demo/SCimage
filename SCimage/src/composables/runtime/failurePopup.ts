import { reactive } from "vue";
import type { JobSummary } from "../../stores/jobs";
import { formatJobFailureMessage } from "../../utils/jobDiagnostics";
import { isRetryableJobStatus } from "../../utils/jobStatus";

interface FailurePopupQueueItem {
  jobId: string;
  prompt: string;
  message: string;
  retryable: boolean;
}

export interface FailurePopupState extends FailurePopupQueueItem {
  open: boolean;
  queue: FailurePopupQueueItem[];
  seenKeys: Set<string>;
  ready: boolean;
}

export function createFailurePopupController() {
  const failurePopup = reactive<FailurePopupState>({
    open: false,
    jobId: "",
    prompt: "",
    message: "",
    retryable: false,
    queue: [],
    seenKeys: new Set(),
    ready: false,
  });

  function syncProblemPopups(jobs: JobSummary[]) {
    const failed = jobs.filter((job) => String(job.status || "") === "failed");
    if (!failurePopup.ready) {
      failed.forEach((job) => failurePopup.seenKeys.add(failurePopupKey(job)));
      failurePopup.ready = true;
      return;
    }
    failed.forEach((job) => {
      const key = failurePopupKey(job);
      if (failurePopup.seenKeys.has(key)) return;
      failurePopup.seenKeys.add(key);
      failurePopup.queue.push({
        jobId: String(job.id || ""),
        prompt: String(job.prompt || ""),
        message: formatJobFailureMessage(job),
        retryable: isRetryableJobStatus(job.status),
      });
    });
    showNextFailurePopup();
  }

  function showNextFailurePopup() {
    if (failurePopup.open || !failurePopup.queue.length) return;
    const next = failurePopup.queue.shift();
    if (!next) return;
    failurePopup.jobId = next.jobId;
    failurePopup.prompt = next.prompt;
    failurePopup.message = next.message;
    failurePopup.retryable = next.retryable;
    failurePopup.open = true;
  }

  function closeFailurePopup() {
    failurePopup.open = false;
    failurePopup.jobId = "";
    window.setTimeout(showNextFailurePopup, 120);
  }

  function clearFailurePopupEntries(jobId: string) {
    const normalizedJobId = String(jobId || "");
    if (!normalizedJobId) return;
    failurePopup.queue = failurePopup.queue.filter((entry) => entry.jobId !== normalizedJobId);
    if (failurePopup.jobId === normalizedJobId) closeFailurePopup();
  }

  return {
    failurePopup,
    syncProblemPopups,
    closeFailurePopup,
    clearFailurePopupEntries,
  };
}

function failurePopupKey(job: JobSummary) {
  return `${job.id}:${job.updated_at || ""}`;
}
