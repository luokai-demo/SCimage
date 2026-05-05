import type { ApiGalleryImagePageItem, ApiJobImage, ApiJobSummary } from "../contracts/api";
import type { GalleryFlatItem } from "../stores/gallery";

export const IMAGE_DOWNLOAD_FALLBACK_NAME = "image.png";

export function normalizeDownloadFilename(value: unknown, fallback = IMAGE_DOWNLOAD_FALLBACK_NAME) {
  const filename = String(value || "").trim();
  if (!filename) return fallback;
  const sanitized = filename.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return sanitized || fallback;
}

export function normalizeImageUrl(url = "", origin = window.location.origin) {
  try {
    return new URL(url, origin).toString();
  } catch {
    return url;
  }
}

export function galleryPageItemKey(item: ApiGalleryImagePageItem) {
  const job = item?.job || item || {};
  const image = item?.image || item || {};
  const jobId = String(job.id || item?.job_id || "").trim();
  const slot = Number(image.slot || item?.slot || 0);
  return jobId && slot ? `${jobId}:${slot}` : "";
}

export function galleryItemFromPayload(item: ApiGalleryImagePageItem): GalleryFlatItem | null {
  const job = (item.job || item) as ApiJobSummary;
  const image = (item.image || item) as ApiJobImage;
  const jobId = String(job.id || item.job_id || "");
  const slot = Number(image.slot || item.slot || 0);
  const url = normalizeImageUrl(String(image.url || item.url || ""));
  const jobImages = Array.isArray(job.images) ? job.images : [];
  const imageCount = Number(job.image_count || item.image_count || jobImages.length || 1);
  if (!jobId || !url) return null;
  return {
    src: url,
    previewSrc: normalizeImageUrl(String(image.preview?.url || item.preview_url || url)),
    prompt: String(job.prompt || item.prompt || ""),
    filename: String(image.name || item.name || `image-${slot || 1}.png`),
    jobId,
    slot,
    jobStatus: String(job.status || item.status || ""),
    workflow: String(job.workflow || item.workflow || ""),
    imageCount,
    totalCount: Number(job.count || item.count || 0) || undefined,
    createdAt: String(job.created_at || item.created_at || ""),
    updatedAt: String(job.updated_at || item.updated_at || ""),
    width: Number(image.width || item.width || 0) || undefined,
    height: Number(image.height || item.height || 0) || undefined,
    placeholderColor: String(image.placeholder?.color || item.placeholder?.color || ""),
    size: String(job.size || item.size || ""),
    quality: String(job.quality || item.quality || ""),
    outputProfileId: String(job.output_profile_id || job.outputProfileId || item.output_profile_id || item.outputProfileId || ""),
    jobSnapshot: job,
  };
}

export async function downloadImageFromUrl(
  imageUrl: string,
  filename: string,
  desktopApi: unknown = (window as { pywebview?: { api?: unknown } }).pywebview?.api,
) {
  const normalizedUrl = normalizeImageUrl(imageUrl);
  const safeFilename = normalizeDownloadFilename(filename);
  const bridge = desktopApi as { download_file?: (url: string, filename: string) => Promise<{ canceled?: boolean; ok?: boolean; error?: string }> } | undefined;
  if (bridge && typeof bridge.download_file === "function") {
    const result = await bridge.download_file(normalizedUrl, safeFilename);
    if (result?.canceled) return { saved: false, canceled: true };
    if (!result?.ok) throw new Error(result?.error || "桌面版保存图片失败。");
    return { saved: true, canceled: false };
  }

  const response = await fetch(normalizedUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = safeFilename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return { saved: true, canceled: false };
}
