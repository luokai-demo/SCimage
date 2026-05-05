<template>
  <section
    v-if="layout.nodes.length"
    id="genealogyNavPopover"
    :class="['genealogy-minimap', { 'is-sampled': miniMapModel.isSampled }]"
    aria-label="导航小地图"
  >
    <div class="minimap-head">
      <span><MapPinned aria-hidden="true" />导航</span>
      <small class="minimap-status">{{ miniMapStatusText }}</small>
    </div>
    <div class="minimap-body">
      <svg
        ref="svgEl"
        class="minimap-svg"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="当前族谱缩略导航"
      >
        <rect class="minimap-plane" x="0" y="0" :width="Math.max(layout.width, 1)" :height="Math.max(layout.height, 1)" rx="18" />
        <path
          v-for="edge in miniMapModel.edges"
          :key="`${edge.from}-${edge.to}`"
          data-minimap-edge="true"
          :d="genealogyEdgePath(edge)"
          :class="['minimap-edge', { 'is-bloodline': bloodlineNodeIds.has(edge.from) && bloodlineNodeIds.has(edge.to) }]"
        />
        <rect
          v-for="node in miniMapModel.nodes"
          :key="node.id"
          :data-minimap-node-id="node.id"
          :x="node.x"
          :y="node.y"
          width="168"
          height="208"
          rx="10"
          :class="[
            'minimap-node',
            {
              'is-selected': node.id === selectedNodeId,
              'is-source': node.type === 'source',
              'is-bloodline': bloodlineNodeIds.has(node.id),
            },
          ]"
          role="button"
          tabindex="0"
          @keydown.enter.prevent="emit('focus-node', node.id)"
          @keydown.space.prevent="emit('focus-node', node.id)"
        />
        <rect
          v-if="viewportRect.width && viewportRect.height"
          class="minimap-viewport"
          :x="viewportRect.left"
          :y="viewportRect.top"
          :width="viewportRect.width"
          :height="viewportRect.height"
          rx="14"
          aria-label="拖动当前视口"
        />
      </svg>
      <div
        class="minimap-interaction-overlay"
        data-minimap-interaction-overlay="true"
        aria-label="导航交互层"
        @pointerdown="onOverlayPointerDown"
        @pointermove="onOverlayPointerMove"
        @pointerup="stopOverlayDrag"
        @pointerleave="stopOverlayDrag"
        @pointercancel="stopOverlayDrag"
      ></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { MapPinned } from "lucide-vue-next";
import {
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  type GenealogyLayout,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import { buildGenealogyMiniMapModel } from "../../utils/genealogyMiniMap";
import { genealogyEdgePath } from "../../utils/genealogyWire";

const props = defineProps<{
  layout: GenealogyLayout;
  selectedNodeId: string;
  bloodlineNodeIds: Set<string>;
  viewportRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}>();

const emit = defineEmits<{
  "focus-node": [nodeId: string];
  "pan-to": [point: { x: number; y: number }];
}>();

const svgEl = ref<SVGSVGElement | null>(null);
const isOverlayDragging = ref(false);
let overlayDragPointerId = 0;
let startPointerPoint = { x: 0, y: 0 };
let dragStartedOnNodeId = "";

const viewBox = computed(() => `0 0 ${Math.max(props.layout.width, 1)} ${Math.max(props.layout.height, 1)}`);
const miniMapModel = computed(() => buildGenealogyMiniMapModel(
  props.layout,
  props.selectedNodeId,
  props.bloodlineNodeIds,
));
const miniMapStatusText = computed(() => (
  miniMapModel.value.isSampled
    ? `${miniMapModel.value.visibleNodeCount}/${miniMapModel.value.totalNodeCount} 节点`
    : `${miniMapModel.value.totalNodeCount} 节点`
));

function onOverlayPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  const point = eventToSvgPoint(event);
  if (!point) return;

  event.preventDefault();
  dragStartedOnNodeId = findNodeAtPoint(point)?.id || "";
  startPointerPoint = point;
  isOverlayDragging.value = false;
  overlayDragPointerId = event.pointerId;
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  if (!dragStartedOnNodeId) emit("pan-to", point);
}

function onOverlayPointerMove(event: PointerEvent) {
  if (event.pointerId !== overlayDragPointerId) return;
  const point = eventToSvgPoint(event);
  if (!point) return;

  if (
    !isOverlayDragging.value &&
    Math.hypot(point.x - startPointerPoint.x, point.y - startPointerPoint.y) < 4
  ) {
    return;
  }
  isOverlayDragging.value = true;
  emit("pan-to", point);
}

function stopOverlayDrag(event?: PointerEvent) {
  if (!overlayDragPointerId) return;
  if (event && event.pointerId !== overlayDragPointerId) return;

  const point = event ? eventToSvgPoint(event) : null;
  const shouldSelectNode = !isOverlayDragging.value && dragStartedOnNodeId;
  releaseOverlayPointer(event);
  overlayDragPointerId = 0;
  isOverlayDragging.value = false;

  if (shouldSelectNode) {
    const hitNode = point ? findNodeAtPoint(point) : null;
    emit("focus-node", hitNode?.id || dragStartedOnNodeId);
  }
  dragStartedOnNodeId = "";
}

function findNodeAtPoint(point: { x: number; y: number }) {
  return [...miniMapModel.value.nodes]
    .reverse()
    .find((node) => pointInsideNode(point, node)) || null;
}

function pointInsideNode(point: { x: number; y: number }, node: GenealogyLayoutNode) {
  return (
    point.x >= node.x &&
    point.x <= node.x + GENEALOGY_CARD_WIDTH &&
    point.y >= node.y &&
    point.y <= node.y + GENEALOGY_CARD_HEIGHT
  );
}

function releaseOverlayPointer(event?: PointerEvent) {
  if (!event) return;
  const target = event.currentTarget;
  if (
    target instanceof HTMLElement &&
    target.hasPointerCapture?.(event.pointerId)
  ) {
    target.releasePointerCapture(event.pointerId);
  }
}

function eventToSvgPoint(event: PointerEvent) {
  const svg = svgEl.value;
  if (!svg) return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return {
    x: clamp(transformed.x, 0, props.layout.width),
    y: clamp(transformed.y, 0, props.layout.height),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

onBeforeUnmount(() => stopOverlayDrag());
</script>

<style scoped>
.genealogy-minimap {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 12;
  width: 236px;
  padding: 10px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  background: rgba(11,12,14,.96);
  box-shadow: 0 16px 38px rgba(0,0,0,.32);
}
.minimap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.minimap-head > span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 650;
}
.minimap-head > span svg {
  width: 12px;
  height: 12px;
  stroke-width: 1.9;
}
.minimap-status {
  min-width: 0;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.minimap-body {
  margin-top: 8px;
  position: relative;
}
.minimap-svg {
  width: 100%;
  height: 116px;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 9px;
  background: rgba(255,255,255,.014);
  pointer-events: none;
}
.minimap-interaction-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 116px;
  border-radius: 9px;
  touch-action: none;
  cursor: grab;
}
.minimap-interaction-overlay:active {
  cursor: grabbing;
}
.minimap-plane {
  fill: transparent;
}
.minimap-edge {
  fill: none;
  stroke: rgba(175,187,205,.36);
  stroke-width: 1.15;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
}
.minimap-edge.is-bloodline {
  stroke: rgba(220,226,238,.78);
  stroke-width: 1.7;
}
.minimap-node {
  fill: rgba(238,242,248,.22);
  stroke: rgba(255,255,255,.32);
  stroke-width: 1.1;
  vector-effect: non-scaling-stroke;
  transition: fill var(--transition), stroke var(--transition), opacity var(--transition);
}
.minimap-node.is-source {
  fill: rgba(220,206,156,.44);
  stroke: rgba(220,206,156,.7);
}
.minimap-node.is-bloodline {
  fill: rgba(220,226,238,.54);
  stroke: rgba(220,226,238,.86);
}
.minimap-node.is-selected {
  fill: rgba(255,255,255,.9);
  stroke: rgba(255,255,255,.9);
  stroke-width: 1.9;
}
.genealogy-minimap.is-sampled .minimap-node:not(.is-selected):not(.is-bloodline) {
  opacity: .7;
}
.minimap-viewport {
  fill: rgba(255,255,255,.08);
  stroke: rgba(255,255,255,.72);
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
  transition: fill var(--transition), stroke var(--transition);
}
.minimap-viewport:hover,
.minimap-viewport:focus-visible {
  fill: rgba(255,255,255,.1);
  stroke: rgba(255,255,255,.82);
  outline: none;
}
@media (max-width: 1040px) {
  .genealogy-minimap {
    width: 204px;
  }
}
</style>
