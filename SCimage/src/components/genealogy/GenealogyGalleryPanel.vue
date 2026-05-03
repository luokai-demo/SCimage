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
        :has-selected-node="Boolean(genealogyStore.selectedNodeId)"
        :loading="genealogyStore.loading"
        @focus-root="focusRoot"
        @focus-selected="focusSelectedNode"
        @refresh="loadGraph({ force: true })"
      />

      <div class="tree-viewport-wrap">
        <div ref="treeViewport" class="tree-viewport" @scroll="scheduleViewportUpdate">
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
                :d="genealogyEdgePath(edge)"
                :class="['tree-edge-track', { 'is-active': isEdgeActive(edge), 'is-bloodline': isBloodlineEdge(edge), 'is-dimmed': isDimmedEdge(edge) }]"
              />
              <circle
                v-for="edge in visibleEdges"
                :key="`origin-${edge.from}-${edge.to}`"
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
        <GenealogyMiniMap
          :layout="layout"
          :selected-node-id="genealogyStore.selectedNodeId"
          :bloodline-node-ids="bloodlineNodeIds"
          :viewport-rect="viewportState"
          @focus-node="focusNode"
          @focus-root="focusRoot"
          @focus-selected="focusSelectedNode"
          @pan-to="panTreeTo"
        />
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import type { GalleryFlatItem } from "../../stores/gallery";
import { useGenealogyStore, type GenealogyGraphPayload, type GenealogyNode } from "../../stores/genealogy";
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
import { genealogyEdgePath } from "../../utils/genealogyWire";
import GenealogyCanvasBar from "./GenealogyCanvasBar.vue";
import GenealogyMiniMap from "./GenealogyMiniMap.vue";
import GenealogyNodeCard from "./GenealogyNodeCard.vue";
import GenealogyNodeInspector from "./GenealogyNodeInspector.vue";
import GenealogyOverviewGrid from "./GenealogyOverviewGrid.vue";
import GenealogyRootTabs from "./GenealogyRootTabs.vue";
import GenealogyWorkspaceToolbar from "./GenealogyWorkspaceToolbar.vue";
import { useGenealogyNodeDrag, type GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";

const runtime = useScimageRuntime();
const genealogyStore = useGenealogyStore();
const treeViewport = ref<HTMLElement | null>(null);
const viewportState = ref({ left: 0, top: 0, width: 0, height: 0 });
const deletingNodeId = ref("");
let refreshTimer = 0;
let graphAbortController: AbortController | null = null;
let viewportFrame = 0;
let pendingGraphRefreshAfterDrag = false;
let savingNodePositionCount = 0;

const filteredFamilies = computed(() => filterGenealogyFamilies(
  genealogyStore.families,
  genealogyStore.query,
));
const activeFamily = computed(() => genealogyStore.activeFamily);
const selectedNode = computed(() => genealogyStore.selectedNode);
const layout = computed(() => buildGenealogyLayout(
  genealogyStore.activeRootId,
  genealogyStore.nodes,
  genealogyStore.edges,
  genealogyStore.activePositions,
));
const selectedLayoutNode = computed(() => layout.value.nodes.find((node) => node.id === genealogyStore.selectedNodeId) || null);
const selectedImageUrl = computed(() => genealogyImageUrl(selectedNode.value));
const incomingEdgeCounts = computed(() => {
  const counts = new Map<string, number>();
  genealogyStore.edges.forEach((edge) => counts.set(edge.to, (counts.get(edge.to) || 0) + 1));
  return counts;
});
const generatedImageCountByJobId = computed(() => {
  const counts = new Map<string, number>();
  genealogyStore.nodes.forEach((node) => {
    if (node.type !== "generated" || !node.job_id) return;
    counts.set(node.job_id, (counts.get(node.job_id) || 0) + 1);
  });
  return counts;
});
const layoutNodeById = computed(() => new Map(layout.value.nodes.map((node) => [node.id, node])));
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
  const viewport = viewportState.value;
  const nodes = layout.value.nodes;
  if (!viewport.width || !viewport.height) return nodes;
  const draggingNodeId = dragState.value.nodeId;
  const buffer = 560;
  const left = viewport.left - buffer;
  const right = viewport.left + viewport.width + buffer;
  const top = viewport.top - buffer;
  const bottom = viewport.top + viewport.height + buffer;
  return nodes.filter((node) => (
    node.id === draggingNodeId ||
    bloodlineNodeIds.value.has(node.id) ||
    (
      node.x + GENEALOGY_CARD_WIDTH >= left &&
      node.x <= right &&
      node.y + GENEALOGY_CARD_HEIGHT >= top &&
      node.y <= bottom
    )
  ));
});
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((node) => node.id)));
const visibleEdges = computed(() => layout.value.edges.filter((edge) => (
  isBloodlineEdge(edge) ||
  (visibleNodeIds.value.has(edge.from) && visibleNodeIds.value.has(edge.to))
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
  onDragCanceled: consumePendingGraphRefresh,
});

async function loadGraph(options: { silent?: boolean; force?: boolean } = {}) {
  if (shouldDeferGraphRefresh()) {
    pendingGraphRefreshAfterDrag = true;
    return;
  }
  if (genealogyStore.loading && !options.force) return;
  graphAbortController?.abort();
  graphAbortController = new AbortController();
  if (!options.silent) {
    genealogyStore.loading = true;
    genealogyStore.error = "";
  }
  try {
    const response = await fetch("/api/genealogy/graph", { signal: graphAbortController.signal });
    if (!response.ok) throw new Error(`族谱同步失败：${response.status}`);
    const payload = await response.json() as GenealogyGraphPayload;
    if (shouldDeferGraphRefresh()) {
      pendingGraphRefreshAfterDrag = true;
      return;
    }
    genealogyStore.replaceGraph(payload);
    void nextTick(updateViewportState);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    genealogyStore.error = error instanceof Error ? error.message : String(error || "族谱同步失败。");
  } finally {
    if (!options.silent) genealogyStore.loading = false;
  }
}

function activateFamily(rootId: string) {
  genealogyStore.setActiveRoot(rootId);
  void nextTick(() => focusNode(rootId));
}

function updateViewportState() {
  const viewport = treeViewport.value;
  if (!viewport) return;
  viewportState.value = {
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
    width: viewport.clientWidth,
    height: viewport.clientHeight,
  };
}

function scheduleViewportUpdate() {
  window.cancelAnimationFrame(viewportFrame);
  viewportFrame = window.requestAnimationFrame(updateViewportState);
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

function focusSelectedNode() {
  if (genealogyStore.selectedNodeId) focusNode(genealogyStore.selectedNodeId);
}

function focusNode(nodeId: string) {
  const node = layoutNodeById.value.get(nodeId);
  const viewport = treeViewport.value;
  if (!node || !viewport) return;
  genealogyStore.setSelectedNode(nodeId);
  viewport.scrollTo({
    left: Math.max(0, node.x - (viewport.clientWidth - GENEALOGY_CARD_WIDTH) / 2),
    top: Math.max(0, node.y - (viewport.clientHeight - GENEALOGY_CARD_HEIGHT) / 2),
    behavior: "smooth",
  });
  void nextTick(() => {
    const target = viewport.querySelector<HTMLElement>(`[data-genealogy-node-id="${cssAttributeValue(nodeId)}"]`);
    target?.focus({ preventScroll: true });
    scheduleViewportUpdate();
  });
}

function panTreeTo(point: { x: number; y: number }) {
  const viewport = treeViewport.value;
  if (!viewport) return;
  viewport.scrollTo({
    left: Math.max(0, point.x - viewport.clientWidth / 2),
    top: Math.max(0, point.y - viewport.clientHeight / 2),
    behavior: "smooth",
  });
  scheduleViewportUpdate();
}

async function saveNodePosition(
  node: GenealogyLayoutNode,
  position: GenealogyNodeDragPosition,
  fallback: GenealogyNodeDragPosition,
) {
  savingNodePositionCount += 1;
  try {
    const response = await fetch(`/api/genealogy/nodes/${encodeURIComponent(node.id)}/position`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(position),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(String(payload?.error || `位置保存失败：${response.status}`));
    }
  } catch (error) {
    genealogyStore.updateNodePosition(node.id, fallback);
    runtime.setStatus("error", error instanceof Error ? error.message : String(error || "位置保存失败。"), 2600);
  } finally {
    savingNodePositionCount = Math.max(0, savingNodePositionCount - 1);
    if (!savingNodePositionCount) consumePendingGraphRefresh();
  }
}

function shouldDeferGraphRefresh() {
  return Boolean(dragState.value.nodeId || savingNodePositionCount);
}

function consumePendingGraphRefresh() {
  if (!pendingGraphRefreshAfterDrag || shouldDeferGraphRefresh()) return;
  pendingGraphRefreshAfterDrag = false;
  void loadGraph({ silent: true, force: true });
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

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

async function setSelectedAsReference() {
  if (!selectedNode.value) return;
  await addNodeAsReference(selectedNode.value);
}

async function addNodeAsReference(node: GenealogyNode) {
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
  const items = layout.value.nodes.map(genealogyNodeToGalleryItem);
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
});

onBeforeUnmount(() => {
  window.clearInterval(refreshTimer);
  window.cancelAnimationFrame(viewportFrame);
  graphAbortController?.abort();
  window.removeEventListener("focus", onWindowFocus);
  window.removeEventListener("resize", scheduleViewportUpdate);
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
