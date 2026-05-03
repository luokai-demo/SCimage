<template>
  <section class="genealogy-area" id="genealogyPanel" aria-labelledby="genealogyTitle">
    <header class="genealogy-header">
      <div class="genealogy-title-block">
        <div class="genealogy-eyebrow">图生图</div>
        <h2 id="genealogyTitle">族谱图库</h2>
        <span>{{ summaryText }}</span>
      </div>
      <div class="genealogy-toolbar">
        <TabsRoot v-model="viewModeModel" class="genealogy-segmented">
          <TabsList class="genealogy-segmented-list" aria-label="族谱视图">
            <TabsTrigger value="overview" class="genealogy-segmented-trigger">总览</TabsTrigger>
            <TabsTrigger value="tree" class="genealogy-segmented-trigger" :disabled="!activeFamily">当前族谱</TabsTrigger>
          </TabsList>
        </TabsRoot>
        <label class="genealogy-search">
          <Search aria-hidden="true" />
          <input v-model="queryModel" type="search" placeholder="搜索根图 / 提示词 / 时间">
        </label>
        <IconButton class-name="genealogy-icon-btn" label="刷新族谱" :disabled="genealogyStore.loading" @click="() => loadGraph({ force: true })">
          <RefreshCw aria-hidden="true" />
        </IconButton>
      </div>
    </header>

    <div v-if="genealogyStore.viewMode === 'tree'" class="root-strip" aria-label="根图切换条">
      <button
        v-for="family in filteredFamilies"
        :key="family.root_id"
        type="button"
        :class="['root-chip', { active: family.root_id === genealogyStore.activeRootId }]"
        @click="activateFamily(family.root_id)"
      >
        <img v-if="family.cover_url" :src="family.cover_url" alt="" loading="lazy" decoding="async">
        <span v-else class="root-chip-empty"></span>
        <span class="root-chip-copy">
          <span>{{ shortText(family.title, 24) }}</span>
          <small>{{ family.generation_count }} 代 · {{ family.image_count }} 图</small>
        </span>
      </button>
      <div v-if="!filteredFamilies.length" class="root-strip-empty">还没有可切换的族谱</div>
    </div>

    <div v-if="genealogyStore.error" class="genealogy-error">{{ genealogyStore.error }}</div>

    <main v-if="genealogyStore.viewMode === 'overview'" class="family-overview" aria-label="族谱总览">
      <button
        v-for="family in filteredFamilies"
        :key="family.root_id"
        type="button"
        class="family-card"
        @click="activateFamily(family.root_id)"
      >
        <span class="family-cover">
          <img v-if="family.cover_url" :src="family.cover_url" alt="" loading="lazy" decoding="async">
          <span class="family-cover-badge">{{ family.root_type === 'source' ? '外部根图' : '图库根图' }}</span>
        </span>
        <span class="family-card-body">
          <span class="family-card-title">{{ family.title || "未命名族谱" }}</span>
          <span class="family-lineage" aria-hidden="true">
            <span
              v-for="step in familyLineageSteps(family.generation_count)"
              :key="step"
              :class="['family-lineage-dot', { active: step <= family.generation_count }]"
            ></span>
          </span>
          <span class="family-card-meta">
            <span><GitBranch aria-hidden="true" />{{ family.generation_count }} 代</span>
            <span><Images aria-hidden="true" />{{ family.image_count }} 张</span>
            <span><Clock3 aria-hidden="true" />{{ formatGenealogyTime(family.latest_updated_at) }}</span>
          </span>
          <span class="family-card-tags">
            <span v-if="family.has_multi_source"><Combine aria-hidden="true" />多参考</span>
            <span><ImageIcon aria-hidden="true" />{{ family.root_type === 'source' ? '外部根图' : '图库根图' }}</span>
          </span>
        </span>
      </button>
      <div v-if="!filteredFamilies.length" class="genealogy-empty">
        <ImagePlus aria-hidden="true" />
        <span>从普通图库点“参考”，或在左侧上传参考图并完成一次图生图后，这里会出现族谱。</span>
      </div>
    </main>

    <main v-else class="genealogy-tree-shell" aria-label="当前族谱">
      <div class="tree-head">
        <div>
          <div class="tree-kicker">当前族谱</div>
          <h3>{{ activeFamily?.title || "未选择族谱" }}</h3>
        </div>
        <div v-if="activeFamily" class="tree-stats" aria-label="当前族谱摘要">
          <span><GitBranch aria-hidden="true" />{{ activeFamily.generation_count }} 代</span>
          <span><Images aria-hidden="true" />{{ activeFamily.image_count }} 张</span>
          <span v-if="activeFamily.has_multi_source"><Combine aria-hidden="true" />多参考</span>
        </div>
      </div>

      <div class="tree-viewport-wrap">
        <div ref="treeViewport" class="tree-viewport" @scroll="scheduleViewportUpdate">
          <div v-if="genealogyStore.loading && !layout.nodes.length" class="tree-skeleton" aria-live="polite">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="tree-canvas" :style="canvasStyle">
            <div class="generation-guides" aria-hidden="true">
              <div
                v-for="column in layout.columns"
                :key="column.generation"
                class="generation-guide"
                :style="{
                  transform: `translate3d(${column.x}px, ${column.y}px, 0)`,
                  width: `${column.width}px`,
                  height: `${column.height}px`,
                }"
              >
                <span>{{ generationLabel(column.generation) }}</span>
                <small>{{ column.count }} 张</small>
              </div>
            </div>
            <svg class="tree-lines" :width="layout.width" :height="layout.height" aria-hidden="true">
              <defs>
                <marker id="genealogyArrow" markerWidth="10" markerHeight="10" refX="8.4" refY="5" viewBox="0 0 10 10" orient="auto" markerUnits="strokeWidth">
                  <path d="M 1 1 L 9 5 L 1 9 L 3.1 5 z" class="tree-arrow" />
                </marker>
                <marker id="genealogyArrowActive" markerWidth="10" markerHeight="10" refX="8.4" refY="5" viewBox="0 0 10 10" orient="auto" markerUnits="strokeWidth">
                  <path d="M 1 1 L 9 5 L 1 9 L 3.1 5 z" class="tree-arrow-active" />
                </marker>
              </defs>
              <path
                v-for="edge in visibleEdges"
                :key="`track-${edge.from}-${edge.to}`"
                :d="edgePath(edge)"
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
                :d="edgePath(edge)"
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
              @select="genealogyStore.setSelectedNode"
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
import { TabsList, TabsRoot, TabsTrigger } from "reka-ui";
import {
  Clock3,
  Combine,
  GitBranch,
  ImageIcon,
  ImagePlus,
  Images,
  RefreshCw,
  Search,
} from "lucide-vue-next";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import type { GalleryFlatItem } from "../../stores/gallery";
import { useGenealogyStore, type GenealogyGraphPayload, type GenealogyNode, type GenealogyViewMode } from "../../stores/genealogy";
import {
  buildGenealogyLayout,
  filterGenealogyFamilies,
  formatGenealogyTime,
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  genealogyImageUrl,
  genealogyPreviewImageUrl,
  type GenealogyLayoutEdge,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import GenealogyMiniMap from "./GenealogyMiniMap.vue";
import GenealogyNodeCard from "./GenealogyNodeCard.vue";
import GenealogyNodeInspector from "./GenealogyNodeInspector.vue";
import IconButton from "../ui/IconButton.vue";

const runtime = useScimageRuntime();
const genealogyStore = useGenealogyStore();
const treeViewport = ref<HTMLElement | null>(null);
const viewportState = ref({ left: 0, top: 0, width: 0, height: 0 });
const deletingNodeId = ref("");
let refreshTimer = 0;
let graphAbortController: AbortController | null = null;
let viewportFrame = 0;

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
  const buffer = 560;
  const left = viewport.left - buffer;
  const right = viewport.left + viewport.width + buffer;
  const top = viewport.top - buffer;
  const bottom = viewport.top + viewport.height + buffer;
  return nodes.filter((node) => (
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
const queryModel = computed({
  get: () => genealogyStore.query,
  set: (value: string) => genealogyStore.setQuery(value),
});
const viewModeModel = computed({
  get: () => genealogyStore.viewMode,
  set: (value: string | number) => genealogyStore.setViewMode(String(value) as GenealogyViewMode),
});

async function loadGraph(options: { silent?: boolean; force?: boolean } = {}) {
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

function fitTree() {
  const viewport = treeViewport.value;
  if (!viewport) return;
  viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  scheduleViewportUpdate();
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

function edgePath(edge: GenealogyLayoutEdge) {
  const middle = edge.fromX + Math.max(34, (edge.toX - edge.fromX) * 0.5);
  return `M ${edge.fromX} ${edge.fromY} C ${middle} ${edge.fromY}, ${middle} ${edge.toY}, ${edge.toX} ${edge.toY}`;
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

function generationLabel(generation: number) {
  return generation === 0 ? "Gen 0" : `Gen ${generation}`;
}

function familyLineageSteps(generationCount: number) {
  return Array.from({ length: Math.max(3, Math.min(generationCount, 5)) }, (_, index) => index + 1);
}

function sortNodesByPosition(left: GenealogyLayoutNode, right: GenealogyLayoutNode) {
  if (left.generation !== right.generation) return left.generation - right.generation;
  if (left.y !== right.y) return left.y - right.y;
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
  if (key === "ArrowRight") return closestByRow(childrenById.value.get(nodeId) || [], current)?.id || "";
  if (key === "ArrowLeft") return closestByRow(parentsById.value.get(nodeId) || [], current)?.id || "";
  if (key !== "ArrowUp" && key !== "ArrowDown") return "";

  const sameGeneration = layout.value.nodes
    .filter((node) => node.generation === current.generation && node.id !== nodeId)
    .sort(sortNodesByPosition);
  if (key === "ArrowUp") {
    return [...sameGeneration].reverse().find((node) => node.y < current.y)?.id || "";
  }
  return sameGeneration.find((node) => node.y > current.y)?.id || "";
}

function closestByRow(nodes: GenealogyLayoutNode[], current: GenealogyLayoutNode) {
  return [...nodes].sort((left, right) => Math.abs(left.y - current.y) - Math.abs(right.y - current.y))[0] || null;
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

function shortText(value: string, maxLength: number) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
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
  --genealogy-source: #f5d76e;
  --genealogy-generated: #8fb8ff;
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
.genealogy-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.genealogy-title-block {
  min-width: 0;
}
.genealogy-eyebrow,
.tree-kicker {
  color: var(--text-tertiary);
  font-size: 10px;
  letter-spacing: 0;
  text-transform: uppercase;
}
.genealogy-title-block h2,
.tree-head h3 {
  margin-top: 3px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0;
}
.genealogy-title-block span {
  display: block;
  margin-top: 5px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
.genealogy-segmented,
.genealogy-segmented-list {
  display: inline-flex;
}
.genealogy-segmented-list {
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255,255,255,.025);
}
.genealogy-segmented-trigger {
  min-height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color var(--transition), background var(--transition), border-color var(--transition);
}
.genealogy-segmented-trigger {
  padding: 0 12px;
}
.genealogy-segmented-trigger[data-state="active"] {
  color: var(--text-primary);
  background: rgba(255,255,255,.08);
}
.genealogy-segmented-trigger:disabled {
  opacity: .48;
  cursor: not-allowed;
}
.genealogy-search {
  width: min(260px, 26vw);
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255,255,255,.025);
  color: var(--text-tertiary);
}
.genealogy-search svg,
.genealogy-toolbar :deep(.genealogy-icon-btn svg) {
  width: 14px;
  height: 14px;
  stroke-width: 1.8;
}
.genealogy-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.genealogy-toolbar :deep(.genealogy-icon-btn) {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.025);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.genealogy-toolbar :deep(.genealogy-icon-btn:hover) {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: rgba(255,255,255,.07);
}
.root-strip {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  min-height: 74px;
  padding: 2px 0 12px;
  overflow-x: auto;
}
.root-chip {
  flex: 0 0 176px;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.025);
  color: var(--text-secondary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), color var(--transition), transform var(--transition);
}
.root-chip:hover {
  transform: translateY(-1px);
  border-color: var(--border-hover);
}
.root-chip.active {
  border-color: rgba(143,184,255,.42);
  background: linear-gradient(135deg, rgba(143,184,255,.12), rgba(255,255,255,.045));
  color: var(--text-primary);
}
.root-chip img,
.root-chip-empty {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 5px;
  object-fit: cover;
  background: rgba(255,255,255,.08);
}
.root-chip-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.root-chip-copy span,
.root-chip-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.root-chip-copy span {
  font-size: 12px;
  font-weight: 600;
}
.root-chip-copy small {
  color: var(--text-tertiary);
  font-size: 10px;
}
.root-strip-empty,
.genealogy-error {
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-error {
  min-height: 34px;
  margin-bottom: 10px;
  padding: 0 10px;
  border: 1px solid rgba(229,72,77,.28);
  border-radius: var(--radius);
  color: #ffb3b6;
  background: rgba(229,72,77,.1);
}
.family-overview,
.genealogy-tree-shell {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.family-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  align-content: start;
  gap: 12px;
  padding: 4px 4px 24px;
}
.family-card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255,255,255,.03);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: auto 246px;
  transition: transform var(--transition), border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.family-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-hover);
  background: rgba(255,255,255,.055);
  box-shadow: 0 18px 42px rgba(0,0,0,.28);
}
.family-cover {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  background:
    linear-gradient(135deg, rgba(143,184,255,.12), rgba(245,215,110,.06)),
    rgba(255,255,255,.06);
}
.family-cover::before,
.family-cover::after {
  content: "";
  position: absolute;
  inset: 10px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 6px;
  opacity: .55;
  pointer-events: none;
}
.family-cover::before {
  transform: translate3d(8px, 7px, 0);
}
.family-cover::after {
  transform: translate3d(15px, 13px, 0);
  opacity: .32;
}
.family-cover img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.family-cover-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 2;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid rgba(255,255,255,.16);
  border-radius: 999px;
  background: rgba(0,0,0,.52);
  color: rgba(255,255,255,.82);
  font-size: 10px;
  backdrop-filter: blur(8px);
}
.family-card-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
}
.family-card-title {
  min-height: 34px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.family-lineage {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  height: 5px;
}
.family-lineage-dot {
  border-radius: 999px;
  background: rgba(255,255,255,.07);
}
.family-lineage-dot.active {
  background: linear-gradient(90deg, rgba(245,215,110,.82), rgba(143,184,255,.86));
}
.family-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 11px;
}
.family-card-meta span,
.family-card-tags span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.family-card-meta svg,
.family-card-tags svg {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  stroke-width: 1.8;
}
.family-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.family-card-tags span {
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 10px;
  background: rgba(255,255,255,.035);
}
.family-card-tags span:first-child svg {
  color: #f5d76e;
  fill: currentColor;
}
.genealogy-empty {
  grid-column: 1 / -1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px dashed rgba(255,255,255,.12);
  border-radius: 10px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-empty svg {
  width: 18px;
  height: 18px;
}
.genealogy-tree-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tree-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.tree-stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.tree-stats span {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 999px;
  background: rgba(255,255,255,.035);
  color: var(--text-secondary);
  font-size: 11px;
}
.tree-stats svg {
  width: 13px;
  height: 13px;
  stroke-width: 1.8;
}
.tree-viewport-wrap {
  position: relative;
  flex: 1;
  min-height: 260px;
}
.tree-viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background:
    linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255,255,255,.024), rgba(255,255,255,.008)),
    rgba(255,255,255,.012);
  background-size: 32px 32px;
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
.generation-guides {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.generation-guide {
  position: absolute;
  padding: 9px 10px 0;
  border: 1px solid rgba(255,255,255,.055);
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(255,255,255,.036), rgba(255,255,255,.01));
  color: var(--text-tertiary);
}
.generation-guide span,
.generation-guide small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.generation-guide span {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 650;
}
.generation-guide small {
  margin-top: 3px;
  font-size: 10px;
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
  stroke: rgba(0,0,0,.58);
  stroke-width: 6.2;
}
.tree-edge {
  stroke: var(--genealogy-line);
  stroke-width: 1.6;
  stroke-dasharray: 1 0;
}
.tree-edge.is-active {
  stroke: var(--genealogy-active);
  stroke-width: 2.3;
  filter: drop-shadow(0 0 5px rgba(255,255,255,.22));
}
.tree-edge-track.is-active,
.tree-edge-track.is-bloodline {
  stroke: rgba(143,184,255,.1);
  stroke-width: 7.2;
}
.tree-edge.is-bloodline:not(.is-active) {
  stroke: rgba(143,184,255,.52);
  stroke-width: 2;
}
.tree-edge.is-dimmed,
.tree-edge-track.is-dimmed,
.tree-edge-origin.is-dimmed {
  opacity: .28;
}
.tree-edge-origin {
  fill: rgba(160,176,196,.42);
  stroke: rgba(0,0,0,.55);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  transition: fill var(--transition), opacity var(--transition), r var(--transition);
}
.tree-edge-origin.is-active {
  fill: rgba(255,255,255,.86);
}
.tree-edge-origin.is-bloodline:not(.is-active) {
  fill: rgba(143,184,255,.74);
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
  .genealogy-header,
  .tree-head {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
  .genealogy-toolbar {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .genealogy-search {
    width: min(100%, 320px);
  }
  .tree-stats {
    justify-content: flex-start;
  }
}
</style>
