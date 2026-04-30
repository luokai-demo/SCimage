// @ts-nocheck

export function createGalleryDataController({
  maxRetained,
  defaultPageSize,
  getSortAsc,
  galleryStore,
}) {
  function getPageItemKey(item) {
    return item?.job?.id && item?.image ? `${item.job.id}:${Number(item.image.slot || 0)}` : "";
  }

  function sortPageItems(items) {
    return [...items].sort((left, right) => {
      const leftTime = new Date(left?.job?.updated_at || left?.job?.created_at || 0).getTime();
      const rightTime = new Date(right?.job?.updated_at || right?.job?.created_at || 0).getTime();
      return getSortAsc() ? leftTime - rightTime : rightTime - leftTime;
    });
  }

  function applyImagesPage(currentItems, currentPagination, payload, options = {}) {
    const pageItems = Array.isArray(payload?.items) ? payload.items : [];
    const shouldReset = Boolean(options.reset);
    const itemMap = new Map();
    if (!shouldReset) {
      currentItems.forEach((item) => {
        const key = getPageItemKey(item);
        if (key) {
          itemMap.set(key, item);
        }
      });
    }
    pageItems.forEach((item) => {
      const key = getPageItemKey(item);
      if (key) {
        itemMap.set(key, item);
      }
    });

    let items = sortPageItems(Array.from(itemMap.values()));
    if (items.length > maxRetained) {
      items = items.slice(0, maxRetained);
    }
    const pagination = {
      ...currentPagination,
      total: Math.max(0, Number(payload?.total ?? items.length)),
      pageSize: Math.max(1, Number(payload?.limit || currentPagination.pageSize || defaultPageSize)),
      nextCursor: String(payload?.next_cursor || ""),
      hasMore: Boolean(payload?.has_more),
    };

    galleryStore?.replacePageItems(items);
    galleryStore?.patchPagination(pagination);
    return { items, pagination };
  }

  function patchPagination(currentPagination, patch) {
    const pagination = {
      ...currentPagination,
      ...patch,
    };
    galleryStore?.patchPagination(pagination);
    return pagination;
  }

  function replaceFlatItems(items) {
    galleryStore?.replaceFlatItems(items);
  }

  function clearItems(currentPagination) {
    const pagination = {
      ...currentPagination,
      nextCursor: "",
      hasMore: false,
      total: 0,
    };
    galleryStore?.replacePageItems([]);
    galleryStore?.replaceFlatItems([]);
    galleryStore?.patchPagination(pagination);
    return { items: [], pagination };
  }

  return {
    applyImagesPage,
    clearItems,
    patchPagination,
    replaceFlatItems,
  };
}
