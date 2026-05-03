import { onBeforeUnmount, ref, type Ref } from "vue";

export interface GenealogyDraggableNode {
  id: string;
  x: number;
  y: number;
}

export interface GenealogyNodeDragPosition {
  x: number;
  y: number;
}

interface NodeDragState {
  nodeId: string;
  pointerId: number;
  captureTarget: HTMLElement | null;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

interface UseGenealogyNodeDragOptions<TNode extends GenealogyDraggableNode> {
  viewport: Ref<HTMLElement | null>;
  getNode: (nodeId: string) => TNode | null | undefined;
  canDragNode: (node: TNode) => boolean;
  selectNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, position: GenealogyNodeDragPosition) => void;
  saveNodePosition: (
    node: TNode,
    position: GenealogyNodeDragPosition,
    fallback: GenealogyNodeDragPosition,
  ) => void | Promise<void>;
  scheduleViewportUpdate: () => void;
  onDragCanceled?: () => void;
}

const DRAG_EDGE_PAN_ZONE = 72;
const DRAG_EDGE_PAN_MAX_SPEED = 22;

export function useGenealogyNodeDrag<TNode extends GenealogyDraggableNode>(
  options: UseGenealogyNodeDragOptions<TNode>,
) {
  const dragState = ref<NodeDragState>(emptyNodeDragState());
  const suppressNextNodeClickId = ref("");
  let suppressNodeClickTimer = 0;
  let dragFrame = 0;
  let dragAutoScrollFrame = 0;

  function selectNodeFromCard(nodeId: string) {
    if (suppressNextNodeClickId.value === nodeId) {
      suppressNextNodeClickId.value = "";
      return;
    }
    options.selectNode(nodeId);
  }

  function handleNodePointerDown(event: PointerEvent, nodeId: string) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select")) return;
    const node = options.getNode(nodeId);
    if (!node || !options.canDragNode(node)) return;

    event.preventDefault();
    const captureTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    captureTarget?.setPointerCapture?.(event.pointerId);
    options.selectNode(nodeId);
    dragState.value = {
      nodeId,
      pointerId: event.pointerId,
      captureTarget,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      currentX: node.x,
      currentY: node.y,
      moved: false,
    };

    window.addEventListener("pointermove", handleNodePointerMove);
    window.addEventListener("pointerup", handleNodePointerUp, { once: true });
    window.addEventListener("pointercancel", cancelNodeDrag, { once: true });
  }

  function handleNodePointerMove(event: PointerEvent) {
    const state = dragState.value;
    if (!state.nodeId || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const delta = pointerDeltaSinceLastEvent(state, event);
    const moved = state.moved || Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY) >= 3;
    const nextPosition = clampRawNodePosition({
      x: state.currentX + delta.x,
      y: state.currentY + delta.y,
    });
    dragState.value = {
      ...state,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      currentX: nextPosition.x,
      currentY: nextPosition.y,
      moved,
    };
    if (!moved) return;
    scheduleDraggedNodePositionUpdate(clampNodePosition(nextPosition));
    startNodeDragAutoScroll();
  }

  function handleNodePointerUp(event: PointerEvent) {
    const state = dragState.value;
    if (!state.nodeId || event.pointerId !== state.pointerId) return;
    cleanupNodeDrag();
    const nextState = {
      ...state,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
    const finalDelta = pointerDeltaSinceLastEvent(state, event);
    const nextPosition = clampNodePosition(clampRawNodePosition({
      x: state.currentX + finalDelta.x,
      y: state.currentY + finalDelta.y,
    }));
    if (nextState.moved) {
      options.updateNodePosition(nextState.nodeId, nextPosition);
    }
    const node = options.getNode(nextState.nodeId);
    if (nextState.moved) suppressNodeClick(nextState.nodeId);
    dragState.value = emptyNodeDragState();
    if (!node || !nextState.moved) return;
    void options.saveNodePosition(node, nextPosition, { x: state.startX, y: state.startY });
  }

  function cancelNodeDrag() {
    const state = dragState.value;
    cleanupNodeDrag();
    if (state.nodeId) {
      options.updateNodePosition(state.nodeId, { x: state.startX, y: state.startY });
    }
    dragState.value = emptyNodeDragState();
    options.onDragCanceled?.();
  }

  function cleanupNodeDrag() {
    const state = dragState.value;
    window.removeEventListener("pointermove", handleNodePointerMove);
    window.removeEventListener("pointerup", handleNodePointerUp);
    window.removeEventListener("pointercancel", cancelNodeDrag);
    window.cancelAnimationFrame(dragFrame);
    window.cancelAnimationFrame(dragAutoScrollFrame);
    dragAutoScrollFrame = 0;
    releaseNodePointerCapture(state);
  }

  function scheduleDraggedNodePositionUpdate(position: GenealogyNodeDragPosition) {
    window.cancelAnimationFrame(dragFrame);
    dragFrame = window.requestAnimationFrame(() => {
      const nextState = dragState.value;
      if (!nextState.nodeId || !nextState.moved) return;
      options.updateNodePosition(nextState.nodeId, position);
      options.scheduleViewportUpdate();
    });
  }

  function pointerDeltaSinceLastEvent(state: NodeDragState, event: { clientX: number; clientY: number }) {
    return {
      x: event.clientX - state.lastClientX,
      y: event.clientY - state.lastClientY,
    };
  }

  function startNodeDragAutoScroll() {
    if (dragAutoScrollFrame) return;
    dragAutoScrollFrame = window.requestAnimationFrame(runNodeDragAutoScroll);
  }

  function runNodeDragAutoScroll() {
    dragAutoScrollFrame = 0;
    const state = dragState.value;
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
    };
    dragState.value = nextState;
    options.updateNodePosition(state.nodeId, clampNodePosition({ x: nextState.currentX, y: nextState.currentY }));
    options.scheduleViewportUpdate();
    dragAutoScrollFrame = window.requestAnimationFrame(runNodeDragAutoScroll);
  }

  function suppressNodeClick(nodeId: string) {
    suppressNextNodeClickId.value = nodeId;
    window.clearTimeout(suppressNodeClickTimer);
    suppressNodeClickTimer = window.setTimeout(() => {
      if (suppressNextNodeClickId.value === nodeId) suppressNextNodeClickId.value = "";
    }, 0);
  }

  function disposeNodeDrag() {
    window.clearTimeout(suppressNodeClickTimer);
    cleanupNodeDrag();
  }

  onBeforeUnmount(disposeNodeDrag);

  return {
    dragState,
    handleNodePointerDown,
    selectNodeFromCard,
    cancelNodeDrag,
    disposeNodeDrag,
  };
}

function emptyNodeDragState(): NodeDragState {
  return {
    nodeId: "",
    pointerId: 0,
    captureTarget: null,
    startClientX: 0,
    startClientY: 0,
    lastClientX: 0,
    lastClientY: 0,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    moved: false,
  };
}

function clampNodePosition(position: GenealogyNodeDragPosition) {
  return {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y)),
  };
}

function clampRawNodePosition(position: GenealogyNodeDragPosition) {
  return {
    x: Math.max(0, position.x),
    y: Math.max(0, position.y),
  };
}

function releaseNodePointerCapture(state: NodeDragState) {
  if (!state.captureTarget?.hasPointerCapture?.(state.pointerId)) return;
  state.captureTarget.releasePointerCapture(state.pointerId);
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
