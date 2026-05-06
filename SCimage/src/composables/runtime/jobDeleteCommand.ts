import { apiRequest } from "./apiClient";
import { confirmDeleteJob } from "./jobActionGuards";
import type { JobActionSharedContext } from "./jobActionTypes";

export async function deleteJobCommand(jobId: string, context: JobActionSharedContext) {
  const job = context.getActionJob(jobId);
  if (!job) {
    context.setStatus("error", "任务不存在。", 2200);
    return;
  }
  if (!await confirmDeleteJob(job)) return;
  context.setJobBusy(jobId, true);
  try {
    context.clearFailurePopupEntries(jobId);
    await apiRequest(`/api/jobs/${jobId}`, { method: "DELETE", timeoutMs: 30000 });
    if (context.failurePopupJobId() === jobId) context.closeFailurePopup();
    await context.refreshJobs({ silent: true, reset: true });
    context.closeLightboxIfMissing();
    context.setStatus("success", "任务已删除。", 2200);
  } catch (error) {
    context.setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    context.setJobBusy(jobId, false);
  }
}
