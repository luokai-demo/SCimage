// @ts-nocheck

function rectsIntersect(left, right) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

export function getGallerySelectionKey(jobId, slot) {
  return `${jobId || ""}:${Number(slot || 0)}`;
}

export function createGallerySelectionController({ elements, getGalleryStore, getFlatList, onSelectionGestureFinished }) {
  const selectedKeys = new Set();

  function syncBatchToolbar() {
    const count = selectedKeys.size;
    const isBatchMode = count > 0;
    getGalleryStore?.()?.replaceSelection(selectedKeys);
    elements.galleryHeader?.classList.toggle("is-batch-mode", count > 0);
    if (elements.galleryHeaderNormal) {
      elements.galleryHeaderNormal.hidden = isBatchMode;
    }
    if (elements.galleryHeaderBatch) {
      elements.galleryHeaderBatch.hidden = !isBatchMode;
    }
    if (elements.batchToolbar) {
      elements.batchToolbar.hidden = !isBatchMode;
    }
    if (elements.batchCount) {
      elements.batchCount.textContent = `已选择 ${count} 张`;
    }
    if (elements.batchDownloadBtn) {
      elements.batchDownloadBtn.disabled = count === 0;
    }
    if (elements.batchDeleteBtn) {
      elements.batchDeleteBtn.disabled = count === 0;
    }
  }

  function syncCards() {
    elements.galleryGrid.querySelectorAll(".gallery-item[data-job-id][data-image-slot]").forEach((card) => {
      const key = getGallerySelectionKey(card.dataset.jobId, Number(card.dataset.imageSlot || 0));
      card.classList.toggle("is-selected", selectedKeys.has(key));
    });
  }

  function previewRectSelection(rect, initialKeys = selectedKeys) {
    if (rect.width < 4 && rect.height < 4) {
      return;
    }
    const nextKeys = new Set(initialKeys);
    elements.galleryGrid.querySelectorAll(".gallery-item[data-job-id][data-image-slot]").forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const key = getGallerySelectionKey(card.dataset.jobId, Number(card.dataset.imageSlot || 0));
      if (rectsIntersect(rect, cardRect)) {
        nextKeys.add(key);
      }
    });
    selectedKeys.clear();
    nextKeys.forEach((key) => selectedKeys.add(key));
    syncBatchToolbar();
    syncCards();
  }

  function clear({ syncCards: shouldSyncCards = false } = {}) {
    selectedKeys.clear();
    syncBatchToolbar();
    if (shouldSyncCards) {
      syncCards();
    }
  }

  function finishGesture() {
    onSelectionGestureFinished?.();
  }

  function toggle(jobId, slot) {
    const key = getGallerySelectionKey(jobId, Number(slot || 0));
    if (selectedKeys.has(key)) {
      selectedKeys.delete(key);
    } else {
      selectedKeys.add(key);
    }
    syncBatchToolbar();
    return selectedKeys.has(key);
  }

  function getSelectedItems() {
    return getFlatList()
      .filter((item) => selectedKeys.has(getGallerySelectionKey(item.jobId, item.slot)))
      .map((item) => ({ job_id: item.jobId, slot: Number(item.slot || 0) }));
  }

  function has(jobId, slot) {
    return selectedKeys.has(getGallerySelectionKey(jobId, slot));
  }

  function snapshot() {
    return new Set(selectedKeys);
  }

  return {
    clear,
    finishGesture,
    getSelectedItems,
    has,
    previewRectSelection,
    snapshot,
    syncBatchToolbar,
    syncCards,
    toggle,
  };
}
