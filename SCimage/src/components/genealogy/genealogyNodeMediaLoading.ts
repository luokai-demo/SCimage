import { jobStatusMeta } from "../../utils/jobStatus";
import {
  genealogyImageUrl,
  genealogyPreviewImageUrl,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import type { GenealogyRenderBudget } from "./genealogyRenderBudget";

export interface GenealogyNodeMediaLoadState {
  imageUrl: string;
  loadingMode: "eager" | "lazy";
  placeholderText: string;
}

interface GenealogyNodeMediaLoadOptions {
  bloodline: boolean;
  dragging: boolean;
  node: GenealogyLayoutNode;
  related: boolean;
  renderBudget: GenealogyRenderBudget;
  selected: boolean;
}

export function createGenealogyNodeMediaLoadState(options: GenealogyNodeMediaLoadOptions): GenealogyNodeMediaLoadState {
  const priority = options.selected || options.dragging || options.related || options.bloodline || options.node.type === "pending";
  const imageUrl = resolveNodeImageUrl(options.node, options.renderBudget);
  return {
    imageUrl,
    loadingMode: priority ? "eager" : "lazy",
    placeholderText: imageUrl ? "" : `${jobStatusMeta(options.node.status).label} · 无预览`,
  };
}

function resolveNodeImageUrl(node: GenealogyLayoutNode, renderBudget: GenealogyRenderBudget) {
  return renderBudget.imageSourceMode === "preview"
    ? genealogyPreviewImageUrl(node)
    : genealogyImageUrl(node);
}
