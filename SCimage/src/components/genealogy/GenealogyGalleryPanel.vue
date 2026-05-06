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
            :viewport-rect="canvasRef?.viewportState || emptyViewportState"
            @focus-node="focusNode"
            @pan-to="panTreeTo"
          />
        </template>
      </GenealogyCanvasBar>

      <GenealogyTreeCanvas
        ref="canvasRef"
        :bloodline-node-ids="bloodlineNodeIds"
        :layout="layout"
        :layout-node-by-id="layoutNodeById"
        :loading="genealogyStore.loading"
        :parent-count="parentCount"
        :is-related-node="isRelatedNode"
        :selected-node-id="genealogyStore.selectedNodeId"
        :can-defer-refresh="shouldDeferGraphRefresh"
        :consume-pending-graph-refresh="consumePendingGraphRefreshHandler"
        :save-node-position="saveNodePosition"
        @node-keydown="handleNodeKeydown"
      />

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
import { useGenealogyStore } from "../../stores/genealogy";
import { useJobStore } from "../../stores/jobs";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import GenealogyCanvasBar from "./GenealogyCanvasBar.vue";
import GenealogyMiniMap from "./GenealogyMiniMap.vue";
import GenealogyNodeInspector from "./GenealogyNodeInspector.vue";
import GenealogyOverviewGrid from "./GenealogyOverviewGrid.vue";
import GenealogyRootTabs from "./GenealogyRootTabs.vue";
import GenealogyTreeCanvas from "./GenealogyTreeCanvas.vue";
import GenealogyWorkspaceToolbar from "./GenealogyWorkspaceToolbar.vue";
import { useGenealogyGraphData } from "./useGenealogyGraphData";
import { useGenealogyGraphView } from "./useGenealogyGraphView";
import { useGenealogyKeyboardNavigation } from "./useGenealogyKeyboardNavigation";
import { useGenealogyNavigationPanel } from "./useGenealogyNavigationPanel";
import { useGenealogyNodeActions } from "./useGenealogyNodeActions";
import type { GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";
import { useGenealogyPositionBatchSave } from "./useGenealogyPositionBatchSave";
import { useGenealogyRelations } from "./useGenealogyRelations";

const runtime = useScimageRuntime();
const genealogyStore = useGenealogyStore();
const jobStore = useJobStore();
const emptyViewportState = { left: 0, top: 0, width: 0, height: 0 };
const canvasRef = ref<InstanceType<typeof GenealogyTreeCanvas> | null>(null);
let consumePendingGraphRefreshHandler = () => {};
let unsubscribeRuntimeUpdate = () => false;

const {
  activeFamily,
  filteredFamilies,
  generatedImageCountByJobId,
  layout,
  selectedImageUrl,
  selectedLayoutNode,
  selectedNode,
  summaryText,
} = useGenealogyGraphView({
  genealogyStore,
  jobs: computed(() => jobStore.jobs),
});
const {
  closeMiniMap,
  isMiniMapOpen,
  toggleMiniMap,
} = useGenealogyNavigationPanel();
const {
  bloodlineNodeIds,
  isRelatedNode,
  keyboardTargetNodeId,
  layoutNodeById,
  parentCount,
} = useGenealogyRelations({
  layout,
  selectedNodeId: computed(() => genealogyStore.selectedNodeId),
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
  loadGraph,
  consumePendingGraphRefresh,
} = useGenealogyGraphData({
  genealogyStore,
  shouldDeferGraphRefresh,
  afterGraphLoaded: () => {
    void nextTick(() => canvasRef.value?.updateViewportState());
  },
});
consumePendingGraphRefreshHandler = consumePendingGraphRefresh;
const {
  addNodeAsReference,
  deleteSelectedNodeImage,
  previewNode,
  previewSelected,
  selectedCanDelete,
  selectedDeleting,
  setSelectedAsReference,
} = useGenealogyNodeActions({
  runtime,
  selectedNode,
  layoutNodes: computed(() => layout.value.nodes),
  generatedImageCountByJobId,
  loadGraph,
});
const { handleNodeKeydown } = useGenealogyKeyboardNavigation({
  addNodeAsReference,
  focusNode,
  getNode: (nodeId) => layoutNodeById.value.get(nodeId),
  keyboardTargetNodeId,
  previewNode,
  selectNode: genealogyStore.setSelectedNode,
});

function activateFamily(rootId: string) {
  genealogyStore.setActiveRoot(rootId);
  closeMiniMap();
  void nextTick(() => focusNode(rootId));
}

function focusRoot() {
  if (genealogyStore.activeRootId) focusNode(genealogyStore.activeRootId);
}

function focusNode(nodeId: string) {
  canvasRef.value?.focusNode(nodeId);
}

function panTreeTo(point: { x: number; y: number }) {
  canvasRef.value?.panTreeTo(point);
}

async function saveNodePosition(
  node: GenealogyLayoutNode,
  position: GenealogyNodeDragPosition,
  fallback: GenealogyNodeDragPosition,
) {
  queueNodePositionSave(node.id, position, fallback);
}

function shouldDeferGraphRefresh() {
  return Boolean(canvasRef.value?.dragState.nodeId || hasPendingPositionSave());
}

onMounted(() => {
  void loadGraph();
  unsubscribeRuntimeUpdate = runtime.subscribeRuntimeUpdate(onRuntimeUpdate);
  window.addEventListener("focus", onWindowFocus);
});

onBeforeUnmount(() => {
  unsubscribeRuntimeUpdate();
  window.removeEventListener("focus", onWindowFocus);
});

function onRuntimeUpdate() {
  void loadGraph({ silent: true });
}

function onWindowFocus() {
  void loadGraph({ silent: true });
}
</script>

<style scoped src="../../styles/parts/genealogy-panel.css"></style>
