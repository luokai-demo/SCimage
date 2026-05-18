import { defineStore } from "pinia";

export type GenealogyViewMode = "overview" | "tree";
export type GenealogyNodeType = "generated" | "source" | "pending";

export interface GenealogyFamily {
  root_id: string;
  title: string;
  prompt: string;
  cover_url: string;
  image_count: number;
  node_count: number;
  generation_count: number;
  latest_updated_at: string;
  has_multi_source: boolean;
  root_type: GenealogyNodeType;
}

export interface GenealogyNode {
  id: string;
  type: GenealogyNodeType;
  job_id: string;
  slot: number;
  url: string;
  filename: string;
  prompt: string;
  workflow: string;
  status: string;
  model: string;
  compat_profile_id: string;
  output_profile_id: string;
  quality: string;
  size: string;
  created_at: string;
  updated_at: string;
  pending_job_id?: string;
  pending_slot?: number;
}

export interface GenealogyNodePosition {
  x: number;
  y: number;
}

export interface GenealogyEdge {
  from: string;
  to: string;
  job_id: string;
}

export interface GenealogyGraphPayload {
  families: GenealogyFamily[];
  nodes: GenealogyNode[];
  edges: GenealogyEdge[];
  positions?: GenealogyPositionMap;
}

export type GenealogyPositionMap = Record<string, GenealogyNodePosition>;

export const useGenealogyStore = defineStore("genealogy", {
  state: () => ({
    viewMode: "overview" as GenealogyViewMode,
    query: "",
    activeRootId: "",
    selectedNodeId: "",
    families: [] as GenealogyFamily[],
    nodes: [] as GenealogyNode[],
    edges: [] as GenealogyEdge[],
    positions: {} as GenealogyPositionMap,
    loading: false,
    error: "",
  }),
  getters: {
    activeFamily: (state) => state.families.find((family) => family.root_id === state.activeRootId) || null,
    selectedNode: (state) => state.nodes.find((node) => node.id === state.selectedNodeId) || null,
    activePositions: (state) => state.positions,
  },
  actions: {
    replaceGraph(payload: GenealogyGraphPayload) {
      this.families = Array.isArray(payload.families) ? payload.families : [];
      this.nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      this.edges = Array.isArray(payload.edges) ? payload.edges : [];
      this.positions = mergeLocalPositions(
        normalizePositionMap(payload.positions),
        this.positions,
        new Set(this.nodes.map((node) => node.id)),
      );
      if (this.activeRootId && !this.families.some((family) => family.root_id === this.activeRootId)) {
        this.activeRootId = "";
      }
      if (this.selectedNodeId && !this.nodes.some((node) => node.id === this.selectedNodeId)) {
        this.selectedNodeId = "";
      }
      if (!this.activeRootId && this.families.length) {
        this.activeRootId = this.families[0].root_id;
      }
      if (!this.selectedNodeId && this.activeRootId) {
        this.selectedNodeId = this.activeRootId;
      }
    },
    setViewMode(viewMode: GenealogyViewMode) {
      this.viewMode = viewMode;
    },
    setQuery(query: string) {
      this.query = query;
    },
    setActiveRoot(rootId: string) {
      this.activeRootId = rootId;
      this.selectedNodeId = rootId;
      this.viewMode = "tree";
    },
    setSelectedNode(nodeId: string) {
      this.selectedNodeId = nodeId;
    },
    updateNodePosition(nodeId: string, position: GenealogyNodePosition) {
      if (!nodeId) return;
      this.positions = {
        ...this.positions,
        [nodeId]: normalizePosition(position),
      };
    },
  },
});

function normalizePositionMap(value: unknown): GenealogyPositionMap {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const map: GenealogyPositionMap = {};
  Object.entries(source).forEach(([nodeId, position]) => {
    const normalized = normalizeOptionalPosition(position);
    if (!normalized || !nodeId) return;
    map[nodeId] = normalized;
  });
  return map;
}

function normalizePosition(value: unknown): GenealogyNodePosition {
  return normalizeOptionalPosition(value) || { x: 0, y: 0 };
}

function mergeLocalPositions(
  serverPositions: GenealogyPositionMap,
  localPositions: GenealogyPositionMap,
  nodeIds: Set<string>,
) {
  const merged: GenealogyPositionMap = { ...serverPositions };
  Object.entries(localPositions).forEach(([nodeId, position]) => {
    if (!nodeIds.has(nodeId)) return;
    merged[nodeId] = position;
  });
  return merged;
}

function normalizeOptionalPosition(value: unknown): GenealogyNodePosition | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { x?: unknown; y?: unknown };
  const x = Number(candidate?.x);
  const y = Number(candidate?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };
}
