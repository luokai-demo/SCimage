<template>
  <section class="genealogy-area" id="genealogyPanel" aria-labelledby="genealogyTitle">
    <GenealogyWorkspaceToolbar
      :summary-text="summaryText"
      :query="genealogyStore.query"
      :view-mode="genealogyStore.viewMode"
      :has-active-family="Boolean(activeFamily)"
      :loading="genealogyStore.loading"
      @update:query="genealogyStore.setQuery"
      @update:view-mode="genealogyStore.setViewMode"
      @refresh="loadGraph({ force: true })"
    />

    <GenealogyRootTabs
      v-if="genealogyStore.viewMode === 'tree'"
      :families="filteredFamilies"
      :active-root-id="genealogyStore.activeRootId"
      @activate="activateFamily"
    />

    <div v-if="genealogyStore.error" class="genealogy-error">{{ genealogyStore.error }}</div>

    <GenealogyOverviewGrid
      v-if="genealogyStore.viewMode === 'overview'"
      :families="filteredFamilies"
      @activate="activateFamily"
    />

    <main v-else class="genealogy-tree-shell" aria-label="当前族谱">
      <GenealogyCanvasBar
        :active-family="activeFamily"
        :has-navigation="Boolean(layout.nodes.length)"
        :navigation-open="isMiniMapOpen"
        :loading="genealogyStore.loading"
        @focus-root="focusRoot"
        @refresh="loadGraph({ force: true })"
        @toggle-navigation="toggleMiniMap"
      >
        <template #navigation-panel>
          <GenealogyMiniMap
            v-if="isMiniMapOpen"
            :layout="layout"
            :selected-node-id="genealogyStore.selectedNodeId"
            :bloodline-node-ids="bloodlineNodeIds"
            :viewport-rect="viewportState"
            @focus-node="focusNode"
            @pan-to="panTreeTo"
          />
        </template>
      </GenealogyCanvasBar>

      <div class="tree-viewport-wrap">
        <div
          ref="treeViewport"
          :class="['tree-viewport', { 'is-panning': isViewportPanning, 'is-interacting': isViewportPanning || Boolean(dragState.nodeId) }]"
          @pointerdown="handleViewportPointerDown"
          @scroll="scheduleViewportUpdate"
        >
          <div v-if="genealogyStore.loading && !layout.nodes.length" class="tree-skeleton" aria-live="polite">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="tree-canvas" :style="canvasStyle">
            <div class="free-canvas-grid" aria-hidden="true"></div>
            <svg class="tree-lines" :width="layout.width" :height="layout.height" aria-hidden="true">
              <defs>
                <marker id="genealogyArrow" markerWidth="8" markerHeight="8" refX="6.8" refY="4" viewBox="0 0 8 8" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M 1.2 1.2 L 6.8 4 L 1.2 6.8 L 2.6 4 z" class="tree-arrow" />
                </marker>
                <marker id="genealogyArrowActive" markerWidth="8" markerHeight="8" refX="6.8" refY="4" viewBox="0 0 8 8" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M 1.2 1.2 L 6.8 4 L 1.2 6.8 L 2.6 4 z" class="tree-arrow-active" />
                </marker>
              </defs>
              <path
                v-for="edge in visibleEdges"
                :key="`track-${edge.from}-${edge.to}`"
                :data-genealogy-edge-to="edge.to"
                :d="genealogyEdgePath(edge)"
                :class="['tree-edge-track', { 'is-active': isEdgeActive(edge), 'is-bloodline': isBloodlineEdge(edge), 'is-dimmed': isDimmedEdge(edge) }]"
              />
              <circle
                v-for="edge in visibleEdges"
                :key="`origin-${edge.from}-${edge.to}`"
                :data-genealogy-edge-to="edge.to"
                :cx="edge.fromX"
                :cy="edge.fromY"
                r="2.7"
                :class="['tree-edge-origin', { 'is-active': isEdgeActive(edge), 'is-bloodline': isBloodlineEdge(edge), 'is-dimmed': isDimmedEdge(edge) }]"
              />
              <path
                v-for="edge in visibleEdges"
                :key="`edge-${edge.from}-${edge.to}`"
                data-genealogy-edge-kind="wire"
                :data-genealogy-edge-from="edge.from"
                :data-genealogy-edge-to="edge.to"
                :d="genealogyEdgePath(edge)"
                :class="['tree-edge', { 'is-active': isEdgeActive(edge), 'is-bloodline': isBloodlineEdge(edge), 'is-dimmed': isDimmedEdge(edge) }]"
                :marker-end="isBloodlineEdge(edge) || isEdgeActive(edge) ? 'url(#genealogyArrowActive)' : 'url(#genealogyArrow)'"
              />
            </svg>
            <GenealogyNodeCard
              v-for="node in visibleNodes"
              :key="node.id"
              :node="node"
              :image-url="genealogyImageUrl(node)"
              :active="node.id === genealogyStore.selectedNodeId"
              :related="isRelatedNode(node.id)"
              :bloodline="bloodlineNodeIds.has(node.id)"
              :dimmed="isDimmedNode(node.id)"
              :parent-count="parentCount(node.id)"
              :draggable="canDragNode(node)"
              :dragging="dragState.nodeId === node.id"
              @select="selectNodeFromCard"
              @node-pointerdown="handleNodePointerDown"
              @node-keydown="handleNodeKeydown"
            />
          </div>
        </div>
      </div>

      <GenealogyNodeInspector
        :node="selectedNode"
        :layout-node="selectedLayoutNode"
        :image-url="selectedImageUrl"
        :parent-count="parentCount(selectedNode?.id || '')"
        :can-delete="selectedCanDelete"
        :deleting="selectedDeleting"
        @reference="setSelectedAsReference"
        @preview="previewSelected"
        @delete="deleteSelectedNodeImage"
      />
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import type { GalleryFlatItem } from "../../stores/gallery";
import { useGenealogyStore, type GenealogyNode } from "../../stores/genealogy";
import { useJobStore } from "../../stores/jobs";
import {
  buildGenealogyLayout,
  filterGenealogyFamilies,
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  genealogyImageUrl,
  genealogyPreviewImageUrl,
  type GenealogyLayoutEdge,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import { projectPendingGenealogyJobs } from "../../utils/genealogyPending";
import { genealogyEdgePath } from "../../utils/genealogyWire";
import GenealogyCanvasBar from "./GenealogyCanvasBar.vue";
import GenealogyMiniMap from "./GenealogyMiniMap.vue";
import GenealogyNodeCard from "./GenealogyNodeCard.vue";
import GenealogyNodeInspector from "./GenealogyNodeInspector.vue";
import GenealogyOverviewGrid from "./GenealogyOverviewGrid.vue";
import GenealogyRootTabs from "./GenealogyRootTabs.vue";
import GenealogyWorkspaceToolbar from "./GenealogyWorkspaceToolbar.vue";
import { useGenealogyGraphData } from "./useGenealogyGraphData";
import { useGenealogyNodeDrag, type GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";
import { useGenealogyPositionBatchSave } from "./useGenealogyPositionBatchSave";
import { useGenealogyViewportPan } from "./useGenealogyViewportPan";
import { useGenealogyViewportState } from "./useGenealogyViewportState";

const runtime = useScimageRuntime();
const genealogyStore = useGenealogyStore();
const jobStore = useJobStore();
const treeViewport = ref<HTMLElement | null>(null);
const deletingNodeId = ref("");
const isMiniMapOpen = ref(false);
let refreshTimer = 0;
let consumePendingGraphRefreshHandler = () => {};

const filteredFamilies = computed(() => filterGenealogyFamilies(
  genealogyStore.families,
  genealogyStore.query,
));
const activeFamily = computed(() => genealogyStore.activeFamily);
const baseLayout = computed(() => buildGenealogyLayout(
  genealogyStore.activeRootId,
  genealogyStore.nodes,
  genealogyStore.edges,
  genealogyStore.activePositions,
));
const pendingProjection = computed(() => projectPendingGenealogyJobs(
  jobStore.jobs,
  genealogyStore.nodes,
  genealogyStore.edges,
  baseLayout.value,
));
const graphNodesWithPending = computed(() => [
  ...genealogyStore.nodes,
  ...pendingProjection.value.nodes,
]);
const graphNodeById = computed(() => new Map(graphNodesWithPending.value.map((node) => [node.id, node])));
const selectedNode = computed(() => graphNodeById.value.get(genealogyStore.selectedNodeId) || null);
const graphEdgesWithPending = computed(() => [
  ...genealogyStore.edges,
  ...pendingProjection.value.edges,
]);
const graphPositionsWithPending = computed(() => ({
  ...genealogyStore.activePositions,
  ...pendingProjection.value.positions,
}));
const layout = computed(() => buildGenealogyLayout(
  genealogyStore.activeRootId,
  graphNodesWithPending.value,
  graphEdgesWithPending.value,
  graphPositionsWithPending.value,
));
const selectedLayoutNode = computed(() => layout.value.nodes.find((node) => node.id === genealogyStore.selectedNodeId) || null);
const selectedImageUrl = computed(() => genealogyImageUrl(selectedNode.value));
const incomingEdgeCounts = computed(() => {
  const counts = new Map<string, number>();
  graphEdgesWithPending.value.forEach((edge) => counts.set(edge.to, (counts.get(edge.to) || 0) + 1));
  return counts;
});
const generatedImageCountByJobId = computed(() => {
  const counts = new Map<string, number>();
  graphNodesWithPending.value.forEach((node) => {
    if (node.type !== "generated" || !node.job_id) return;
    counts.set(node.job_id, (counts.get(node.job_id) || 0) + 1);
  });
  return counts;
});
const layoutNodeById = computed(() => new Map(layout.value.nodes.map((node) => [node.id, node])));
const viewportCullingRect = computed(() => {
  const viewport = viewportState.value;
  if (!viewport.width || !viewport.height) return null;
  const buffer = 560;
  return {
    left: viewport.left - buffer,
    right: viewport.left + viewport.width + buffer,
    top: viewport.top - buffer,
    bottom: viewport.top + viewport.height + buffer,
  };
});
const childrenById = computed(() => {
  const groups = new Map<string, GenealogyLayoutNode[]>();
  layout.value.edges.forEach((edge) => {
    const child = layoutNodeById.value.get(edge.to);
    if (!child) return;
    const group = groups.get(edge.from) || [];
    group.push(child);
    groups.set(edge.from, group);
  });
  groups.forEach((group) => group.sort(sortNodesByPosition));
  return groups;
});
const parentsById = computed(() => {
  const groups = new Map<string, GenealogyLayoutNode[]>();
  layout.value.edges.forEach((edge) => {
    const parent = layoutNodeById.value.get(edge.from);
    if (!parent) return;
    const group = groups.get(edge.to) || [];
    group.push(parent);
    groups.set(edge.to, group);
  });
  groups.forEach((group) => group.sort(sortNodesByPosition));
  return groups;
});
const selectedRelatedNodeIds = computed(() => {
  const selectedId = genealogyStore.selectedNodeId;
  if (!selectedId) return new Set<string>();
  const relatedIds = new Set<string>();
  (childrenById.value.get(selectedId) || []).forEach((node) => relatedIds.add(node.id));
  (parentsById.value.get(selectedId) || []).forEach((node) => relatedIds.add(node.id));
  return relatedIds;
});
const bloodlineNodeIds = computed(() => {
  const selectedId = genealogyStore.selectedNodeId;
  const ids = new Set<string>();
  if (!selectedId) return ids;
  ids.add(selectedId);
  collectRelations(selectedId, parentsById.value, ids);
  collectRelations(selectedId, childrenById.value, ids);
  return ids;
});
const visibleNodes = computed(() => {
  const nodes = layout.value.nodes;
  const bounds = viewportCullingRect.value;
  if (!bounds) return nodes;
  const draggingNodeId = dragState.value.nodeId;
  return nodes.filter((node) => (
    node.id === draggingNodeId ||
    node.id === genealogyStore.selectedNodeId ||
    isNodeInsideBounds(node, bounds)
  ));
});
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((node) => node.id)));
const visibleEdges = computed(() => layout.value.edges.filter((edge) => (
  isEdgeVisible(edge)
)));
const selectedCanDelete = computed(() => {
  const node = selectedNode.value;
  return Boolean(node?.type === "generated" && node.job_id && Number(node.slot || 0) > 0 && node.url);
});
const selectedDeleting = computed(() => Boolean(selectedNode.value && deletingNodeId.value === selectedNode.value.id));
const canvasStyle = computed(() => ({
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
}));
const summaryText = computed(() => {
  if (genealogyStore.loading) return "正在同步族谱";
  if (!genealogyStore.families.length) return "还没有图生图族谱";
  const imageCount = genealogyStore.families.reduce((sum, family) => sum + family.image_count, 0);
  return `${genealogyStore.families.length} 棵族谱 · ${imageCount} 张图片`;
});
const {
  viewportState,
  updateViewportState,
  scheduleViewportUpdate,
  focusNode,
  panTreeTo,
} = useGenealogyViewportState({
  viewport: treeViewport,
  getLayoutNode: (nodeId) => layoutNodeById.value.get(nodeId),
  selectNode: genealogyStore.setSelectedNode,
});
const {
  queueNodePositionSave,
  hasPendingPositionSave,
} = useGenealogyPositionBatchSave({
  genealogyStore,
  setStatus: runtime.setStatus,
  onIdle: () => consumePendingGraphRefreshHandler(),
});
const {
  dragState,
  handleNodePointerDown,
  selectNodeFromCard,
} = useGenealogyNodeDrag<GenealogyLayoutNode>({
  viewport: treeViewport,
  getNode: (nodeId) => layoutNodeById.value.get(nodeId),
  canDragNode,
  selectNode: genealogyStore.setSelectedNode,
  updateNodePosition: genealogyStore.updateNodePosition,
  saveNodePosition,
  scheduleViewportUpdate,
  onDragCanceled: () => consumePendingGraphRefreshHandler(),
});
const {
  loadGraph,
  consumePendingGraphRefresh,
} = useGenealogyGraphData({
  genealogyStore,
  shouldDeferGraphRefresh,
  afterGraphLoaded: () => {
    void nextTick(updateViewportState);
  },
});
consumePendingGraphRefreshHandler = consumePendingGraphRefresh;
const {
  isPanning: isViewportPanning,
  handleViewportPointerDown,
} = useGenealogyViewportPan({
  viewport: treeViewport,
  canStartPan: () => !dragState.value.nodeId,
  scheduleViewportUpdate,
});

function activateFamily(rootId: string) {
  genealogyStore.setActiveRoot(rootId);
  isMiniMapOpen.value = false;
  void nextTick(() => focusNode(rootId));
}

function isEdgeActive(edge: GenealogyLayoutEdge) {
  const selectedId = genealogyStore.selectedNodeId;
  return Boolean(selectedId && (edge.from === selectedId || edge.to === selectedId));
}

function isBloodlineEdge(edge: GenealogyLayoutEdge) {
  return bloodlineNodeIds.value.has(edge.from) && bloodlineNodeIds.value.has(edge.to);
}

function isRelatedNode(nodeId: string) {
  return selectedRelatedNodeIds.value.has(nodeId);
}

function isDimmedNode(nodeId: string) {
  return Boolean(genealogyStore.selectedNodeId && bloodlineNodeIds.value.size > 1 && !bloodlineNodeIds.value.has(nodeId));
}

function isDimmedEdge(edge: GenealogyLayoutEdge) {
  return Boolean(genealogyStore.selectedNodeId && bloodlineNodeIds.value.size > 1 && !isBloodlineEdge(edge) && !isEdgeActive(edge));
}

function isEdgeVisible(edge: GenealogyLayoutEdge) {
  if (visibleNodeIds.value.has(edge.from) && visibleNodeIds.value.has(edge.to)) return true;
  const bounds = viewportCullingRect.value;
  if (!bounds) return true;
  return edgeIntersectsBounds(edge, bounds);
}

function parentCount(nodeId: string) {
  return incomingEdgeCounts.value.get(nodeId) || 0;
}

function canDragNode(node: GenealogyLayoutNode | GenealogyNode) {
  return Boolean(node.type === "generated" && node.job_id && Number(node.slot || 0) > 0);
}

function sortNodesByPosition(left: GenealogyLayoutNode, right: GenealogyLayoutNode) {
  if (left.y !== right.y) return left.y - right.y;
  if (left.x !== right.x) return left.x - right.x;
  return left.id.localeCompare(right.id);
}

function collectRelations(
  nodeId: string,
  relationMap: Map<string, GenealogyLayoutNode[]>,
  target: Set<string>,
) {
  const pending = [...(relationMap.get(nodeId) || [])];
  while (pending.length) {
    const node = pending.shift();
    if (!node || target.has(node.id)) continue;
    target.add(node.id);
    pending.push(...(relationMap.get(node.id) || []));
  }
}

function focusRoot() {
  if (genealogyStore.activeRootId) focusNode(genealogyStore.activeRootId);
}

function toggleMiniMap() {
  isMiniMapOpen.value = !isMiniMapOpen.value;
}

function closeMiniMapOnOutsidePointer(event: PointerEvent) {
  if (!isMiniMapOpen.value) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#genealogyNavPopover") || target.closest("#genealogyNavToggleBtn")) return;
  isMiniMapOpen.value = false;
}

function closeMiniMapOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || !isMiniMapOpen.value) return;
  isMiniMapOpen.value = false;
}

async function saveNodePosition(
  node: GenealogyLayoutNode,
  position: GenealogyNodeDragPosition,
  fallback: GenealogyNodeDragPosition,
) {
  queueNodePositionSave(node.id, position, fallback);
}

function shouldDeferGraphRefresh() {
  return Boolean(dragState.value.nodeId || hasPendingPositionSave());
}

function handleNodeKeydown(event: KeyboardEvent, nodeId: string) {
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    genealogyStore.setSelectedNode(nodeId);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const node = layoutNodeById.value.get(nodeId);
    if (node) previewNode(node);
    return;
  }
  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    const node = layoutNodeById.value.get(nodeId);
    if (node) void addNodeAsReference(node);
    return;
  }
  const targetNodeId = keyboardTargetNodeId(event.key, nodeId);
  if (!targetNodeId) return;
  event.preventDefault();
  focusNode(targetNodeId);
}

function keyboardTargetNodeId(key: string, nodeId: string) {
  const current = layoutNodeById.value.get(nodeId);
  if (!current) return "";
  if (key === "ArrowRight") return closestInDirection(childrenById.value.get(nodeId) || [], current, "right")?.id || "";
  if (key === "ArrowLeft") return closestInDirection(parentsById.value.get(nodeId) || [], current, "left")?.id || "";
  if (key === "ArrowUp") return closestInDirection(layout.value.nodes, current, "up")?.id || "";
  if (key === "ArrowDown") return closestInDirection(layout.value.nodes, current, "down")?.id || "";
  return "";
}

function closestInDirection(
  nodes: GenealogyLayoutNode[],
  current: GenealogyLayoutNode,
  direction: "left" | "right" | "up" | "down",
) {
  const currentCenter = nodeCenter(current);
  const candidates = nodes
    .filter((node) => node.id !== current.id)
    .map((node) => ({ node, center: nodeCenter(node) }))
    .filter((item) => {
      if (direction === "left") return item.center.x < currentCenter.x;
      if (direction === "right") return item.center.x > currentCenter.x;
      if (direction === "up") return item.center.y < currentCenter.y;
      return item.center.y > currentCenter.y;
    });
  return candidates
    .sort((left, right) => directionalDistance(left.center, currentCenter, direction) - directionalDistance(right.center, currentCenter, direction))[0]?.node || null;
}

function nodeCenter(node: GenealogyLayoutNode) {
  return {
    x: node.x + GENEALOGY_CARD_WIDTH / 2,
    y: node.y + GENEALOGY_CARD_HEIGHT / 2,
  };
}

function isNodeInsideBounds(
  node: GenealogyLayoutNode,
  bounds: { left: number; right: number; top: number; bottom: number },
) {
  return (
    node.x + GENEALOGY_CARD_WIDTH >= bounds.left &&
    node.x <= bounds.right &&
    node.y + GENEALOGY_CARD_HEIGHT >= bounds.top &&
    node.y <= bounds.bottom
  );
}

function edgeIntersectsBounds(
  edge: GenealogyLayoutEdge,
  bounds: { left: number; right: number; top: number; bottom: number },
) {
  const edgeLeft = Math.min(edge.fromX, edge.toX);
  const edgeRight = Math.max(edge.fromX, edge.toX);
  const edgeTop = Math.min(edge.fromY, edge.toY);
  const edgeBottom = Math.max(edge.fromY, edge.toY);
  return (
    edgeRight >= bounds.left &&
    edgeLeft <= bounds.right &&
    edgeBottom >= bounds.top &&
    edgeTop <= bounds.bottom
  );
}

function directionalDistance(
  point: { x: number; y: number },
  current: { x: number; y: number },
  direction: "left" | "right" | "up" | "down",
) {
  const primary = direction === "left" || direction === "right"
    ? Math.abs(point.x - current.x)
    : Math.abs(point.y - current.y);
  const cross = direction === "left" || direction === "right"
    ? Math.abs(point.y - current.y)
    : Math.abs(point.x - current.x);
  return primary + cross * 1.8;
}

async function setSelectedAsReference() {
  if (!selectedNode.value) return;
  await addNodeAsReference(selectedNode.value);
}

async function addNodeAsReference(node: GenealogyNode) {
  if (!node.url) return;
  await runtime.addSourceImageFromUrl({
    url: node.url,
    filename: node.filename || "reference.png",
    prompt: node.prompt,
    origin: node.job_id && node.slot ? {
      job_id: node.job_id,
      slot: node.slot,
      url: node.url,
      filename: node.filename,
      prompt: node.prompt,
    } : undefined,
  });
}

function previewSelected() {
  const node = selectedNode.value;
  if (!node?.url) return;
  previewNode(node);
}

function previewNode(node: GenealogyNode) {
  if (!node?.url) return;
  const items = layout.value.nodes.filter((item) => item.url).map(genealogyNodeToGalleryItem);
  const index = Math.max(0, items.findIndex((item) => (
    item.jobId === (node.job_id || node.id) && Number(item.slot || 0) === Number(node.slot || 1)
  )));
  runtime.openLightboxFromItems(items, index);
}

async function deleteSelectedNodeImage() {
  const node = selectedNode.value;
  if (!node || !selectedCanDelete.value || deletingNodeId.value) return;
  deletingNodeId.value = node.id;
  try {
    await runtime.deleteImage(node.job_id, Number(node.slot || 0), {
      item: genealogyNodeToGalleryItem(node),
    });
    await loadGraph({ silent: true, force: true });
  } finally {
    if (deletingNodeId.value === node.id) deletingNodeId.value = "";
  }
}

function genealogyNodeToGalleryItem(node: GenealogyNode): GalleryFlatItem {
  const jobId = node.job_id || node.id;
  const slot = Number(node.slot || 1);
  const imageCount = generatedImageCountByJobId.value.get(jobId) || 1;
  return {
    src: node.url,
    previewSrc: genealogyPreviewImageUrl(node),
    prompt: node.prompt,
    filename: node.filename || "genealogy-preview.png",
    jobId,
    slot,
    jobStatus: node.status,
    workflow: node.workflow,
    imageCount,
    totalCount: imageCount,
    jobSnapshot: {
      id: jobId,
      status: node.status,
      prompt: node.prompt,
      workflow: node.workflow,
      created_at: node.created_at,
      updated_at: node.updated_at,
      count: imageCount,
      image_count: imageCount,
      images: [{ slot, url: node.url, name: node.filename }],
    },
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    size: node.size,
    quality: node.quality,
  };
}

onMounted(() => {
  void loadGraph();
  void nextTick(updateViewportState);
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void loadGraph({ silent: true });
  }, 15000);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("resize", scheduleViewportUpdate);
  document.addEventListener("pointerdown", closeMiniMapOnOutsidePointer);
  document.addEventListener("keydown", closeMiniMapOnEscape);
});

watch(
  () => [genealogyStore.viewMode, layout.value.width, layout.value.height],
  () => {
    void nextTick(updateViewportState);
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  window.clearInterval(refreshTimer);
  window.removeEventListener("focus", onWindowFocus);
  window.removeEventListener("resize", scheduleViewportUpdate);
  document.removeEventListener("pointerdown", closeMiniMapOnOutsidePointer);
  document.removeEventListener("keydown", closeMiniMapOnEscape);
});

function onWindowFocus() {
  void loadGraph({ silent: true });
}
</script>

<style scoped>
.genealogy-area {
  --genealogy-source: #d7c886;
  --genealogy-generated: #d4d8e0;
  --genealogy-line: rgba(160, 176, 196, .34);
  --genealogy-active: rgba(255,255,255,.72);
  flex: 1;
  min-width: min(760px, calc(100vw - 54px));
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  color: var(--text-primary);
}
.genealogy-error {
  display: flex;
  align-items: center;
  font-size: 12px;
  min-height: 34px;
  margin-bottom: 10px;
  padding: 0 10px;
  border: 1px solid rgba(229,72,77,.28);
  border-radius: var(--radius);
  color: #ffb3b6;
  background: rgba(229,72,77,.1);
}
.genealogy-tree-shell {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tree-viewport-wrap {
  position: relative;
  flex: 1;
  min-height: 260px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  background: #070809;
}
.tree-viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
  border-radius: 10px;
  background:
    linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px),
    linear-gradient(rgba(255,255,255,.012) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.012) 1px, transparent 1px),
    #070809;
  background-size: 32px 32px, 32px 32px, 8px 8px, 8px 8px, auto;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);
  cursor: grab;
  overscroll-behavior: contain;
  touch-action: none;
}
.tree-viewport.is-panning {
  cursor: grabbing;
  user-select: none;
}
.tree-viewport.is-interacting :deep(.genealogy-node:not(.active):hover) {
  border-color: rgba(255,255,255,.1);
  background:
    linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.018)),
    #111214;
}
.tree-canvas {
  position: relative;
  min-width: 100%;
  min-height: 100%;
}
.tree-skeleton {
  position: absolute;
  inset: 1px;
  z-index: 7;
  display: grid;
  grid-template-columns: repeat(3, 168px);
  gap: 78px;
  padding: 58px 18px;
  pointer-events: none;
}
.tree-skeleton span {
  height: 208px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 8px;
  background: linear-gradient(110deg, rgba(255,255,255,.035), rgba(255,255,255,.08), rgba(255,255,255,.035));
  background-size: 220% 100%;
  animation: genealogy-skeleton 1200ms ease-in-out infinite;
}
@keyframes genealogy-skeleton {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
.free-canvas-grid {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 1px 1px, rgba(255,255,255,.13) 1px, transparent 0);
  background-size: 32px 32px;
  opacity: .25;
}
.tree-lines {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: visible;
}
.tree-edge-track,
.tree-edge {
  fill: none;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  transition: stroke var(--transition), stroke-width var(--transition), opacity var(--transition), filter var(--transition);
}
.tree-edge-track {
  stroke: rgba(0,0,0,.72);
  stroke-width: 6.8;
}
.tree-edge {
  stroke: rgba(162,170,184,.52);
  stroke-width: 1.8;
  stroke-dasharray: 1 0;
}
.tree-edge.is-active {
  stroke: rgba(238,242,248,.86);
  stroke-width: 2.25;
  filter: drop-shadow(0 0 3px rgba(255,255,255,.16));
}
.tree-edge-track.is-active,
.tree-edge-track.is-bloodline {
  stroke: rgba(255,255,255,.09);
  stroke-width: 7.2;
}
.tree-edge.is-bloodline:not(.is-active) {
  stroke: rgba(196,204,216,.62);
  stroke-width: 2;
}
.tree-edge.is-dimmed,
.tree-edge-track.is-dimmed,
.tree-edge-origin.is-dimmed {
  opacity: .28;
}
.tree-edge-origin {
  fill: rgba(162,170,184,.66);
  stroke: rgba(0,0,0,.72);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  transition: fill var(--transition), opacity var(--transition), r var(--transition);
}
.tree-edge-origin.is-active {
  fill: rgba(255,255,255,.86);
}
.tree-edge-origin.is-bloodline:not(.is-active) {
  fill: rgba(196,204,216,.78);
}
.tree-arrow {
  fill: var(--genealogy-line);
}
.tree-arrow-active {
  fill: var(--genealogy-active);
}
.tree-edge[data-genealogy-edge-to^="pending:"],
.tree-edge-track[data-genealogy-edge-to^="pending:"] {
  stroke-dasharray: 4 10;
}
.tree-edge[data-genealogy-edge-to^="pending:"] {
  stroke: rgba(143,200,255,.58);
}
.tree-edge-origin[data-genealogy-edge-to^="pending:"] {
  fill: rgba(143,200,255,.82);
}
@media (prefers-reduced-motion: no-preference) {
  .tree-edge.is-active,
  .tree-edge.is-bloodline {
    stroke-dasharray: 5 13;
    animation: genealogy-edge-flow 850ms linear infinite;
  }
}
@keyframes genealogy-edge-flow {
  to {
    stroke-dashoffset: -18;
  }
}
@media (max-width: 1040px) {
  .genealogy-area {
    padding: 16px;
  }
}
</style>
