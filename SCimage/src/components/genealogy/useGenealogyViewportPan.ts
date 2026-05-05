import { onBeforeUnmount, ref, type Ref } from "vue";

interface ViewportPanState {
  pointerId: number;
  captureTarget: HTMLElement | null;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
}

interface UseGenealogyViewportPanOptions {
  viewport: Ref<HTMLElement | null>;
  canStartPan?: () => boolean;
  scheduleViewportUpdate: () => void;
  threshold?: number;
}

const DEFAULT_PAN_THRESHOLD = 3;
const INTERACTIVE_TARGET_SELECTOR = [
  "[data-genealogy-node-id]",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
].join(",");

export function useGenealogyViewportPan(options: UseGenealogyViewportPanOptions) {
  const isPanning = ref(false);
  let state = emptyViewportPanState();

  function handleViewportPointerDown(event: PointerEvent) {
    if (!isPrimaryPointer(event) || options.canStartPan?.() === false) return;
    const viewport = options.viewport.value;
    if (!viewport || event.currentTarget !== viewport) return;
    if (isInteractiveViewportTarget(event.target)) return;

    event.preventDefault();
    viewport.setPointerCapture?.(event.pointerId);
    state = {
      pointerId: event.pointerId,
      captureTarget: viewport,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false,
    };

    window.addEventListener("pointermove", handleViewportPointerMove);
    window.addEventListener("pointerup", handleViewportPointerUp, { once: true });
    window.addEventListener("pointercancel", cancelViewportPan, { once: true });
  }

  function handleViewportPointerMove(event: PointerEvent) {
    if (!state.pointerId || event.pointerId !== state.pointerId) return;
    const viewport = options.viewport.value;
    if (!viewport) {
      cancelViewportPan(event);
      return;
    }

    const deltaX = event.clientX - state.startClientX;
    const deltaY = event.clientY - state.startClientY;
    const threshold = options.threshold ?? DEFAULT_PAN_THRESHOLD;
    if (!state.moved && Math.hypot(deltaX, deltaY) < threshold) return;

    event.preventDefault();
    state.moved = true;
    isPanning.value = true;
    viewport.scrollLeft = state.startScrollLeft - deltaX;
    viewport.scrollTop = state.startScrollTop - deltaY;
    options.scheduleViewportUpdate();
  }

  function handleViewportPointerUp(event: PointerEvent) {
    if (!state.pointerId || event.pointerId !== state.pointerId) return;
    cleanupViewportPan();
  }

  function cancelViewportPan(event?: PointerEvent) {
    if (event && state.pointerId && event.pointerId !== state.pointerId) return;
    cleanupViewportPan();
  }

  function cleanupViewportPan() {
    releaseViewportPointerCapture();
    window.removeEventListener("pointermove", handleViewportPointerMove);
    window.removeEventListener("pointerup", handleViewportPointerUp);
    window.removeEventListener("pointercancel", cancelViewportPan);
    state = emptyViewportPanState();
    isPanning.value = false;
  }

  function disposeViewportPan() {
    cleanupViewportPan();
  }

  onBeforeUnmount(disposeViewportPan);

  return {
    isPanning,
    handleViewportPointerDown,
    disposeViewportPan,
  };

  function releaseViewportPointerCapture() {
    if (!state.captureTarget?.hasPointerCapture?.(state.pointerId)) return;
    state.captureTarget.releasePointerCapture(state.pointerId);
  }
}

function emptyViewportPanState(): ViewportPanState {
  return {
    pointerId: 0,
    captureTarget: null,
    startClientX: 0,
    startClientY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    moved: false,
  };
}

function isPrimaryPointer(event: PointerEvent) {
  if (event.isPrimary === false) return false;
  return event.pointerType !== "mouse" || event.button === 0;
}

function isInteractiveViewportTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(INTERACTIVE_TARGET_SELECTOR));
}
