import { defineStore } from "pinia";

export type GenealogyViewMode = "overview" | "tree";
export type GenealogyNodeType = "generated" | "source";

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
  preview_url: string;
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
}

export const useGenealogyStore = defineStore("genealogy", {
  state: () => ({
    viewMode: "overview" as GenealogyViewMode,
    query: "",
    activeRootId: "",
    selectedNodeId: "",
    families: [] as GenealogyFamily[],
    nodes: [] as GenealogyNode[],
    edges: [] as GenealogyEdge[],
    loading: false,
    error: "",
  }),
  getters: {
    activeFamily: (state) => state.families.find((family) => family.root_id === state.activeRootId) || null,
    selectedNode: (state) => state.nodes.find((node) => node.id === state.selectedNodeId) || null,
  },
  actions: {
    replaceGraph(payload: GenealogyGraphPayload) {
      this.families = Array.isArray(payload.families) ? payload.families : [];
      this.nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      this.edges = Array.isArray(payload.edges) ? payload.edges : [];
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
  },
});
