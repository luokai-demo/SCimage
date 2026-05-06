import type { Ref } from "vue";
import type { GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";
import { clampNodePosition } from "./genealogyNodeDragMath";

export interface AutoScrollState {
  currentX: number;
  currentY: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
  nodeId: string;
}

interface GenealogyDragAutoScrollOptions<TState extends AutoScrollState> {
  getState: () => TState;
  scheduleViewportUpdate: () => void;
  setState: (state: TState) => void;
  updateNodePosition: (nodeId: string, position: GenealogyNodeDragPosition) => void;
  viewport: Ref<HTMLElement | null>;
}

const DRAG_EDGE_PAN_ZONE = 72;
const DRAG_EDGE_PAN_MAX_SPEED = 22;

export function createGenealogyDragAutoScroll<TState extends AutoScrollState>(options: GenealogyDragAutoScrollOptions<TState>) {
  let dragAutoScrollFrame = 0;

  function startNodeDragAutoScroll() {
    if (dragAutoScrollFrame) return;
    dragAutoScrollFrame = window.requestAnimationFrame(runNodeDragAutoScroll);
  }

  function cancelNodeDragAutoScroll() {
    window.cancelAnimationFrame(dragAutoScrollFrame);
    dragAutoScrollFrame = 0;
  }

  function runNodeDragAutoScroll() {
    dragAutoScrollFrame = 0;
    const state = options.getState();
    const viewport = options.viewport.value;
    if (!state.nodeId || !state.moved || !viewport) return;

    const rect = viewport.getBoundingClientRect();
    const deltaX = edgePanVelocity(state.lastClientX, rect.left, rect.right);
    const deltaY = edgePanVelocity(state.lastClientY, rect.top, rect.bottom);
    if (!deltaX && !deltaY) return;

    const beforeLeft = viewport.scrollLeft;
    const beforeTop = viewport.scrollTop;
    viewport.scrollBy({ left: deltaX, top: deltaY, behavior: "auto" });
    const scrollDeltaX = viewport.scrollLeft - beforeLeft;
    const scrollDeltaY = viewport.scrollTop - beforeTop;
    const nextState = {
      ...state,
      currentX: Math.max(0, state.currentX + scrollDeltaX),
      currentY: Math.max(0, state.currentY + scrollDeltaY),
    } as TState;
    options.setState(nextState);
    options.updateNodePosition(state.nodeId, clampNodePosition({ x: nextState.currentX, y: nextState.currentY }));
    options.scheduleViewportUpdate();
    dragAutoScrollFrame = window.requestAnimationFrame(runNodeDragAutoScroll);
  }

  return {
    cancelNodeDragAutoScroll,
    startNodeDragAutoScroll,
  };
}

function edgePanVelocity(pointer: number, start: number, end: number) {
  if (pointer < start + DRAG_EDGE_PAN_ZONE) {
    const ratio = (start + DRAG_EDGE_PAN_ZONE - pointer) / DRAG_EDGE_PAN_ZONE;
    return -Math.ceil(Math.min(1, ratio) * DRAG_EDGE_PAN_MAX_SPEED);
  }
  if (pointer > end - DRAG_EDGE_PAN_ZONE) {
    const ratio = (pointer - (end - DRAG_EDGE_PAN_ZONE)) / DRAG_EDGE_PAN_ZONE;
    return Math.ceil(Math.min(1, ratio) * DRAG_EDGE_PAN_MAX_SPEED);
  }
  return 0;
}
