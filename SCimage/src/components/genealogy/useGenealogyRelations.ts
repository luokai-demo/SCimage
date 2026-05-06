import { computed, type ComputedRef } from "vue";
import {
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  type GenealogyLayout,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";

type Direction = "left" | "right" | "up" | "down";

interface UseGenealogyRelationsOptions {
  layout: ComputedRef<GenealogyLayout>;
  selectedNodeId: ComputedRef<string>;
}

export function useGenealogyRelations(options: UseGenealogyRelationsOptions) {
  const layoutNodeById = computed(() => new Map(options.layout.value.nodes.map((node) => [node.id, node])));
  const incomingEdgeCounts = computed(() => {
    const counts = new Map<string, number>();
    options.layout.value.edges.forEach((edge) => counts.set(edge.to, (counts.get(edge.to) || 0) + 1));
    return counts;
  });
  const childrenById = computed(() => buildRelationMap("children", options.layout.value, layoutNodeById.value));
  const parentsById = computed(() => buildRelationMap("parents", options.layout.value, layoutNodeById.value));
  const selectedRelatedNodeIds = computed(() => {
    const selectedId = options.selectedNodeId.value;
    if (!selectedId) return new Set<string>();
    const relatedIds = new Set<string>();
    (childrenById.value.get(selectedId) || []).forEach((node) => relatedIds.add(node.id));
    (parentsById.value.get(selectedId) || []).forEach((node) => relatedIds.add(node.id));
    return relatedIds;
  });
  const bloodlineNodeIds = computed(() => {
    const selectedId = options.selectedNodeId.value;
    const ids = new Set<string>();
    if (!selectedId) return ids;
    ids.add(selectedId);
    collectRelations(selectedId, parentsById.value, ids);
    collectRelations(selectedId, childrenById.value, ids);
    return ids;
  });

  function parentCount(nodeId: string) {
    return incomingEdgeCounts.value.get(nodeId) || 0;
  }

  function isRelatedNode(nodeId: string) {
    return selectedRelatedNodeIds.value.has(nodeId);
  }

  function isBloodlineEdge(edge: { from: string; to: string }) {
    return bloodlineNodeIds.value.has(edge.from) && bloodlineNodeIds.value.has(edge.to);
  }

  function keyboardTargetNodeId(key: string, nodeId: string) {
    const current = layoutNodeById.value.get(nodeId);
    if (!current) return "";
    if (key === "ArrowRight") return closestInDirection(childrenById.value.get(nodeId) || [], current, "right")?.id || "";
    if (key === "ArrowLeft") return closestInDirection(parentsById.value.get(nodeId) || [], current, "left")?.id || "";
    if (key === "ArrowUp") return closestInDirection(options.layout.value.nodes, current, "up")?.id || "";
    if (key === "ArrowDown") return closestInDirection(options.layout.value.nodes, current, "down")?.id || "";
    return "";
  }

  return {
    bloodlineNodeIds,
    childrenById,
    isBloodlineEdge,
    isRelatedNode,
    keyboardTargetNodeId,
    layoutNodeById,
    parentCount,
    parentsById,
    selectedRelatedNodeIds,
  };
}

function buildRelationMap(
  mode: "children" | "parents",
  layout: GenealogyLayout,
  layoutNodeById: Map<string, GenealogyLayoutNode>,
) {
  const groups = new Map<string, GenealogyLayoutNode[]>();
  layout.edges.forEach((edge) => {
    const sourceId = mode === "children" ? edge.from : edge.to;
    const targetId = mode === "children" ? edge.to : edge.from;
    const target = layoutNodeById.get(targetId);
    if (!target) return;
    const group = groups.get(sourceId) || [];
    group.push(target);
    groups.set(sourceId, group);
  });
  groups.forEach((group) => group.sort(sortNodesByPosition));
  return groups;
}

function sortNodesByPosition(left: GenealogyLayoutNode, right: GenealogyLayoutNode) {
  if (left.y !== right.y) return left.y - right.y;
  if (left.x !== right.x) return left.x - right.x;
  return left.id.localeCompare(right.id);
}

function collectRelations(
  nodeId: string,
  relationMap: Map<string, GenealogyLayoutNode[]>,
  target: Set<string>,
) {
  const pending = [...(relationMap.get(nodeId) || [])];
  while (pending.length) {
    const node = pending.shift();
    if (!node || target.has(node.id)) continue;
    target.add(node.id);
    pending.push(...(relationMap.get(node.id) || []));
  }
}

function closestInDirection(
  nodes: GenealogyLayoutNode[],
  current: GenealogyLayoutNode,
  direction: Direction,
) {
  const currentCenter = nodeCenter(current);
  const candidates = nodes
    .filter((node) => node.id !== current.id)
    .map((node) => ({ node, center: nodeCenter(node) }))
    .filter((item) => {
      if (direction === "left") return item.center.x < currentCenter.x;
      if (direction === "right") return item.center.x > currentCenter.x;
      if (direction === "up") return item.center.y < currentCenter.y;
      return item.center.y > currentCenter.y;
    });
  return candidates
    .sort((left, right) => directionalDistance(left.center, currentCenter, direction) - directionalDistance(right.center, currentCenter, direction))[0]?.node || null;
}

function nodeCenter(node: GenealogyLayoutNode) {
  return {
    x: node.x + GENEALOGY_CARD_WIDTH / 2,
    y: node.y + GENEALOGY_CARD_HEIGHT / 2,
  };
}

function directionalDistance(
  point: { x: number; y: number },
  current: { x: number; y: number },
  direction: Direction,
) {
  const primary = direction === "left" || direction === "right"
    ? Math.abs(point.x - current.x)
    : Math.abs(point.y - current.y);
  const cross = direction === "left" || direction === "right"
    ? Math.abs(point.y - current.y)
    : Math.abs(point.x - current.x);
  return primary + cross * 1.8;
}
