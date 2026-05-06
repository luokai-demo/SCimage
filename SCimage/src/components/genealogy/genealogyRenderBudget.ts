import type { GenealogyLayout } from "../../utils/genealogyGraph";

export type GenealogyRenderBudgetLevel = "normal" | "dense" | "huge";

export interface GenealogyRenderBudget {
  canvasClass: Record<string, boolean>;
  imageLoadingMode: "lazy";
  imageSourceMode: "full" | "preview";
  level: GenealogyRenderBudgetLevel;
  renderEdgeOrigins: boolean;
  renderEdgeTracks: boolean;
}

export function createGenealogyRenderBudget(layout: GenealogyLayout): GenealogyRenderBudget {
  const nodeCount = layout.nodes.length;
  const edgeCount = layout.edges.length;
  const level = resolveBudgetLevel(nodeCount, edgeCount);
  return {
    canvasClass: {
      "is-dense-graph": level !== "normal",
      "is-huge-graph": level === "huge",
    },
    imageLoadingMode: "lazy",
    imageSourceMode: level === "huge" ? "preview" : "full",
    level,
    renderEdgeOrigins: level !== "huge",
    renderEdgeTracks: level !== "huge",
  };
}

function resolveBudgetLevel(nodeCount: number, edgeCount: number): GenealogyRenderBudgetLevel {
  if (nodeCount > 140 || edgeCount > 190) return "huge";
  if (nodeCount > 72 || edgeCount > 110) return "dense";
  return "normal";
}
