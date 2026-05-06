import { useGalleryStore } from "../../stores/gallery";
import type { JobSummary } from "../../stores/jobs";
import { patchGalleryPageJobStatus } from "./galleryJobPatches";

export const CANCELED_JOB_MESSAGE = "任务已中断，后台请求已停止，已生成图片会自动保留。";

export function getGalleryJobSnapshot(jobId: string) {
  const item = useGalleryStore().flatItems.find((candidate) => candidate.jobId === jobId);
  return item?.jobSnapshot || null;
}

export function patchCanceledGalleryItems(jobId: string) {
  const galleryStore = useGalleryStore();
  const pageItems = patchGalleryPageJobStatus(galleryStore.pageItems, jobId, {
    status: "canceled",
    message: CANCELED_JOB_MESSAGE,
  });
  const flatItems = galleryStore.flatItems.map((item) => (
    item.jobId === String(jobId)
      ? {
          ...item,
          jobStatus: "canceled",
          jobSnapshot: item.jobSnapshot
            ? { ...item.jobSnapshot, status: "canceled", message: CANCELED_JOB_MESSAGE }
            : item.jobSnapshot,
        }
      : item
  ));
  galleryStore.replacePageItems(pageItems);
  galleryStore.replaceFlatItems(flatItems);
}

export function restoreGalleryJobSnapshot(jobId: string, snapshot: JobSummary) {
  const galleryStore = useGalleryStore();
  const status = String(snapshot.status || "");
  const message = String(snapshot.message || "");
  galleryStore.replacePageItems(patchGalleryPageJobStatus(galleryStore.pageItems, jobId, snapshot));
  galleryStore.replaceFlatItems(galleryStore.flatItems.map((item) => (
    item.jobId === String(jobId)
      ? { ...item, jobStatus: status, jobSnapshot: { ...(item.jobSnapshot || {}), ...snapshot, message } }
      : item
  )));
}
