import { onBeforeUnmount, ref, type Ref } from "vue";

interface DragScrollState {
  pointerId: number;
  captureTarget: HTMLElement | null;
  startClientX: number;
  startScrollLeft: number;
  moved: boolean;
}

interface UseHorizontalDragScrollOptions {
  container: Ref<HTMLElement | null>;
  threshold?: number;
}

const DEFAULT_DRAG_THRESHOLD = 5;

export function useHorizontalDragScroll(options: UseHorizontalDragScrollOptions) {
  const isDragging = ref(false);
  const suppressNextClick = ref(false);
  let state = emptyDragScrollState();
  let suppressClickTimer = 0;

  function handlePointerDown(event: PointerEvent) {
    if (!isPrimaryPointer(event)) return;
    const container = options.container.value;
    if (!container || container.scrollWidth <= container.clientWidth) return;

    const captureTarget = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : container;
    captureTarget.setPointerCapture?.(event.pointerId);
    state = {
      pointerId: event.pointerId,
      captureTarget,
      startClientX: event.clientX,
      startScrollLeft: container.scrollLeft,
      moved: false,
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", cancelDragScroll, { once: true });
  }

  function handlePointerMove(event: PointerEvent) {
    if (!state.pointerId || event.pointerId !== state.pointerId) return;
    const container = options.container.value;
    if (!container) {
      cancelDragScroll(event);
      return;
    }

    const deltaX = event.clientX - state.startClientX;
    const threshold = options.threshold ?? DEFAULT_DRAG_THRESHOLD;
    if (!state.moved && Math.abs(deltaX) < threshold) return;

    event.preventDefault();
    state.moved = true;
    isDragging.value = true;
    container.scrollLeft = state.startScrollLeft - deltaX;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!state.pointerId || event.pointerId !== state.pointerId) return;
    cleanupDragScroll();
  }

  function cancelDragScroll(event?: PointerEvent) {
    if (event && state.pointerId && event.pointerId !== state.pointerId) return;
    cleanupDragScroll();
  }

  function cleanupDragScroll() {
    if (state.moved) suppressClickOnce();
    releasePointerCapture();
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", cancelDragScroll);
    state = emptyDragScrollState();
    isDragging.value = false;
  }

  function shouldSuppressClick() {
    if (!suppressNextClick.value) return false;
    suppressNextClick.value = false;
    window.clearTimeout(suppressClickTimer);
    return true;
  }

  function suppressClickOnce() {
    suppressNextClick.value = true;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => {
      suppressNextClick.value = false;
    }, 0);
  }

  function disposeHorizontalDragScroll() {
    window.clearTimeout(suppressClickTimer);
    cleanupDragScroll();
  }

  onBeforeUnmount(disposeHorizontalDragScroll);

  return {
    isDragging,
    handlePointerDown,
    shouldSuppressClick,
    disposeHorizontalDragScroll,
  };

  function releasePointerCapture() {
    if (!state.captureTarget?.hasPointerCapture?.(state.pointerId)) return;
    state.captureTarget.releasePointerCapture(state.pointerId);
  }
}

function emptyDragScrollState(): DragScrollState {
  return {
    pointerId: 0,
    captureTarget: null,
    startClientX: 0,
    startScrollLeft: 0,
    moved: false,
  };
}

function isPrimaryPointer(event: PointerEvent) {
  if (event.isPrimary === false) return false;
  return event.pointerType !== "mouse" || event.button === 0;
}
