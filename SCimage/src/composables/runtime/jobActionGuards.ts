import type { ApiJobImage } from "../../contracts/api";
import type { GalleryFlatItem } from "../../stores/gallery";
import type { JobSummary } from "../../stores/jobs";
import { truncateText } from "../../utils/jobFormatters";
import { useConfirmDialog } from "../useConfirmDialog";
import type { GalleryActionContext } from "./imageDeleteCommand";

export async function confirmDeleteJob(job: JobSummary) {
  const imageCount = Array.isArray(job.images) ? job.images.length : 0;
  const promptLabel = truncateText(job.prompt || "这个任务", 24);
  return useConfirmDialog().confirm({
    title: "删除任务",
    description: imageCount > 1
      ? `确定删除「${promptLabel}」这个任务？会同时删除已生成的 ${imageCount} 张图片。`
      : `确定删除「${promptLabel}」这个任务吗？`,
    confirmText: "删除任务",
    tone: "danger",
  });
}

export function resolveImageDeleteTarget(
  jobId: string,
  slot: number,
  job: JobSummary,
  context: GalleryActionContext,
) {
  const images = Array.isArray(job.images) ? job.images : [];
  const contextItem = context.item?.jobId === jobId ? context.item : null;
  const imageCount = context.imageCount || context.item?.imageCount || images.length || 1;
  const targetImage = images.find((image: ApiJobImage) => Number(image?.slot || 0) === Number(slot)) || (
    contextItem && Number(contextItem.slot || 0) === Number(slot)
      ? { slot, url: contextItem.src, name: contextItem.filename }
      : null
  );
  return {
    imageCount,
    targetImage,
  };
}

export async function confirmDeleteImage(imageCount: number) {
  return useConfirmDialog().confirm({
    title: "删除图片",
    description: imageCount > 1
      ? `确定删除这张图片吗？本次任务的其余 ${imageCount - 1} 张图片会保留。`
      : "确定删除这张图片吗？任务记录会保留，但图库中将不再显示这次结果。",
    confirmText: "删除图片",
    tone: "danger",
  });
}

export function fallbackJobFromGalleryItem(jobId: string, slot: number, item: GalleryFlatItem | null) {
  if (!item) return null;
  return {
    id: jobId,
    status: item.jobStatus,
    prompt: item.prompt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    images: [{ slot, url: item.src, name: item.filename }],
  } as JobSummary;
}
