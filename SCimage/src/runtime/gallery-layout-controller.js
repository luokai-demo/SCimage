"use strict";

(() => {
  function normalizeRect(rect) {
    const left = Math.min(rect.startX, rect.currentX);
    const top = Math.min(rect.startY, rect.currentY);
    const right = Math.max(rect.startX, rect.currentX);
    const bottom = Math.max(rect.startY, rect.currentY);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  class GalleryLayoutCoordinator {
    constructor({
      nodes = [],
      onLayout,
      onRefresh,
      transitionMs = 560,
    } = {}) {
      this.nodes = nodes.filter(Boolean);
      this.onLayout = onLayout;
      this.onRefresh = onRefresh;
      this.transitionMs = transitionMs;
      this.frameId = 0;
      this.resizeTimer = 0;
      this.transitionTimers = [];
      this.resizeObserver = null;
      this.handleResize = this.handleResize.bind(this);
      this.handleTransitionSignal = this.handleTransitionSignal.bind(this);
    }

    start() {
      if (typeof ResizeObserver === "function") {
        this.resizeObserver = new ResizeObserver(() => this.schedule("resize-observer", { refresh: true }));
        this.nodes.forEach((node) => this.resizeObserver.observe(node));
      }
      window.addEventListener("resize", this.handleResize);
      window.addEventListener("gallery-layout-change", this.handleTransitionSignal);
    }

    stop() {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("gallery-layout-change", this.handleTransitionSignal);
      this.transitionTimers.forEach((timer) => window.clearTimeout(timer));
      this.transitionTimers = [];
      if (this.frameId) {
        window.cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }
      if (this.resizeTimer) {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = 0;
      }
    }

    handleResize() {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.schedule("window-resize", { refresh: true }), 80);
    }

    handleTransitionSignal() {
      this.scheduleAcrossTransition("layout-signal");
    }

    scheduleAcrossTransition(reason = "transition") {
      this.schedule(reason, { refresh: true });
      this.transitionTimers.forEach((timer) => window.clearTimeout(timer));
      this.transitionTimers = [120, 280, this.transitionMs].map((delay) => (
        window.setTimeout(() => this.schedule(`${reason}:${delay}`, { refresh: true }), delay)
      ));
    }

    schedule(reason = "layout", options = {}) {
      if (this.frameId) {
        return;
      }
      this.frameId = window.requestAnimationFrame(() => {
        this.frameId = 0;
        this.onLayout?.(reason);
        if (options.refresh) {
          this.onRefresh?.(reason);
        }
      });
    }
  }

  class GalleryEdgeSelectionController {
    constructor({
      shell,
      windowNode,
      selectionBox,
      edgeSize = 112,
      clickTolerance = 5,
      excludedSelector = "button, a, input, textarea, select, [data-action]",
      getInitialKeys,
      previewSelection,
      clearSelection,
      finishSelection,
    } = {}) {
      this.shell = shell;
      this.windowNode = windowNode;
      this.selectionBox = selectionBox;
      this.edgeSize = edgeSize;
      this.clickTolerance = clickTolerance;
      this.excludedSelector = excludedSelector;
      this.getInitialKeys = getInitialKeys;
      this.previewSelection = previewSelection;
      this.clearSelection = clearSelection;
      this.finishSelection = finishSelection;
      this.state = null;
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.dragZones = [];
    }

    start() {
      this.shell?.addEventListener("pointerdown", this.handlePointerDown);
      this.shell?.addEventListener("pointermove", this.handlePointerMove);
      this.shell?.addEventListener("pointerup", this.handlePointerUp);
      this.shell?.addEventListener("pointercancel", this.handlePointerUp);
      this.dragZones = Array.from(document.querySelectorAll("[data-selection-drag-zone]"));
      this.dragZones.forEach((zone) => {
        zone.addEventListener("pointerdown", this.handlePointerDown);
        zone.addEventListener("pointermove", this.handlePointerMove);
        zone.addEventListener("pointerup", this.handlePointerUp);
        zone.addEventListener("pointercancel", this.handlePointerUp);
      });
    }

    stop() {
      this.shell?.removeEventListener("pointerdown", this.handlePointerDown);
      this.shell?.removeEventListener("pointermove", this.handlePointerMove);
      this.shell?.removeEventListener("pointerup", this.handlePointerUp);
      this.shell?.removeEventListener("pointercancel", this.handlePointerUp);
      this.dragZones.forEach((zone) => {
        zone.removeEventListener("pointerdown", this.handlePointerDown);
        zone.removeEventListener("pointermove", this.handlePointerMove);
        zone.removeEventListener("pointerup", this.handlePointerUp);
        zone.removeEventListener("pointercancel", this.handlePointerUp);
      });
      this.dragZones = [];
    }

    isNearEdge(event) {
      const bounds = this.windowNode?.getBoundingClientRect?.();
      if (!bounds) {
        return false;
      }
      if (event.target.closest("[data-selection-drag-zone]")) {
        return true;
      }
      return false;
    }

    handlePointerDown(event) {
      if (event.button !== 0 || event.target.closest(this.excludedSelector)) {
        return;
      }
      if (!event.target.closest("[data-selection-drag-zone]") || !this.isNearEdge(event)) {
        return;
      }
      if (event.target.closest("[data-selection-drag-zone]")) {
        event.preventDefault();
      }
      this.state = {
        pointerId: event.pointerId,
        startedOnDragZone: Boolean(event.target.closest("[data-selection-drag-zone]")),
        startedOnGalleryItem: Boolean(event.target.closest(".gallery-item")),
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        initialKeys: this.getInitialKeys?.() || new Set(),
        moved: false,
      };
      if (!this.state.startedOnGalleryItem || this.state.startedOnDragZone) {
        const captureTarget = this.state.startedOnDragZone ? event.currentTarget : this.shell;
        captureTarget?.setPointerCapture?.(event.pointerId);
      }
    }

    handlePointerMove(event) {
      if (!this.state || this.state.pointerId !== event.pointerId) {
        return;
      }
      this.state.currentX = event.clientX;
      this.state.currentY = event.clientY;
      const rect = normalizeRect(this.state);
      this.state.moved = rect.width > this.clickTolerance || rect.height > this.clickTolerance;
      this.showSelectionBox(rect);
      this.previewSelection?.(rect, this.state.initialKeys);
    }

    handlePointerUp(event) {
      if (!this.state || this.state.pointerId !== event.pointerId) {
        return;
      }
      const rect = normalizeRect(this.state);
      const wasClick = !this.state.moved
        && rect.width <= this.clickTolerance
        && rect.height <= this.clickTolerance;
      if (wasClick && this.state.startedOnDragZone) {
        this.clearSelection?.();
        this.finishSelection?.();
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
        this.shell?.releasePointerCapture?.(event.pointerId);
        this.state = null;
        return;
      }
      if (wasClick && this.state.startedOnGalleryItem) {
        this.shell?.releasePointerCapture?.(event.pointerId);
        this.state = null;
        return;
      }
      if (wasClick) {
        if (!this.state.startedOnGalleryItem) {
          this.clearSelection?.();
        }
      } else {
        this.previewSelection?.(rect, this.state.initialKeys);
      }
      if (this.selectionBox) {
        this.selectionBox.hidden = true;
      }
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
      this.shell?.releasePointerCapture?.(event.pointerId);
      this.state = null;
      this.finishSelection?.();
    }

    showSelectionBox(rect) {
      if (!this.selectionBox) {
        return;
      }
      this.selectionBox.hidden = false;
      this.selectionBox.style.left = `${rect.left}px`;
      this.selectionBox.style.top = `${rect.top}px`;
      this.selectionBox.style.width = `${rect.width}px`;
      this.selectionBox.style.height = `${rect.height}px`;
    }
  }

  window.GalleryLayoutController = {
    GalleryLayoutCoordinator,
    GalleryEdgeSelectionController,
  };
})();
