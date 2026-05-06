import { onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";
import {
  type GenealogyLayout,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import { findGenealogyMiniMapNodeAtPoint } from "./genealogyMiniMapHitTest";

interface MiniMapModel {
  nodes: GenealogyLayoutNode[];
}

interface GenealogyMiniMapInteractionOptions {
  layout: Readonly<Ref<GenealogyLayout>>;
  miniMapModel: ComputedRef<MiniMapModel>;
  onFocusNode: (nodeId: string) => void;
  onPanTo: (point: { x: number; y: number }) => void;
  svgEl: Readonly<Ref<SVGSVGElement | null>>;
}

export function useGenealogyMiniMapInteraction(options: GenealogyMiniMapInteractionOptions) {
  const isOverlayDragging = ref(false);
  let overlayDragPointerId = 0;
  let startPointerPoint = { x: 0, y: 0 };
  let dragStartedOnNodeId = "";

  function onOverlayPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const point = eventToSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    dragStartedOnNodeId = findNodeAtPoint(point)?.id || "";
    startPointerPoint = point;
    isOverlayDragging.value = false;
    overlayDragPointerId = event.pointerId;
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!dragStartedOnNodeId) options.onPanTo(point);
  }

  function onOverlayPointerMove(event: PointerEvent) {
    if (event.pointerId !== overlayDragPointerId) return;
    const point = eventToSvgPoint(event);
    if (!point) return;

    if (
      !isOverlayDragging.value &&
      Math.hypot(point.x - startPointerPoint.x, point.y - startPointerPoint.y) < 4
    ) {
      return;
    }
    isOverlayDragging.value = true;
    options.onPanTo(point);
  }

  function stopOverlayDrag(event?: PointerEvent) {
    if (!overlayDragPointerId) return;
    if (event && event.pointerId !== overlayDragPointerId) return;

    const point = event ? eventToSvgPoint(event) : null;
    const shouldSelectNode = !isOverlayDragging.value && dragStartedOnNodeId;
    releaseOverlayPointer(event);
    overlayDragPointerId = 0;
    isOverlayDragging.value = false;

    if (shouldSelectNode) {
      const hitNode = point ? findNodeAtPoint(point) : null;
      options.onFocusNode(hitNode?.id || dragStartedOnNodeId);
    }
    dragStartedOnNodeId = "";
  }

  function findNodeAtPoint(point: { x: number; y: number }) {
    return findGenealogyMiniMapNodeAtPoint(options.miniMapModel.value.nodes, point);
  }

  function releaseOverlayPointer(event?: PointerEvent) {
    if (!event) return;
    const target = event.currentTarget;
    if (
      target instanceof HTMLElement &&
      target.hasPointerCapture?.(event.pointerId)
    ) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function eventToSvgPoint(event: PointerEvent) {
    const svg = options.svgEl.value;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return {
      x: clamp(transformed.x, 0, options.layout.value.width),
      y: clamp(transformed.y, 0, options.layout.value.height),
    };
  }

  onBeforeUnmount(() => stopOverlayDrag());

  return {
    onOverlayPointerDown,
    onOverlayPointerMove,
    stopOverlayDrag,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
