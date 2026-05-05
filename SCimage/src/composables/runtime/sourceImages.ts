import type { GalleryFlatItem } from "../../stores/gallery";

export interface SourceImageOrigin {
  job_id: string;
  slot: number;
  url?: string;
  filename?: string;
  prompt?: string;
}

export interface SourceImageItem {
  key: string;
  file: File;
  url: string;
  name: string;
  origin?: SourceImageOrigin;
}

export interface SourceImageReference {
  url: string;
  filename?: string;
  prompt?: string;
  origin?: SourceImageOrigin;
}

export interface SourceImageFile extends File {
  __imageWorkbenchSourceKey?: string;
  __imageWorkbenchSourceOrigin?: SourceImageOrigin;
}

export function sourceImageKey(file: File) {
  const sourceFile = file as SourceImageFile;
  return sourceFile.__imageWorkbenchSourceKey || `${file.name}:${file.size}:${file.lastModified}`;
}

export function sourceImageOrigin(file: File) {
  return (file as SourceImageFile).__imageWorkbenchSourceOrigin;
}

export function attachSourceImageMetadata(file: File, key: string, origin?: SourceImageOrigin) {
  const sourceFile = file as SourceImageFile;
  sourceFile.__imageWorkbenchSourceKey = key;
  if (origin) {
    sourceFile.__imageWorkbenchSourceOrigin = origin;
  }
  return sourceFile;
}

export function buildSourceOriginFromGalleryItem(item: GalleryFlatItem): SourceImageOrigin | undefined {
  const jobId = String(item.jobId || "").trim();
  const slot = Number(item.slot || 0);
  if (!jobId || !slot) return undefined;
  return {
    job_id: jobId,
    slot,
    url: item.src,
    filename: item.filename,
    prompt: item.prompt,
  };
}
