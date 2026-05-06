import type { GalleryImagesPagePayload } from "../../contracts/api";
import { galleryItemFromPayload } from "../../services/imageActions";
import { useGalleryStore, type GalleryFlatItem } from "../../stores/gallery";
import { apiRequest } from "./apiClient";
import { mergeGalleryPageItems } from "./galleryPages";

interface GalleryListRuntimeOptions {
  syncLightboxSelection: () => void;
}

export function createGalleryListRuntime(options: GalleryListRuntimeOptions) {
  let galleryListGeneration = 0;

  function nextGalleryGeneration() {
    galleryListGeneration += 1;
    return galleryListGeneration;
  }

  function currentGalleryGeneration() {
    return galleryListGeneration;
  }

  function applyGalleryPage(payload: GalleryImagesPagePayload, append = false) {
    const galleryStore = useGalleryStore();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const pageItems = mergeGalleryPageItems(galleryStore.pageItems, items, {
      reset: !append,
      sortAsc: galleryStore.sortAsc,
    });
    const flatItems = pageItems.map(galleryItemFromPayload).filter(Boolean) as GalleryFlatItem[];
    galleryStore.replacePageItems(pageItems);
    galleryStore.replaceFlatItems(flatItems);
    galleryStore.patchPagination({
      total: Math.max(0, Number(payload?.total ?? flatItems.length)),
      hasMore: Boolean(payload?.has_more),
      pageSize: Math.max(1, Number(payload?.limit || payload?.page_size || galleryStore.pagination.pageSize || 160)),
      nextCursor: String(payload?.next_cursor || ""),
      isLoadingMore: false,
    });
    options.syncLightboxSelection();
  }

  function resetGalleryPaginationForSort() {
    nextGalleryGeneration();
    const galleryStore = useGalleryStore();
    galleryStore.replacePageItems([]);
    galleryStore.replaceFlatItems([]);
    galleryStore.patchPagination({
      total: 0,
      hasMore: false,
      nextCursor: "",
      isLoadingMore: false,
    });
  }

  async function loadMoreGallery(isRefreshInFlight: () => boolean) {
    const galleryStore = useGalleryStore();
    if (isRefreshInFlight()) return;
    if (galleryStore.pagination.isLoadingMore || !galleryStore.pagination.hasMore) return;
    const requestGeneration = galleryListGeneration;
    const requestedSortAsc = galleryStore.sortAsc;
    galleryStore.patchPagination({ isLoadingMore: true });
    try {
      const payload = await apiRequest<GalleryImagesPagePayload>(`/api/gallery/images?limit=${galleryStore.pagination.pageSize}&cursor=${encodeURIComponent(galleryStore.pagination.nextCursor)}&sort=${requestedSortAsc ? "asc" : "desc"}`, { method: "GET" });
      if (requestGeneration === galleryListGeneration && requestedSortAsc === galleryStore.sortAsc) applyGalleryPage(payload, true);
    } catch {
      galleryStore.patchPagination({ isLoadingMore: false });
    } finally {
      if (requestGeneration !== galleryListGeneration || requestedSortAsc !== galleryStore.sortAsc) {
        galleryStore.patchPagination({ isLoadingMore: false });
      }
    }
  }

  return {
    applyGalleryPage,
    currentGalleryGeneration,
    loadMoreGallery,
    nextGalleryGeneration,
    resetGalleryPaginationForSort,
  };
}
