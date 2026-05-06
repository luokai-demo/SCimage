import type { GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";

export function pointerDeltaSinceLastEvent(
  state: { lastClientX: number; lastClientY: number },
  event: { clientX: number; clientY: number },
) {
  return {
    x: event.clientX - state.lastClientX,
    y: event.clientY - state.lastClientY,
  };
}

export function hasNodeDragMoved(
  state: { moved: boolean; startClientX: number; startClientY: number },
  event: { clientX: number; clientY: number },
) {
  return state.moved || Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY) >= 3;
}

export function clampNodePosition(position: GenealogyNodeDragPosition) {
  return {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y)),
  };
}

export function clampRawNodePosition(position: GenealogyNodeDragPosition) {
  return {
    x: Math.max(0, position.x),
    y: Math.max(0, position.y),
  };
}
