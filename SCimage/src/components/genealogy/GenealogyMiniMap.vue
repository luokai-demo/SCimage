<template>
  <section v-if="layout.nodes.length" :class="['genealogy-minimap', { 'is-sampled': miniMapModel.isSampled }]" aria-label="族谱导航小地图">
    <div class="minimap-head">
      <span><MapPinned aria-hidden="true" />族谱导航</span>
      <div class="minimap-actions">
        <IconButton class-name="minimap-icon-btn" label="定位根图" @click="$emit('focus-root')">
          <LocateFixed aria-hidden="true" />
        </IconButton>
        <IconButton class-name="minimap-icon-btn" label="定位当前节点" :disabled="!selectedNodeId" @click="$emit('focus-selected')">
          <Crosshair aria-hidden="true" />
        </IconButton>
        <IconButton class-name="minimap-icon-btn" :label="isCollapsed ? '展开导航地图' : '收起导航地图'" @click="isCollapsed = !isCollapsed">
          <PanelTopClose v-if="!isCollapsed" aria-hidden="true" />
          <PanelTopOpen v-else aria-hidden="true" />
        </IconButton>
      </div>
    </div>
    <div v-if="!isCollapsed" class="minimap-body">
      <div class="minimap-stats">
        <span><GitBranch aria-hidden="true" />{{ layout.generationCount }} 代</span>
        <span><Images aria-hidden="true" />{{ layout.nodes.length }} 图</span>
        <span v-if="miniMapModel.isSampled"><Gauge aria-hidden="true" />{{ miniMapModel.visibleNodeCount }}/{{ miniMapModel.totalNodeCount }}</span>
      </div>
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
        aria-label="族谱导航交互层"
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
import {
  Crosshair,
  Gauge,
  GitBranch,
  Images,
  LocateFixed,
  MapPinned,
  PanelTopClose,
  PanelTopOpen,
} from "lucide-vue-next";
import {
  GENEALOGY_CARD_HEIGHT,
  GENEALOGY_CARD_WIDTH,
  type GenealogyLayout,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";
import { buildGenealogyMiniMapModel } from "../../utils/genealogyMiniMap";
import { genealogyEdgePath } from "../../utils/genealogyWire";
import IconButton from "../ui/IconButton.vue";

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
  "focus-root": [];
  "focus-selected": [];
  "pan-to": [point: { x: number; y: number }];
}>();

const svgEl = ref<SVGSVGElement | null>(null);
const isCollapsed = ref(false);
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
  top: 12px;
  right: 12px;
  z-index: 8;
  width: 220px;
  padding: 10px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(255,255,255,.052), rgba(255,255,255,.018)),
    rgba(11,12,14,.9);
  box-shadow: 0 16px 38px rgba(0,0,0,.32);
  backdrop-filter: blur(10px);
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
.minimap-actions {
  display: inline-flex;
  gap: 4px;
}
.minimap-actions :deep(.minimap-icon-btn) {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: var(--radius);
  background: rgba(255,255,255,.04);
  color: var(--text-tertiary);
  cursor: pointer;
}
.minimap-actions :deep(.minimap-icon-btn:hover) {
  border-color: rgba(255,255,255,.18);
  color: var(--text-primary);
  background: rgba(255,255,255,.08);
}
.minimap-actions :deep(.minimap-icon-btn:disabled) {
  opacity: .45;
  cursor: not-allowed;
}
.minimap-actions :deep(svg) {
  width: 13px;
  height: 13px;
  stroke-width: 1.9;
}
.minimap-body {
  margin-top: 8px;
  position: relative;
}
.minimap-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}
.minimap-stats span {
  min-height: 21px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.085);
  border-radius: 999px;
  background: rgba(255,255,255,.04);
  color: var(--text-secondary);
  font-size: 10px;
}
.minimap-stats svg {
  width: 11px;
  height: 11px;
  stroke-width: 1.8;
}
.minimap-svg {
  width: 100%;
  height: 124px;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 9px;
  background:
    linear-gradient(rgba(255,255,255,.032) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.032) 1px, transparent 1px),
    rgba(255,255,255,.014);
  background-size: 16px 16px;
  pointer-events: none;
}
.minimap-interaction-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 124px;
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
    width: 178px;
  }
}
</style>
