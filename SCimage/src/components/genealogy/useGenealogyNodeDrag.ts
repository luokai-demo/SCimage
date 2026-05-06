import { onBeforeUnmount, ref, type Ref } from "vue";
import {
  clampNodePosition,
  clampRawNodePosition,
  hasNodeDragMoved,
  pointerDeltaSinceLastEvent,
} from "./genealogyNodeDragMath";
import { createGenealogyDragAutoScroll } from "./genealogyDragAutoScroll";
import { useNodeClickSuppressor } from "./useNodeClickSuppressor";

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

export function useGenealogyNodeDrag<TNode extends GenealogyDraggableNode>(
  options: UseGenealogyNodeDragOptions<TNode>,
) {
  const dragState = ref<NodeDragState>(emptyNodeDragState());
  let dragFrame = 0;
  const {
    disposeNodeClickSuppressor,
    shouldSuppressNodeClick,
    suppressNodeClick,
  } = useNodeClickSuppressor();
  const {
    cancelNodeDragAutoScroll,
    startNodeDragAutoScroll,
  } = createGenealogyDragAutoScroll({
    getState: () => dragState.value,
    scheduleViewportUpdate: options.scheduleViewportUpdate,
    setState: (state) => {
      dragState.value = state;
    },
    updateNodePosition: options.updateNodePosition,
    viewport: options.viewport,
  });

  function selectNodeFromCard(nodeId: string) {
    if (shouldSuppressNodeClick(nodeId)) return;
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
    const moved = hasNodeDragMoved(state, event);
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
    } else {
      options.selectNode(nextState.nodeId);
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
    cancelNodeDragAutoScroll();
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

  function disposeNodeDrag() {
    disposeNodeClickSuppressor();
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

function releaseNodePointerCapture(state: NodeDragState) {
  if (!state.captureTarget?.hasPointerCapture?.(state.pointerId)) return;
  state.captureTarget.releasePointerCapture(state.pointerId);
}
