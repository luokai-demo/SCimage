import type { GenealogyLayout, GenealogyLayoutEdge, GenealogyLayoutNode } from "./genealogyGraph";

export interface GenealogyMiniMapModel {
  nodes: GenealogyLayoutNode[];
  edges: GenealogyLayoutEdge[];
  renderedNodeIds: Set<string>;
  totalNodeCount: number;
  totalEdgeCount: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  isSampled: boolean;
}

const MAX_MINIMAP_NODES = 96;
const MAX_MINIMAP_EDGES = 140;
const MAX_BLOODLINE_NODES = 34;

export function buildGenealogyMiniMapModel(
  layout: GenealogyLayout,
  selectedNodeId: string,
  bloodlineNodeIds: Set<string>,
): GenealogyMiniMapModel {
  const importantNodeIds = collectImportantNodeIds(layout.nodes, selectedNodeId, bloodlineNodeIds);
  const nodes = selectMiniMapNodes(layout.nodes, importantNodeIds);
  const renderedNodeIds = new Set(nodes.map((node) => node.id));
  const edges = selectMiniMapEdges(layout.edges, renderedNodeIds, importantNodeIds, bloodlineNodeIds);

  return {
    nodes,
    edges,
    renderedNodeIds,
    totalNodeCount: layout.nodes.length,
    totalEdgeCount: layout.edges.length,
    visibleNodeCount: nodes.length,
    visibleEdgeCount: edges.length,
    isSampled: nodes.length < layout.nodes.length || edges.length < layout.edges.length,
  };
}

function collectImportantNodeIds(
  nodes: GenealogyLayoutNode[],
  selectedNodeId: string,
  bloodlineNodeIds: Set<string>,
) {
  const ids = new Set<string>();
  nodes.forEach((node) => {
    if (node.generation === 0) ids.add(node.id);
  });
  if (selectedNodeId) ids.add(selectedNodeId);

  const bloodlineNodes = nodes.filter((node) => bloodlineNodeIds.has(node.id));
  if (bloodlineNodes.length <= MAX_BLOODLINE_NODES) {
    bloodlineNodes.forEach((node) => ids.add(node.id));
  } else {
    sampleEvenly(bloodlineNodes, MAX_BLOODLINE_NODES).forEach((node) => ids.add(node.id));
  }
  return ids;
}

function selectMiniMapNodes(
  nodes: GenealogyLayoutNode[],
  importantNodeIds: Set<string>,
) {
  if (nodes.length <= MAX_MINIMAP_NODES) return nodes;

  const important = nodes.filter((node) => importantNodeIds.has(node.id));
  const budget = Math.max(0, MAX_MINIMAP_NODES - important.length);
  if (!budget) return sortByPosition(important);

  const remaining = nodes.filter((node) => !importantNodeIds.has(node.id));
  const sampled = sampleByGeneration(remaining, budget);
  return sortByPosition([...important, ...sampled]);
}

function selectMiniMapEdges(
  edges: GenealogyLayoutEdge[],
  renderedNodeIds: Set<string>,
  importantNodeIds: Set<string>,
  bloodlineNodeIds: Set<string>,
) {
  if (edges.length <= MAX_MINIMAP_EDGES) return edges;

  const candidates = edges.filter((edge) => renderedNodeIds.has(edge.from) && renderedNodeIds.has(edge.to));
  if (candidates.length <= MAX_MINIMAP_EDGES) return candidates;

  const pinned = candidates.filter((edge) => (
    (importantNodeIds.has(edge.from) && importantNodeIds.has(edge.to)) ||
    (bloodlineNodeIds.has(edge.from) && bloodlineNodeIds.has(edge.to))
  ));
  const pinnedIds = new Set(pinned.map(edgeKey));
  const budget = Math.max(0, MAX_MINIMAP_EDGES - pinned.length);
  if (!budget) return pinned.slice(0, MAX_MINIMAP_EDGES);

  const sampled = sampleEvenly(
    candidates.filter((edge) => !pinnedIds.has(edgeKey(edge))),
    budget,
  );
  return [...pinned, ...sampled];
}

function sampleByGeneration(nodes: GenealogyLayoutNode[], budget: number) {
  if (nodes.length <= budget) return nodes;
  const groups = new Map<number, GenealogyLayoutNode[]>();
  nodes.forEach((node) => {
    const group = groups.get(node.generation) || [];
    group.push(node);
    groups.set(node.generation, group);
  });

  const sortedGroups = [...groups.values()]
    .map(sortByPosition)
    .sort((left, right) => left[0].generation - right[0].generation);
  const total = sortedGroups.reduce((sum, group) => sum + group.length, 0);
  const sampled: GenealogyLayoutNode[] = [];

  sortedGroups.forEach((group) => {
    const groupBudget = Math.max(1, Math.round((group.length / total) * budget));
    sampled.push(...sampleEvenly(group, groupBudget));
  });

  if (sampled.length <= budget) return sampled;
  return sampleEvenly(sortByPosition(sampled), budget);
}

function sampleEvenly<T>(items: T[], count: number) {
  if (count <= 0) return [];
  if (items.length <= count) return items;
  if (count === 1) return [items[Math.floor(items.length / 2)]];

  const selected: T[] = [];
  const used = new Set<number>();
  const step = (items.length - 1) / (count - 1);
  for (let index = 0; index < count; index += 1) {
    const itemIndex = Math.min(items.length - 1, Math.round(index * step));
    if (used.has(itemIndex)) continue;
    used.add(itemIndex);
    selected.push(items[itemIndex]);
  }
  return selected;
}

function sortByPosition<T extends { generation: number; y: number; x: number; id: string }>(nodes: T[]) {
  return [...nodes].sort((left, right) => {
    if (left.generation !== right.generation) return left.generation - right.generation;
    if (left.y !== right.y) return left.y - right.y;
    if (left.x !== right.x) return left.x - right.x;
    return left.id.localeCompare(right.id);
  });
}

function edgeKey(edge: GenealogyLayoutEdge) {
  return `${edge.from}->${edge.to}`;
}
