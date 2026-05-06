import { isRetryableJobStatus } from "../../utils/jobStatus";
import { apiRequest } from "./apiClient";
import type { JobActionSharedContext } from "./jobActionTypes";

export async function retryJobCommand(jobId: string, context: JobActionSharedContext) {
  const job = context.getActionJob(jobId);
  if (!job) {
    context.setStatus("error", "任务不存在。", 2200);
    return;
  }
  if (!isRetryableJobStatus(job.status)) {
    context.setStatus("error", "这个任务当前不能重试。", 2200);
    return;
  }
  context.setJobBusy(jobId, true);
  try {
    context.locallyCanceledJobIds.delete(String(jobId));
    context.clearFailurePopupEntries(jobId);
    await apiRequest(`/api/jobs/${jobId}/retry`, { method: "POST", timeoutMs: 30000 });
    if (context.failurePopupJobId() === jobId) context.closeFailurePopup();
    await context.refreshJobs({ silent: true, reset: true });
    context.setStatus("success", "任务已重新加入队列。", 2200);
  } catch (error) {
    context.setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    context.setJobBusy(jobId, false);
  }
}
