import type { JobActionResponse } from "../../contracts/api";
import { useJobStore, type JobSummary } from "../../stores/jobs";
import { isActiveJobStatus } from "../../utils/jobStatus";
import { apiRequest } from "./apiClient";
import type { JobActionSharedContext } from "./jobActionTypes";
import {
  CANCELED_JOB_MESSAGE,
  patchCanceledGalleryItems,
  restoreGalleryJobSnapshot,
} from "./jobGallerySync";

export async function cancelJobCommand(jobId: string, context: JobActionSharedContext) {
  const job = context.getActionJob(jobId);
  if (!job) {
    context.setStatus("error", "任务不存在。", 2200);
    return;
  }
  if (!isActiveJobStatus(String(job.status || ""))) {
    context.setStatus("error", "只有运行中的任务可以中断。", 2200);
    return;
  }
  context.setJobBusy(jobId, true);
  try {
    markJobCanceledLocally(jobId, context);
    const payload = await apiRequest<JobActionResponse>(`/api/jobs/${jobId}/cancel`, { method: "POST", timeoutMs: 8000 });
    markJobCanceledLocally(jobId, context, payload?.images);
    void context.refreshJobs({ silent: true });
    context.setStatus("success", "任务已中断。", 2200);
  } catch (error) {
    restoreJobSnapshotLocally(jobId, job, context);
    context.setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    context.setJobBusy(jobId, false);
  }
}

export function markJobCanceledLocally(
  jobId: string,
  context: Pick<JobActionSharedContext, "closeFailurePopup" | "failurePopupJobId" | "locallyCanceledJobIds">,
  images?: unknown,
) {
  context.locallyCanceledJobIds.add(String(jobId));
  useJobStore().patchJob(jobId, {
    status: "canceled",
    message: CANCELED_JOB_MESSAGE,
    ...(Array.isArray(images) ? { images } : {}),
  });
  patchCanceledGalleryItems(jobId);
  if (context.failurePopupJobId() === jobId) context.closeFailurePopup();
}

function restoreJobSnapshotLocally(
  jobId: string,
  snapshot: JobSummary,
  context: Pick<JobActionSharedContext, "locallyCanceledJobIds">,
) {
  context.locallyCanceledJobIds.delete(String(jobId));
  useJobStore().patchJob(jobId, snapshot);
  restoreGalleryJobSnapshot(jobId, snapshot);
}
