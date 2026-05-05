import type { JobSummary } from "../stores/jobs";
import type { GenealogyEdge, GenealogyNode, GenealogyNodePosition } from "../stores/genealogy";
import { isActiveJobStatus } from "./jobStatus";
import {
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  type GenealogyLayout,
} from "./genealogyGraph";

export interface GenealogyPendingProjection {
  nodes: GenealogyNode[];
  edges: GenealogyEdge[];
  positions: Record<string, GenealogyNodePosition>;
}

const PENDING_BRANCH_X_GAP = 108;
const PENDING_BRANCH_Y_GAP = 36;

export function projectPendingGenealogyJobs(
  jobs: JobSummary[],
  graphNodes: GenealogyNode[],
  graphEdges: GenealogyEdge[],
  layout: GenealogyLayout,
): GenealogyPendingProjection {
  const graphNodeIds = new Set(graphNodes.map((node) => node.id));
  const layoutNodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const existingPendingPositions = new Map<string, GenealogyNodePosition>();
  const occupiedPositions = new Map<string, GenealogyNodePosition>();
  layout.nodes.forEach((node) => {
    if (node.type === "pending") {
      existingPendingPositions.set(node.id, { x: node.x, y: node.y });
      return;
    }
    occupiedPositions.set(node.id, { x: node.x, y: node.y });
  });

  const projectedNodes: GenealogyNode[] = [];
  const projectedEdges: GenealogyEdge[] = [];
  const projectedPositions: Record<string, GenealogyNodePosition> = {};

  activeImageToImageJobs(jobs).forEach((job) => {
    const jobId = String(job.id || "").trim();
    if (!jobId) return;
    const pendingCount = Math.max(1, Number(job.count || 1) || 1);
    const sourceNodeIds = sourceIdsForJob(job).filter((sourceId) => graphNodeIds.has(sourceId));
    if (!sourceNodeIds.length) return;

    const baseAnchor = pendingAnchorForSources(sourceNodeIds, layoutNodeById);
    for (let slot = 1; slot <= pendingCount; slot += 1) {
      const nodeId = pendingNodeId(jobId, slot);
      if (graphNodeIds.has(`${jobId}:${slot}`)) continue;
      const previousPosition = existingPendingPositions.get(nodeId);
      const position = previousPosition || nextOpenPendingPosition({
        x: baseAnchor.x,
        y: baseAnchor.y + (slot - 1) * (GENEALOGY_CARD_HEIGHT + PENDING_BRANCH_Y_GAP),
      }, occupiedPositions);
      occupiedPositions.set(nodeId, position);
      projectedPositions[nodeId] = position;
      projectedNodes.push(buildPendingNode(job, nodeId, slot));
      sourceNodeIds.forEach((sourceId) => {
        projectedEdges.push({ from: sourceId, to: nodeId, job_id: jobId });
      });
    }
  });

  return {
    nodes: projectedNodes,
    edges: projectedEdges,
    positions: projectedPositions,
  };
}

function nextOpenPendingPosition(
  preferred: GenealogyNodePosition,
  occupiedPositions: Map<string, GenealogyNodePosition>,
) {
  const position = { ...preferred };
  while ([...occupiedPositions.values()].some((occupied) => nodesOverlap(position, occupied))) {
    position.y += GENEALOGY_CARD_HEIGHT + PENDING_BRANCH_Y_GAP;
  }
  return position;
}

function nodesOverlap(left: GenealogyNodePosition, right: GenealogyNodePosition) {
  const horizontalGap = Math.abs(left.x - right.x);
  const verticalGap = Math.abs(left.y - right.y);
  return horizontalGap < GENEALOGY_CARD_WIDTH + 18 && verticalGap < GENEALOGY_CARD_HEIGHT + 18;
}

function activeImageToImageJobs(jobs: JobSummary[]) {
  return jobs.filter((job) => (
    String(job.workflow || "") === "image-to-image" &&
    isActiveJobStatus(job.status)
  ));
}

function sourceIdsForJob(job: JobSummary) {
  return (Array.isArray(job.source_images) ? job.source_images : [])
    .map((source) => sourceIdFromPayload(source, job))
    .filter(Boolean);
}

function sourceIdFromPayload(source: unknown, job: JobSummary) {
  if (!source || typeof source !== "object") return "";
  const payload = source as Record<string, unknown>;
  const origin = payload.origin && typeof payload.origin === "object"
    ? payload.origin as Record<string, unknown>
    : {};
  const originJobId = String(origin.job_id || origin.origin_job_id || "").trim();
  const originSlot = toPositiveInt(origin.slot || origin.origin_slot, 0);
  if (originJobId && originSlot) return `${originJobId}:${originSlot}`;

  const jobId = String(job.id || "").trim();
  const sourceSlot = toPositiveInt(payload.slot, 0);
  if (!jobId || !sourceSlot) return "";
  return `source:${jobId}:${sourceSlot}`;
}

function pendingAnchorForSources(
  sourceNodeIds: string[],
  layoutNodeById: Map<string, { x: number; y: number }>,
) {
  const sourceNodes = sourceNodeIds
    .map((sourceId) => layoutNodeById.get(sourceId))
    .filter(Boolean) as Array<{ x: number; y: number }>;
  if (!sourceNodes.length) return { x: 48, y: 92 };
  const maxRight = Math.max(...sourceNodes.map((node) => node.x + GENEALOGY_CARD_WIDTH));
  const centerY = sourceNodes.reduce((sum, node) => sum + node.y + GENEALOGY_CARD_HEIGHT / 2, 0) / sourceNodes.length;
  return {
    x: Math.max(0, Math.round(maxRight + PENDING_BRANCH_X_GAP)),
    y: Math.max(0, Math.round(centerY - GENEALOGY_CARD_HEIGHT / 2)),
  };
}

function pendingNodeId(jobId: string, slot: number) {
  return `pending:${jobId}:${slot}`;
}

function buildPendingNode(job: JobSummary, nodeId: string, slot: number): GenealogyNode {
  const now = new Date().toISOString();
  const jobId = String(job.id || "");
  return {
    id: nodeId,
    type: "pending",
    job_id: jobId,
    slot,
    url: "",
    preview_url: "",
    filename: `pending-${slot}.png`,
    prompt: String(job.prompt || ""),
    workflow: "image-to-image",
    status: String(job.status || "queued"),
    model: String(job.model || ""),
    compat_profile_id: String(job.compat_profile_id || ""),
    output_profile_id: String(job.output_profile_id || ""),
    quality: String(job.quality || ""),
    size: String(job.size || ""),
    created_at: String(job.created_at || now),
    updated_at: String(job.updated_at || job.created_at || now),
    pending_job_id: jobId,
    pending_slot: slot,
  };
}

function toPositiveInt(value: unknown, fallback: number) {
  const normalized = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}
