import type { ApiGalleryImagePageItem } from "../../contracts/api";
import { galleryPageItemKey } from "../../services/imageActions";

export function mergeGalleryPageItems(
  currentItems: ApiGalleryImagePageItem[],
  nextItems: ApiGalleryImagePageItem[],
  options: {
    reset?: boolean;
    sortAsc?: boolean;
  } = {},
) {
  const itemMap = new Map<string, ApiGalleryImagePageItem>();
  if (!options.reset) {
    currentItems.forEach((item) => {
      const key = galleryPageItemKey(item);
      if (key) itemMap.set(key, item);
    });
  }
  nextItems.forEach((item) => {
    const key = galleryPageItemKey(item);
    if (key) itemMap.set(key, item);
  });
  return Array.from(itemMap.values()).sort((left, right) => {
    const leftJob = left?.job || left || {};
    const rightJob = right?.job || right || {};
    const leftTime = new Date(String(leftJob.updated_at || leftJob.created_at || 0)).getTime();
    const rightTime = new Date(String(rightJob.updated_at || rightJob.created_at || 0)).getTime();
    return options.sortAsc ? leftTime - rightTime : rightTime - leftTime;
  });
}
