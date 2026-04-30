// @ts-nocheck

import {
  GALLERY_COLUMN_MAX,
  GALLERY_COLUMN_MIN,
  GALLERY_COLUMN_TARGET_WIDTH,
  GALLERY_GRID_GAP_PX,
  GALLERY_GRID_ROW_HEIGHT_PX,
  GALLERY_IMAGE_WARM_CONCURRENCY,
  GALLERY_IMAGE_WARM_MAX_ENTRIES,
  GALLERY_PRELOAD_EXTRA_PX,
  GALLERY_PRELOAD_SCREENS,
  GALLERY_PREVIEW_WARM_CONCURRENCY,
  GALLERY_PREVIEW_WARM_MAX_ENTRIES,
  GALLERY_VIRTUAL_ESTIMATED_HEIGHT_PX,
  GALLERY_VIRTUAL_MAX_CACHED_ITEMS,
  GALLERY_VIRTUAL_OVERSCAN_SCREENS,
} from "./constants";

export function createGalleryController({ runtime, elements, callbacks }) {
  const scrollRoot = new runtime.GalleryScrollRoot({
    root: elements.galleryWindow || elements.galleryArea,
    fallbackRoot: elements.galleryArea || null,
  });
  const imageLoader = new runtime.GalleryImageLoader({
    scrollRoot,
    preloadScreens: GALLERY_PRELOAD_SCREENS,
    preloadExtraPx: GALLERY_PRELOAD_EXTRA_PX,
    immediateExtraPx: GALLERY_PRELOAD_EXTRA_PX,
  });
  const imageWarmCache = new runtime.GalleryImageWarmCache({
    concurrency: GALLERY_IMAGE_WARM_CONCURRENCY,
    maxEntries: GALLERY_IMAGE_WARM_MAX_ENTRIES,
  });
  const previewWarmCache = new runtime.GalleryImageWarmCache({
    concurrency: GALLERY_PREVIEW_WARM_CONCURRENCY,
    maxEntries: GALLERY_PREVIEW_WARM_MAX_ENTRIES,
  });
  const masonryLayout = new runtime.GalleryMasonryLayout({
    targetColumnWidth: GALLERY_COLUMN_TARGET_WIDTH,
    minColumns: GALLERY_COLUMN_MIN,
    maxColumns: GALLERY_COLUMN_MAX,
    rowHeightPx: GALLERY_GRID_ROW_HEIGHT_PX,
    gapPx: GALLERY_GRID_GAP_PX,
  });
  const virtualMasonry = new runtime.GalleryVirtualMasonry({
    scrollRoot,
    container: elements.galleryGrid,
    targetColumnWidth: GALLERY_COLUMN_TARGET_WIDTH,
    minColumns: GALLERY_COLUMN_MIN,
    maxColumns: GALLERY_COLUMN_MAX,
    gapPx: GALLERY_GRID_GAP_PX,
    overscanScreens: GALLERY_VIRTUAL_OVERSCAN_SCREENS,
    estimatedHeightPx: GALLERY_VIRTUAL_ESTIMATED_HEIGHT_PX,
    maxCachedItems: GALLERY_VIRTUAL_MAX_CACHED_ITEMS,
    getKey: (entry) => entry.key,
    getItemHeight: (entry, columnWidth, index, layoutContext) => (
      callbacks.getEntryHeight(entry, columnWidth, index, layoutContext)
    ),
    getItemSpan: (entry, index, columns) => callbacks.getEntryColumnSpan(entry, columns),
    renderItem: (entry, openIndex) => callbacks.renderImageCard(entry, openIndex),
    updateItem: (card, entry, openIndex) => callbacks.updateImageCard(card, entry, openIndex),
    onMount: (card, record) => {
      previewWarmCache.warm(record?.item?.previewUrl, { priority: "high" });
      callbacks.activateImageCard(card);
    },
    onUnmount: (card) => callbacks.deactivateImageCard(card),
  });

  return {
    scrollRoot,
    imageLoader,
    imageWarmCache,
    previewWarmCache,
    masonryLayout,
    virtualMasonry,
  };
}
