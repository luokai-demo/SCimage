import type { GenealogyEdge, GenealogyNode, GenealogyNodePosition } from "../stores/genealogy";
import { genealogyEdgeAnchors } from "./genealogyWire";
export { filterGenealogyFamilies } from "./genealogyFamilies";
export { formatGenealogyTime } from "./genealogyTime";
export {
  genealogyEdgeIntersectsBounds,
  isGenealogyNodeInsideBounds,
  type GenealogyViewportBounds,
} from "./genealogyViewport";

export interface GenealogyLayoutNode extends GenealogyNode {
  generation: number;
  order: number;
  x: number;
  y: number;
}

export interface GenealogyLayoutEdge extends GenealogyEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface GenealogyLayout {
  nodes: GenealogyLayoutNode[];
  edges: GenealogyLayoutEdge[];
  generationCount: number;
  width: number;
  height: number;
}

interface GenealogyLayoutCacheEntry {
  key: string;
  layout: GenealogyLayout;
}

export const GENEALOGY_CARD_WIDTH = 168;
export const GENEALOGY_CARD_HEIGHT = 208;
const ROOT_X = 48;
const ROOT_Y = 92;
const BRANCH_X_GAP = 108;
const GENERATION_Y_GAP = 40;
const CANVAS_PADDING = 72;
const FREE_CANVAS_TRAILING_SPACE = 520;
const LAYOUT_CACHE_LIMIT = 12;
const layoutCache = new Map<string, GenealogyLayoutCacheEntry>();

export function buildGenealogyLayout(
  rootId: string,
  nodes: GenealogyNode[],
  edges: GenealogyEdge[],
  positions: Record<string, GenealogyNodePosition> = {},
): GenealogyLayout {
  const cacheKey = genealogyLayoutCacheKey(rootId, nodes, edges, positions);
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    layoutCache.delete(cacheKey);
    layoutCache.set(cacheKey, cached);
    return cached.layout;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenById = buildChildrenMap(nodeById, edges);
  const depths = computeDepths(rootId, childrenById);
  const layoutNodes = placeNodesOnFreeCanvas(nodeById, depths, positions);
  const layoutNodeById = new Map(layoutNodes.map((node) => [node.id, node]));
  const layoutEdges = buildLayoutEdges(edges, layoutNodeById);
  const maxGeneration = Math.max(0, ...layoutNodes.map((node) => node.generation));
  const maxRight = Math.max(...layoutNodes.map((node) => node.x + GENEALOGY_CARD_WIDTH), ROOT_X + GENEALOGY_CARD_WIDTH);
  const maxBottom = Math.max(...layoutNodes.map((node) => node.y + GENEALOGY_CARD_HEIGHT), ROOT_Y + GENEALOGY_CARD_HEIGHT);

  const layout = {
    nodes: layoutNodes,
    edges: layoutEdges,
    generationCount: maxGeneration + 1,
    width: maxRight + CANVAS_PADDING + FREE_CANVAS_TRAILING_SPACE,
    height: maxBottom + CANVAS_PADDING + FREE_CANVAS_TRAILING_SPACE,
  };
  rememberGenealogyLayout(cacheKey, layout);
  return layout;
}

export function clearGenealogyLayoutCache() {
  layoutCache.clear();
}

function rememberGenealogyLayout(key: string, layout: GenealogyLayout) {
  layoutCache.set(key, { key, layout });
  while (layoutCache.size > LAYOUT_CACHE_LIMIT) {
    const oldestKey = layoutCache.keys().next().value;
    if (!oldestKey) break;
    layoutCache.delete(oldestKey);
  }
}

function genealogyLayoutCacheKey(
  rootId: string,
  nodes: GenealogyNode[],
  edges: GenealogyEdge[],
  positions: Record<string, GenealogyNodePosition>,
) {
  const nodeParts = nodes.map((node) => [
    node.id,
    node.type,
    node.job_id,
    node.slot,
    node.updated_at,
    node.pending_job_id,
    node.pending_slot,
  ].join(":"));
  const edgeParts = edges.map((edge) => `${edge.from}>${edge.to}:${edge.job_id}`);
  const positionParts = Object.entries(positions)
    .map(([nodeId, position]) => `${nodeId}:${Math.round(Number(position?.x || 0))},${Math.round(Number(position?.y || 0))}`)
    .sort();
  return JSON.stringify([rootId, nodeParts, edgeParts, positionParts]);
}

function buildChildrenMap(
  nodeById: Map<string, GenealogyNode>,
  edges: GenealogyEdge[],
) {
  const childrenById = new Map<string, GenealogyNode[]>();
  edges.forEach((edge) => {
    const parent = nodeById.get(edge.from);
    const child = nodeById.get(edge.to);
    if (!parent || !child) return;
    const children = childrenById.get(parent.id) || [];
    children.push(child);
    childrenById.set(parent.id, children);
  });
  childrenById.forEach((children) => children.sort(sortGenealogyNodes));
  return childrenById;
}

function computeDepths(
  rootId: string,
  childrenById: Map<string, GenealogyNode[]>,
) {
  const depths = new Map<string, number>();
  const queue = [rootId];
  depths.set(rootId, 0);
  while (queue.length) {
    const current = queue.shift() || "";
    const currentDepth = depths.get(current) || 0;
    (childrenById.get(current) || []).forEach((child) => {
      const nextDepth = currentDepth + 1;
      if (!depths.has(child.id) || nextDepth < (depths.get(child.id) || 0)) {
        depths.set(child.id, nextDepth);
        queue.push(child.id);
      }
    });
  }
  return depths;
}

function placeNodesOnFreeCanvas(
  nodeById: Map<string, GenealogyNode>,
  depths: Map<string, number>,
  positions: Record<string, GenealogyNodePosition>,
) {
  const layoutNodes: GenealogyLayoutNode[] = [];
  const generationGroups = buildGenerationGroups(nodeById, depths);

  generationGroups.forEach((group) => {
    group.nodes.forEach((node, index) => {
      const savedPosition = normalizeSavedPosition(positions[node.id]);
      const initialPosition = savedPosition || initialFreeCanvasPosition(group.generation, index);
      const layoutNode = {
        ...node,
        generation: group.generation,
        order: index,
        x: initialPosition.x,
        y: initialPosition.y,
      };
      layoutNodes.push(layoutNode);
    });
  });
  return layoutNodes;
}

function buildGenerationGroups(
  nodeById: Map<string, GenealogyNode>,
  depths: Map<string, number>,
) {
  const groups = new Map<number, GenealogyNode[]>();
  depths.forEach((generation, nodeId) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    const group = groups.get(generation) || [];
    group.push(node);
    groups.set(generation, group);
  });
  return [...groups.entries()]
    .map(([generation, groupNodes]) => ({
      generation,
      nodes: groupNodes.sort(sortGenealogyNodes),
    }))
    .sort((left, right) => left.generation - right.generation);
}

function initialFreeCanvasPosition(generation: number, index: number) {
  return {
    x: ROOT_X + generation * (GENEALOGY_CARD_WIDTH + BRANCH_X_GAP),
    y: ROOT_Y + index * (GENEALOGY_CARD_HEIGHT + GENERATION_Y_GAP),
  };
}

function buildLayoutEdges(
  edges: GenealogyEdge[],
  layoutNodeById: Map<string, GenealogyLayoutNode>,
) {
  return edges
    .map((edge) => {
      const from = layoutNodeById.get(edge.from);
      const to = layoutNodeById.get(edge.to);
      if (!from || !to) return null;
      return {
        ...edge,
        ...edgeAnchors(from, to),
      };
    })
    .filter(Boolean) as GenealogyLayoutEdge[];
}

function edgeAnchors(from: GenealogyLayoutNode, to: GenealogyLayoutNode) {
  return genealogyEdgeAnchors(from, to, GENEALOGY_CARD_WIDTH);
}

function sortGenealogyNodes(left: GenealogyNode, right: GenealogyNode) {
  const leftSlot = Number(left.pending_slot || 0);
  const rightSlot = Number(right.pending_slot || 0);
  if (left.type === "pending" || right.type === "pending") {
    const leftJob = String(left.pending_job_id || left.job_id || "");
    const rightJob = String(right.pending_job_id || right.job_id || "");
    if (leftJob !== rightJob) return leftJob.localeCompare(rightJob);
    if (leftSlot !== rightSlot) return leftSlot - rightSlot;
  }
  const timeDelta = new Date(left.updated_at || 0).getTime() - new Date(right.updated_at || 0).getTime();
  if (timeDelta) return timeDelta;
  return left.id.localeCompare(right.id);
}

function normalizeSavedPosition(position: unknown) {
  if (!position || typeof position !== "object") return null;
  const candidate = position as { x?: unknown; y?: unknown };
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };
}

export function genealogyImageUrl(node: GenealogyNode | null | undefined) {
  return String(node?.url || node?.preview_url || "");
}

export function genealogyPreviewImageUrl(node: GenealogyNode | null | undefined) {
  return String(node?.preview_url || node?.url || "");
}
