import { useGalleryStore, type GalleryFilter, type GalleryFlatItem } from "../../stores/gallery";
import { imageKeyFromParts } from "../../utils/galleryKeys";
import { downloadImageFromUrl, normalizeImageUrl } from "../../services/imageActions";
import { useConfirmDialog } from "../useConfirmDialog";
import { apiRequest } from "./apiClient";
import type { StatusTone } from "./status";

interface GalleryActionRuntimeOptions {
  refreshJobs: (options?: { silent?: boolean; reset?: boolean }) => Promise<void>;
  resetGalleryPaginationForSort: () => void;
  persistWorkspaceState: () => Promise<void>;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}

export function createGalleryActionRuntime(options: GalleryActionRuntimeOptions) {
  function toggleSelection(item: GalleryFlatItem) {
    const galleryStore = useGalleryStore();
    const key = imageKeyFromParts(item.jobId, item.slot);
    const next = new Set(galleryStore.selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    galleryStore.replaceSelection(next);
  }

  function clearSelection() {
    useGalleryStore().clearSelection();
  }

  function selectByRect(rect: DOMRect) {
    const galleryStore = useGalleryStore();
    const next = new Set(galleryStore.selectedKeys);
    document.querySelectorAll<HTMLElement>(".gallery-item[data-gallery-key]").forEach((node) => {
      const box = node.getBoundingClientRect();
      const intersects = !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom);
      if (intersects) next.add(node.dataset.galleryKey || "");
    });
    galleryStore.replaceSelection([...next].filter(Boolean));
  }

  async function batchDelete() {
    const galleryStore = useGalleryStore();
    const items = galleryStore.selectedItems;
    if (!items.length) return;
    const confirmed = await useConfirmDialog().confirm({
      title: "批量删除图片",
      description: `选中的 ${items.length} 张图片会从图库和本地生成记录中移除。`,
      confirmText: "删除图片",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const payload = await apiRequest<{ removed_count?: number }>("/api/gallery/batch/delete", { method: "POST", body: { items } });
      galleryStore.clearSelection();
      await options.refreshJobs({ silent: true, reset: true });
      options.setStatus("success", `已删除 ${payload.removed_count || items.length} 张图片。`, 2200);
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error));
    }
  }

  async function batchDownload() {
    const galleryStore = useGalleryStore();
    const items = galleryStore.selectedItems;
    if (!items.length) return;
    try {
      const response = await fetch("/api/gallery/batch/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || "批量下载失败。"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "SCimage-selected-images.zip";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      options.setStatus("success", `已打包下载 ${items.length} 张图片。`, 2200);
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadItem(item: GalleryFlatItem) {
    const imageUrl = normalizeImageUrl(item.src);
    if (!imageUrl) {
      options.setStatus("error", "图片地址无效，无法下载。", 2200);
      return;
    }
    try {
      const result = await downloadImageFromUrl(imageUrl, item.filename);
      if (result.saved) {
        options.setStatus("success", "图片已保存。", 1600);
      }
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error || "下载图片失败。"), 2400);
    }
  }

  function setGalleryFilter(filter: GalleryFilter) {
    useGalleryStore().setFilter(filter);
    void options.persistWorkspaceState();
  }

  function toggleSort() {
    const galleryStore = useGalleryStore();
    galleryStore.setSortAsc(!galleryStore.sortAsc);
    options.resetGalleryPaginationForSort();
    void options.refreshJobs({ silent: true, reset: true });
  }

  return {
    batchDelete,
    batchDownload,
    clearSelection,
    downloadItem,
    selectByRect,
    setGalleryFilter,
    toggleSelection,
    toggleSort,
  };
}
