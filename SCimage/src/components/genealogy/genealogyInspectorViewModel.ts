import type { GenealogyNode } from "../../stores/genealogy";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import {
  formatGenealogyGeneration,
  shortGenealogyText,
} from "../../utils/genealogyFormat";
import { formatGenealogyTime } from "../../utils/genealogyGraph";
import { createGenealogyNodeViewModel } from "./genealogyNodeViewModel";

export interface GenealogyInspectorViewModel {
  fallbackPreviewText: string;
  generationLabel: string;
  kicker: string;
  modelLabel: string;
  parentLabel: string;
  previewAltText: string;
  qualityLabel: string;
  sizeLabel: string;
  statusLabel: string;
  title: string;
}

export function createGenealogyInspectorViewModel(
  node: GenealogyNode,
  layoutNode: GenealogyLayoutNode | null,
  parentCount: number,
): GenealogyInspectorViewModel {
  const nodeView = createGenealogyNodeViewModel(layoutNode || fallbackLayoutNode(node), parentCount);
  return {
    fallbackPreviewText: node.type === "pending" ? "预定位置" : "无预览",
    generationLabel: layoutNode ? formatGenealogyGeneration(layoutNode.generation) : "当前节点",
    kicker: `${nodeView.title} · ${formatGenealogyTime(node.updated_at || "")}`,
    modelLabel: node.model ? shortGenealogyText(node.model, 22) : "",
    parentLabel: `${Math.max(parentCount, node.type === "source" ? 0 : 1)} 来源`,
    previewAltText: node.prompt || node.filename || node.id,
    qualityLabel: node.quality || "",
    sizeLabel: node.size || "auto",
    statusLabel: nodeView.statusLabel,
    title: node.prompt || node.filename || node.id,
  };
}

function fallbackLayoutNode(node: GenealogyNode): GenealogyLayoutNode {
  return {
    ...node,
    generation: 0,
    order: 0,
    x: 0,
    y: 0,
  };
}
