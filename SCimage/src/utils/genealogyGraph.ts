import type { GenealogyEdge, GenealogyFamily, GenealogyNode } from "../stores/genealogy";

export interface GenealogyLayoutNode extends GenealogyNode {
  generation: number;
  row: number;
  x: number;
  y: number;
}

export interface GenealogyLayoutEdge extends GenealogyEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface GenealogyLayoutColumn {
  generation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
}

export interface GenealogyLayout {
  nodes: GenealogyLayoutNode[];
  edges: GenealogyLayoutEdge[];
  columns: GenealogyLayoutColumn[];
  generationCount: number;
  width: number;
  height: number;
}

export const GENEALOGY_CARD_WIDTH = 168;
export const GENEALOGY_CARD_HEIGHT = 208;
const COLUMN_GAP = 78;
const ROW_GAP = 18;
const PADDING_X = 18;
const PADDING_TOP = 58;
const PADDING_BOTTOM = 18;

export function filterGenealogyFamilies(
  families: GenealogyFamily[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return families
    .filter((family) => {
      if (!normalizedQuery) return true;
      return [
        family.title,
        family.prompt,
        family.root_id,
        family.latest_updated_at,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => new Date(right.latest_updated_at || 0).getTime() - new Date(left.latest_updated_at || 0).getTime());
}

export function buildGenealogyLayout(
  rootId: string,
  nodes: GenealogyNode[],
  edges: GenealogyEdge[],
): GenealogyLayout {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenById = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
    const children = childrenById.get(edge.from) || [];
    children.push(edge.to);
    childrenById.set(edge.from, children);
  });

  const depths = new Map<string, number>();
  const queue = [rootId];
  depths.set(rootId, 0);
  while (queue.length) {
    const current = queue.shift() || "";
    const currentDepth = depths.get(current) || 0;
    (childrenById.get(current) || []).forEach((childId) => {
      const nextDepth = currentDepth + 1;
      if (!depths.has(childId) || nextDepth < (depths.get(childId) || 0)) {
        depths.set(childId, nextDepth);
        queue.push(childId);
      }
    });
  }

  const generationGroups = new Map<number, GenealogyNode[]>();
  depths.forEach((generation, nodeId) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    const group = generationGroups.get(generation) || [];
    group.push(node);
    generationGroups.set(generation, group);
  });

  generationGroups.forEach((group) => {
    group.sort((left, right) => {
      const timeDelta = new Date(left.updated_at || 0).getTime() - new Date(right.updated_at || 0).getTime();
      if (timeDelta) return timeDelta;
      return left.id.localeCompare(right.id);
    });
  });

  const layoutNodes: GenealogyLayoutNode[] = [];
  generationGroups.forEach((group, generation) => {
    group.forEach((node, row) => {
      layoutNodes.push({
        ...node,
        generation,
        row,
        x: PADDING_X + generation * (GENEALOGY_CARD_WIDTH + COLUMN_GAP),
        y: PADDING_TOP + row * (GENEALOGY_CARD_HEIGHT + ROW_GAP),
      });
    });
  });

  const layoutNodeById = new Map(layoutNodes.map((node) => [node.id, node]));
  const layoutEdges = edges
    .map((edge) => {
      const from = layoutNodeById.get(edge.from);
      const to = layoutNodeById.get(edge.to);
      if (!from || !to) return null;
      return {
        ...edge,
        fromX: from.x + GENEALOGY_CARD_WIDTH,
        fromY: from.y + GENEALOGY_CARD_HEIGHT * 0.46,
        toX: to.x,
        toY: to.y + GENEALOGY_CARD_HEIGHT * 0.46,
      };
    })
    .filter(Boolean) as GenealogyLayoutEdge[];

  const maxGeneration = Math.max(0, ...layoutNodes.map((node) => node.generation));
  const maxRows = Math.max(1, ...[...generationGroups.values()].map((group) => group.length));
  const height = PADDING_TOP + PADDING_BOTTOM + maxRows * GENEALOGY_CARD_HEIGHT + (maxRows - 1) * ROW_GAP;
  const columns: GenealogyLayoutColumn[] = Array.from({ length: maxGeneration + 1 }, (_, generation) => ({
    generation,
    x: PADDING_X + generation * (GENEALOGY_CARD_WIDTH + COLUMN_GAP),
    y: 14,
    width: GENEALOGY_CARD_WIDTH,
    height: Math.max(0, height - 28),
    count: generationGroups.get(generation)?.length || 0,
  }));
  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    columns,
    generationCount: maxGeneration + 1,
    width: PADDING_X * 2 + (maxGeneration + 1) * GENEALOGY_CARD_WIDTH + maxGeneration * COLUMN_GAP,
    height,
  };
}

export function genealogyImageUrl(node: GenealogyNode | null | undefined) {
  return String(node?.url || node?.preview_url || "");
}

export function genealogyPreviewImageUrl(node: GenealogyNode | null | undefined) {
  return String(node?.preview_url || node?.url || "");
}

export function formatGenealogyTime(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
