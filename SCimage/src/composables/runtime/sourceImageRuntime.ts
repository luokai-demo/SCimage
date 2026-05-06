import { ref, type ComputedRef } from "vue";
import type { GalleryFlatItem } from "../../stores/gallery";
import { useWorkspaceStore, type WorkflowName } from "../../stores/workspace";
import { normalizeImageUrl } from "../../services/imageActions";
import {
  attachSourceImageMetadata,
  buildSourceOriginFromGalleryItem,
  sourceImageKey,
  sourceImageOrigin,
  type SourceImageItem,
  type SourceImageReference,
} from "./sourceImages";
import type { StatusTone } from "./status";

interface SourceImageRuntimeOptions {
  providerWorkflowAvailability: ComputedRef<Record<WorkflowName, boolean>>;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
  setWorkflow: (workflow: WorkflowName) => boolean;
}

export function createSourceImageRuntime(options: SourceImageRuntimeOptions) {
  const sourceImages = ref<SourceImageItem[]>([]);

  function syncSourceFileCount() {
    useWorkspaceStore().setSourceFileCount(sourceImages.value.length);
  }

  function addSourceFiles(files: Iterable<File>) {
    const next = [...sourceImages.value];
    Array.from(files).forEach((file) => {
      if (!file || (file.type && !file.type.startsWith("image/"))) return;
      const key = sourceImageKey(file);
      if (next.some((item) => item.key === key)) return;
      const origin = sourceImageOrigin(file);
      next.push({ key, file, name: file.name, url: URL.createObjectURL(file), origin });
    });
    sourceImages.value = next;
    syncSourceFileCount();
  }

  function removeSourceImage(key: string) {
    const target = sourceImages.value.find((item) => item.key === key);
    if (target) URL.revokeObjectURL(target.url);
    sourceImages.value = sourceImages.value.filter((item) => item.key !== key);
    syncSourceFileCount();
  }

  function clearSourceImages() {
    sourceImages.value.forEach((item) => URL.revokeObjectURL(item.url));
    sourceImages.value = [];
    syncSourceFileCount();
  }

  async function addSourceImageFromGallery(item: GalleryFlatItem) {
    return addSourceImageFromUrl({
      url: item.src,
      filename: item.filename || "reference.png",
      prompt: item.prompt,
      origin: buildSourceOriginFromGalleryItem(item),
    }, "已加入图生图参考图。", "这张图片已经在图生图参考图中。");
  }

  async function addSourceImageFromUrl(
    source: SourceImageReference,
    successMessage = "已加入图生图参考图。",
    duplicateMessage = "这张图片已经在图生图参考图中。",
  ) {
    if (!options.providerWorkflowAvailability.value["image-to-image"]) {
      options.setStatus("error", "当前提供方配置不支持图生图。", 2400);
      return;
    }
    try {
      const imageUrl = normalizeImageUrl(source.url);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`图片读取失败：${response.status}`);
      }
      const blob = await response.blob();
      const file = new File([blob], source.filename || "reference.png", { type: blob.type || "image/png", lastModified: Date.now() });
      attachSourceImageMetadata(file, `gallery:${imageUrl}`, source.origin);
      const beforeCount = sourceImages.value.length;
      if (!options.setWorkflow("image-to-image")) return;
      addSourceFiles([file]);
      options.setStatus("success", sourceImages.value.length > beforeCount ? successMessage : duplicateMessage, 2200);
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error || "加入参考图失败。"), 2600);
    }
  }

  return {
    addSourceFiles,
    addSourceImageFromGallery,
    addSourceImageFromUrl,
    clearSourceImages,
    removeSourceImage,
    sourceImages,
  };
}
