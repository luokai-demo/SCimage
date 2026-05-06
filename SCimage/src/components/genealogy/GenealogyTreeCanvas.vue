<template>
  <div class="tree-viewport-wrap">
    <div
      ref="treeViewport"
      :class="[
        'tree-viewport',
        renderBudget.canvasClass,
        {
          'is-panning': isViewportPanning,
          'is-interacting': isViewportPanning || Boolean(dragState.nodeId),
        },
      ]"
      @pointerdown="handleViewportPointerDownWithHitTest"
      @scroll="scheduleViewportUpdate"
    >
      <div v-if="loading && !layout.nodes.length" class="tree-skeleton" aria-live="polite">
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
            v-if="renderBudget.renderEdgeTracks"
            v-for="edge in visibleEdgeViews"
            :key="`track-${edge.key}`"
            :data-genealogy-edge-to="edge.to"
            :d="edge.path"
            :class="['tree-edge-track', { 'is-active': edge.active, 'is-bloodline': edge.bloodline, 'is-dimmed': edge.dimmed }]"
          />
          <circle
            v-if="renderBudget.renderEdgeOrigins"
            v-for="edge in visibleEdgeViews"
            :key="`origin-${edge.key}`"
            :data-genealogy-edge-to="edge.to"
            :cx="edge.fromX"
            :cy="edge.fromY"
            r="2.7"
            :class="['tree-edge-origin', { 'is-active': edge.active, 'is-bloodline': edge.bloodline, 'is-dimmed': edge.dimmed }]"
          />
          <path
            v-for="edge in visibleEdgeViews"
            :key="`edge-${edge.key}`"
            data-genealogy-edge-kind="wire"
            :data-genealogy-edge-from="edge.from"
            :data-genealogy-edge-to="edge.to"
            :d="edge.path"
            :class="['tree-edge', { 'is-active': edge.active, 'is-bloodline': edge.bloodline, 'is-dimmed': edge.dimmed }]"
            :marker-end="edge.bloodline || edge.active ? 'url(#genealogyArrowActive)' : 'url(#genealogyArrow)'"
          />
        </svg>
        <GenealogyNodeCard
          v-for="card in visibleNodeCards"
          :key="card.node.id"
          :node="card.node"
          :image-url="card.media.imageUrl"
          :image-placeholder-text="card.media.placeholderText"
          :active="card.node.id === selectedNodeId"
          :related="card.related"
          :bloodline="card.bloodline"
          :dimmed="isDimmedNode(card.node.id)"
          :parent-count="card.parentCount"
          :draggable="canDragNode(card.node)"
          :dragging="dragState.nodeId === card.node.id"
          :image-loading-mode="card.media.loadingMode"
          @select="selectNodeFromCard"
          @node-pointerdown="handleNodePointerDown"
          @node-pointerup="handleNodePointerUpSelect"
          @node-keydown="$emit('node-keydown', $event, card.node.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useGenealogyStore, type GenealogyNode } from "../../stores/genealogy";
import {
  type GenealogyLayout,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import GenealogyNodeCard from "./GenealogyNodeCard.vue";
import { createGenealogyRenderBudget } from "./genealogyRenderBudget";
import { hitTestGenealogyNode } from "./genealogyNodeHitTest";
import { createGenealogyNodeMediaLoadState } from "./genealogyNodeMediaLoading";
import { canDragGenealogyNode } from "./genealogyNodeViewModel";
import { useGenealogyLayoutState } from "./useGenealogyLayoutState";
import { useGenealogyNodeDrag, type GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";
import { useGenealogyViewportPan } from "./useGenealogyViewportPan";
import { useGenealogyViewportState } from "./useGenealogyViewportState";

const props = defineProps<{
  bloodlineNodeIds: Set<string>;
  layout: GenealogyLayout;
  layoutNodeById: Map<string, GenealogyLayoutNode>;
  loading: boolean;
  parentCount: (nodeId: string) => number;
  isRelatedNode: (nodeId: string) => boolean;
  selectedNodeId: string;
  canDeferRefresh: () => boolean;
  consumePendingGraphRefresh: () => void;
  saveNodePosition: (
    node: GenealogyLayoutNode,
    position: GenealogyNodeDragPosition,
    fallback: GenealogyNodeDragPosition,
  ) => void | Promise<void>;
}>();

defineEmits<{
  "node-keydown": [event: KeyboardEvent, nodeId: string];
}>();

const genealogyStore = useGenealogyStore();
const treeViewport = ref<HTMLElement | null>(null);
const renderBudget = computed(() => createGenealogyRenderBudget(props.layout));
const {
  viewportState,
  updateViewportState,
  scheduleViewportUpdate,
  focusNode,
  panTreeTo,
} = useGenealogyViewportState({
  viewport: treeViewport,
  getLayoutNode: (nodeId) => props.layoutNodeById.get(nodeId),
  selectNode,
});
const {
  dragState,
  handleNodePointerDown,
  selectNodeFromCard,
} = useGenealogyNodeDrag<GenealogyLayoutNode>({
  viewport: treeViewport,
  getNode: (nodeId) => props.layoutNodeById.get(nodeId),
  canDragNode,
  selectNode,
  updateNodePosition: genealogyStore.updateNodePosition,
  saveNodePosition: props.saveNodePosition,
  scheduleViewportUpdate,
  onDragCanceled: props.consumePendingGraphRefresh,
});
const {
  canvasStyle,
  isDimmedNode,
  visibleEdgeViews,
  visibleNodes,
} = useGenealogyLayoutState({
  layout: () => props.layout,
  viewportState,
  selectedNodeId: () => props.selectedNodeId,
  draggingNodeId: () => dragState.value.nodeId,
  bloodlineNodeIds: () => props.bloodlineNodeIds,
});
const {
  isPanning: isViewportPanning,
  handleViewportPointerDown,
} = useGenealogyViewportPan({
  viewport: treeViewport,
  canStartPan: () => !dragState.value.nodeId,
  scheduleViewportUpdate,
});
const visibleNodeCards = computed(() => visibleNodes.value.map((node) => {
  const nodeId = node.id;
  const bloodline = props.bloodlineNodeIds.has(nodeId);
  const dragging = dragState.value.nodeId === nodeId;
  const related = props.isRelatedNode(nodeId);
  const selected = nodeId === props.selectedNodeId;
  return {
    bloodline,
    media: createGenealogyNodeMediaLoadState({
      bloodline,
      dragging,
      node,
      related,
      renderBudget: renderBudget.value,
      selected,
    }),
    node,
    parentCount: props.parentCount(nodeId),
    related,
  };
}));

function canDragNode(node: GenealogyLayoutNode | GenealogyNode) {
  return canDragGenealogyNode(node);
}

function selectNode(nodeId: string) {
  genealogyStore.setSelectedNode(nodeId);
}

function handleNodePointerUpSelect(event: PointerEvent, nodeId: string) {
  if (event.button !== 0) return;
  if (dragState.value.nodeId) return;
  selectNode(nodeId);
}

function handleViewportPointerDownWithHitTest(event: PointerEvent) {
  const hitNode = hitTestNodeFromPointerEvent(event);
  if (hitNode) {
    selectNode(hitNode.id);
    handleNodePointerDown(event, hitNode.id);
    return;
  }
  handleViewportPointerDown(event);
}

function hitTestNodeFromPointerEvent(event: PointerEvent) {
  const viewport = treeViewport.value;
  if (!viewport) return null;
  const rect = viewport.getBoundingClientRect();
  return hitTestGenealogyNode(visibleNodes.value, {
    x: event.clientX - rect.left + viewport.scrollLeft,
    y: event.clientY - rect.top + viewport.scrollTop,
  });
}

watch(
  () => [genealogyStore.viewMode, props.layout.width, props.layout.height],
  () => {
    void nextTick(updateViewportState);
  },
  { flush: "post" },
);

onMounted(() => {
  void nextTick(updateViewportState);
  window.addEventListener("resize", scheduleViewportUpdate);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleViewportUpdate);
});

defineExpose({
  dragState,
  focusNode,
  panTreeTo,
  scheduleViewportUpdate,
  updateViewportState,
  viewportState,
});
</script>

<style scoped src="../../styles/parts/genealogy-tree-canvas.css"></style>
