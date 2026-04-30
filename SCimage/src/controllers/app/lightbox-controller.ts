// @ts-nocheck

import {
  LIGHTBOX_ZOOM_MAX,
  LIGHTBOX_ZOOM_MIN,
  LIGHTBOX_ZOOM_STEP,
} from "./constants";

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createLightboxController({ elements, getItems, getJobById, isActiveStatus, isActionDisabled }) {
  let index = -1;
  let selection = null;
  let zoomState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  };

  function getCurrentItem() {
    return getItems()[index] || null;
  }

  function getCurrentIndex() {
    return index;
  }

  function getSelection() {
    return selection ? { ...selection } : null;
  }

  function getZoomScale() {
    return zoomState.scale;
  }

  function isOpen() {
    return elements.lightbox.classList.contains("open");
  }

  function applyZoom() {
    const scale = clampNumber(zoomState.scale, LIGHTBOX_ZOOM_MIN, LIGHTBOX_ZOOM_MAX);
    zoomState.scale = scale;
    if (scale <= LIGHTBOX_ZOOM_MIN) {
      zoomState.offsetX = 0;
      zoomState.offsetY = 0;
    }

    if (elements.lightboxImg) {
      elements.lightboxImg.style.transform = `translate(${zoomState.offsetX}px, ${zoomState.offsetY}px) scale(${scale})`;
    }
    if (elements.lightboxWrap) {
      elements.lightboxWrap.classList.toggle("is-zoomed", scale > LIGHTBOX_ZOOM_MIN);
      elements.lightboxWrap.classList.toggle("is-dragging", zoomState.isDragging);
    }
    if (elements.lightboxZoomValue) {
      elements.lightboxZoomValue.textContent = `${Math.round(scale * 100)}%`;
    }
    if (elements.lightboxZoomOut) {
      elements.lightboxZoomOut.disabled = scale <= LIGHTBOX_ZOOM_MIN;
    }
    if (elements.lightboxZoomReset) {
      elements.lightboxZoomReset.disabled = scale <= LIGHTBOX_ZOOM_MIN;
    }
    if (elements.lightboxZoomIn) {
      elements.lightboxZoomIn.disabled = scale >= LIGHTBOX_ZOOM_MAX;
    }
  }

  function resetZoom() {
    zoomState = {
      ...zoomState,
      scale: LIGHTBOX_ZOOM_MIN,
      offsetX: 0,
      offsetY: 0,
      isDragging: false,
    };
    applyZoom();
  }

  function setZoom(nextScale) {
    zoomState.scale = clampNumber(nextScale, LIGHTBOX_ZOOM_MIN, LIGHTBOX_ZOOM_MAX);
    applyZoom();
  }

  function zoomBy(delta) {
    setZoom(zoomState.scale + delta);
  }

  function resolveIndex(nextIndex, nextSelection = {}) {
    const items = getItems();
    if (Number.isInteger(nextIndex) && items[nextIndex]) {
      return nextIndex;
    }
    const jobId = nextSelection.jobId || "";
    const slot = Number(nextSelection.slot || 0);
    if (!jobId || !slot) {
      return -1;
    }
    return items.findIndex((item) => item.jobId === jobId && Number(item.slot || 0) === slot);
  }

  function showItem(nextIndex) {
    const items = getItems();
    const item = items[nextIndex];
    if (!item) {
      return false;
    }

    const job = getJobById(item.jobId);
    index = nextIndex;
    selection = { jobId: item.jobId, slot: item.slot };

    resetZoom();
    elements.lightboxPrompt.classList.remove("expanded");
    elements.lightboxImg.src = item.src;
    elements.lightboxPrompt.textContent = item.prompt || "";
    elements.lightboxCounter.textContent = `${nextIndex + 1} / ${items.length}`;
    if (elements.lightboxAddSource) {
      elements.lightboxAddSource.disabled = false;
    }
    elements.lightboxPrev.disabled = nextIndex === 0;
    elements.lightboxNext.disabled = nextIndex === items.length - 1;

    if (job && isActiveStatus(job.status)) {
      elements.lightboxDel.textContent = "中断任务";
      elements.lightboxDel.disabled = isActionDisabled(job.id);
    } else {
      elements.lightboxDel.textContent = "删除图片";
      elements.lightboxDel.disabled = job ? isActionDisabled(job.id) : true;
    }
    return true;
  }

  function open(nextIndex, nextSelection = {}) {
    const resolvedIndex = resolveIndex(nextIndex, nextSelection);
    if (!showItem(resolvedIndex)) {
      return;
    }
    elements.lightbox.classList.add("open");
    elements.lightbox.setAttribute("role", "dialog");
    elements.lightbox.setAttribute("aria-modal", "true");
    document.body.style.overflow = "hidden";
  }

  function close() {
    elements.lightbox.classList.remove("open");
    document.body.style.overflow = "";
    index = -1;
    selection = null;
    resetZoom();
  }

  function syncSelection() {
    if (!elements.lightbox.classList.contains("open") || !selection) {
      return;
    }

    const nextIndex = getItems().findIndex((item) => {
      if (item.jobId !== selection.jobId) {
        return false;
      }
      return item.slot === selection.slot;
    });

    if (nextIndex === -1) {
      close();
      return;
    }

    showItem(nextIndex);
  }

  function nav(direction) {
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < getItems().length) {
      showItem(nextIndex);
    }
  }

  function startPan(event) {
    if (zoomState.scale <= LIGHTBOX_ZOOM_MIN || event.button !== 0) {
      return;
    }
    event.preventDefault();
    zoomState = {
      ...zoomState,
      isDragging: true,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: zoomState.offsetX,
      startOffsetY: zoomState.offsetY,
    };
    elements.lightboxImg?.setPointerCapture?.(event.pointerId);
    applyZoom();
  }

  function updatePan(event) {
    if (!zoomState.isDragging) {
      return;
    }
    event.preventDefault();
    zoomState.offsetX = zoomState.startOffsetX + event.clientX - zoomState.startX;
    zoomState.offsetY = zoomState.startOffsetY + event.clientY - zoomState.startY;
    applyZoom();
  }

  function stopPan(event) {
    if (!zoomState.isDragging) {
      return;
    }
    zoomState.isDragging = false;
    if (elements.lightboxImg?.hasPointerCapture?.(event.pointerId)) {
      elements.lightboxImg.releasePointerCapture(event.pointerId);
    }
    applyZoom();
  }

  function handleWheel(event) {
    if (!elements.lightbox.classList.contains("open")) {
      return;
    }
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? LIGHTBOX_ZOOM_STEP : -LIGHTBOX_ZOOM_STEP);
  }

  return {
    close,
    getCurrentIndex,
    getCurrentItem,
    getSelection,
    getZoomScale,
    handleWheel,
    isOpen,
    nav,
    open,
    resolveIndex,
    resetZoom,
    setZoom,
    showItem,
    startPan,
    stopPan,
    syncSelection,
    updatePan,
    zoomBy,
  };
}
