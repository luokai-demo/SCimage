import type { GalleryFlatItem } from "../../stores/gallery";
import { apiRequest } from "./apiClient";
import {
  confirmDeleteImage,
  fallbackJobFromGalleryItem,
  resolveImageDeleteTarget,
} from "./jobActionGuards";
import type { JobActionSharedContext } from "./jobActionTypes";

export interface GalleryActionContext {
  item?: GalleryFlatItem;
  imageCount?: number;
}

export async function deleteImageCommand(
  jobId: string,
  slot: number,
  actionContext: GalleryActionContext,
  context: JobActionSharedContext,
) {
  const contextItem = actionContext.item?.jobId === jobId ? actionContext.item : null;
  const job = context.getActionJob(jobId) || contextItem?.jobSnapshot || fallbackJobFromGalleryItem(jobId, slot, contextItem);
  if (!job) {
    context.setStatus("error", "任务不存在。", 2200);
    return;
  }
  const { imageCount, targetImage } = resolveImageDeleteTarget(jobId, slot, job, actionContext);
  if (!targetImage) {
    context.setStatus("error", "要删除的图片不存在。", 2200);
    return;
  }
  if (!await confirmDeleteImage(imageCount)) return;
  context.setJobBusy(jobId, true);
  try {
    const payload = await apiRequest<{ deleted_job?: boolean }>(`/api/jobs/${jobId}/images/${slot}`, { method: "DELETE", timeoutMs: 30000 });
    await context.refreshJobs({ silent: true, reset: true });
    context.closeLightboxIfMissing();
    context.setStatus(
      "success",
      payload.deleted_job ? "图片已删除，这个任务已自动移除。" : "图片已删除，其余图片和任务记录已保留。",
      2200,
    );
  } catch (error) {
    context.setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    context.setJobBusy(jobId, false);
  }
}
