import type { GenealogyNode } from "../../stores/genealogy";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import {
  formatGenealogyGeneration,
  formatGenealogyNodeStatus,
  shortGenealogyText,
} from "../../utils/genealogyFormat";

export interface GenealogyNodeViewModel {
  altText: string;
  badgeText: string;
  canDrag: boolean;
  compactTitle: string;
  mediaLabel: string;
  modelLabel: string;
  pending: boolean;
  qualityLabel: string;
  sourceCountText: string;
  statusLabel: string;
  subtitle: string;
  timeLabel: string;
  title: string;
  workflowLabel: string;
}

export function createGenealogyNodeViewModel(
  node: GenealogyLayoutNode,
  parentCount: number,
): GenealogyNodeViewModel {
  return {
    altText: node.prompt || node.filename,
    badgeText: genealogyNodeBadgeText(node),
    canDrag: canDragGenealogyNode(node),
    compactTitle: shortGenealogyText(node.prompt || node.filename || node.id, 34),
    mediaLabel: node.type === "source" ? "外部参考图" : node.size || "auto",
    modelLabel: node.model ? shortGenealogyText(node.model, 18) : "",
    pending: node.type === "pending",
    qualityLabel: node.quality || "auto",
    sourceCountText: String(Math.max(parentCount, node.type === "source" ? 0 : 1)),
    statusLabel: formatGenealogyNodeStatus(node.status),
    subtitle: genealogyNodeSubtitle(node),
    timeLabel: compactGenealogyNodeTime(node.updated_at),
    title: node.type === "source" ? "Load Image" : "Image to Image",
    workflowLabel: genealogyNodeWorkflowLabel(node),
  };
}

export function canDragGenealogyNode(node: Pick<GenealogyNode, "type" | "job_id" | "slot">) {
  return Boolean(node.type === "generated" && node.job_id && Number(node.slot || 0) > 0);
}

export function compactGenealogyNodeTime(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function genealogyNodeWorkflowLabel(node: GenealogyNode) {
  if (node.type === "source") return "来源";
  if (node.type === "pending") return "预定";
  return node.workflow === "image-to-image" ? "图生图" : "文生图";
}

function genealogyNodeSubtitle(node: GenealogyLayoutNode) {
  if (node.type === "source") return "source";
  if (node.type === "pending") return "reserved";
  return formatGenealogyGeneration(node.generation);
}

function genealogyNodeBadgeText(node: GenealogyLayoutNode) {
  if (node.type === "source") return "根图";
  if (node.type === "pending") return node.status === "queued" ? "排队中" : "生成中";
  return formatGenealogyGeneration(node.generation);
}
