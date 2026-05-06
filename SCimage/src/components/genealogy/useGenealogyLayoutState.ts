import { computed, onBeforeUnmount, type ComputedRef, type Ref } from "vue";
import {
  genealogyEdgeIntersectsBounds,
  isGenealogyNodeInsideBounds,
  type GenealogyLayout,
  type GenealogyLayoutEdge,
} from "../../utils/genealogyGraph";
import { createGenealogyEdgeViewCache } from "./genealogyEdgeViewCache";
import type { GenealogyViewportRect } from "./useGenealogyViewportState";

interface UseGenealogyLayoutStateOptions {
  layout: ComputedRef<GenealogyLayout> | (() => GenealogyLayout);
  viewportState: Readonly<Ref<GenealogyViewportRect>>;
  selectedNodeId: ComputedRef<string> | (() => string);
  draggingNodeId: ComputedRef<string> | (() => string);
  bloodlineNodeIds: ComputedRef<Set<string>> | (() => Set<string>);
}

interface GenealogyCullingRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface GenealogyEdgeView extends GenealogyLayoutEdge {
  key: string;
  path: string;
  active: boolean;
  bloodline: boolean;
  dimmed: boolean;
}

export function useGenealogyLayoutState(options: UseGenealogyLayoutStateOptions) {
  const edgeViewCache = createGenealogyEdgeViewCache();
  const layoutValue = () => resolveReactiveValue(options.layout);
  const selectedNodeIdValue = () => resolveReactiveValue(options.selectedNodeId);
  const draggingNodeIdValue = () => resolveReactiveValue(options.draggingNodeId);
  const bloodlineNodeIdsValue = () => resolveReactiveValue(options.bloodlineNodeIds);
  const viewportCullingRect = computed(() => {
    const viewport = options.viewportState.value;
    if (!viewport.width || !viewport.height) return null;
    const buffer = 560;
    return {
      left: viewport.left - buffer,
      right: viewport.left + viewport.width + buffer,
      top: viewport.top - buffer,
      bottom: viewport.top + viewport.height + buffer,
    };
  });
  const visibleNodes = computed(() => {
    const nodes = layoutValue().nodes;
    const bounds = viewportCullingRect.value;
    if (!bounds) return nodes;
    const draggingNodeId = draggingNodeIdValue();
    const selectedNodeId = selectedNodeIdValue();
    return nodes.filter((node) => (
      node.id === draggingNodeId ||
      node.id === selectedNodeId ||
      isGenealogyNodeInsideBounds(node, bounds)
    ));
  });
  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((node) => node.id)));
  const visibleAdjacentNodeIds = computed(() => {
    const ids = new Set(visibleNodeIds.value);
    layoutValue().edges.forEach((edge) => {
      if (visibleNodeIds.value.has(edge.from)) ids.add(edge.to);
      if (visibleNodeIds.value.has(edge.to)) ids.add(edge.from);
    });
    return ids;
  });
  const visibleEdgeViews = computed(() => {
    const bounds = viewportCullingRect.value;
    return layoutValue().edges
      .filter((edge) => isVisibleEdge(edge, bounds))
      .map((edge) => {
        const active = isEdgeActive(edge);
        const bloodline = isBloodlineEdge(edge);
        const pathView = edgeViewCache.getEdgePath(edge);
        return {
          ...edge,
          key: pathView.key,
          path: pathView.path,
          active,
          bloodline,
          dimmed: isDimmedEdge(edge, active, bloodline),
        };
      });
  });
  const canvasStyle = computed(() => ({
    width: `${layoutValue().width}px`,
    height: `${layoutValue().height}px`,
  }));

  function isEdgeActive(edge: Pick<GenealogyLayoutEdge, "from" | "to">) {
    const selectedId = selectedNodeIdValue();
    return Boolean(selectedId && (edge.from === selectedId || edge.to === selectedId));
  }

  function isBloodlineEdge(edge: Pick<GenealogyLayoutEdge, "from" | "to">) {
    const ids = bloodlineNodeIdsValue();
    return ids.has(edge.from) && ids.has(edge.to);
  }

  function isDimmedNode(nodeId: string) {
    const selectedId = selectedNodeIdValue();
    const bloodlineIds = bloodlineNodeIdsValue();
    return Boolean(selectedId && bloodlineIds.size > 1 && !bloodlineIds.has(nodeId));
  }

  function isDimmedEdge(
    edge: Pick<GenealogyLayoutEdge, "from" | "to">,
    active = isEdgeActive(edge),
    bloodline = isBloodlineEdge(edge),
  ) {
    return Boolean(selectedNodeIdValue() && bloodlineNodeIdsValue().size > 1 && !bloodline && !active);
  }

  function isVisibleEdge(edge: GenealogyLayoutEdge, bounds: GenealogyCullingRect | null) {
    if (!bounds) return true;
    const selectedId = selectedNodeIdValue();
    const draggingNodeId = draggingNodeIdValue();
    if (edge.from === draggingNodeId || edge.to === draggingNodeId) return true;
    if (visibleNodeIds.value.has(edge.from) && visibleNodeIds.value.has(edge.to)) return true;
    if (!visibleAdjacentNodeIds.value.has(edge.from) && !visibleAdjacentNodeIds.value.has(edge.to)) return false;
    if (!genealogyEdgeIntersectsBounds(edge, bounds)) return false;
    if (selectedId && !isEdgeActive(edge) && !visibleNodeIds.value.has(edge.from) && !visibleNodeIds.value.has(edge.to)) return false;
    return true;
  }

  onBeforeUnmount(edgeViewCache.clear);

  return {
    canvasStyle,
    isDimmedNode,
    visibleEdgeViews,
    visibleNodes,
  };
}

function resolveReactiveValue<T>(source: ComputedRef<T> | (() => T)) {
  return typeof source === "function" ? source() : source.value;
}
