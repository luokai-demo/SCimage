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
        @pointerdown="onMapPointerDown"
      >
        <rect class="minimap-plane" x="0" y="0" :width="Math.max(layout.width, 1)" :height="Math.max(layout.height, 1)" rx="18" />
        <rect
          v-for="column in layout.columns"
          :key="`column-${column.generation}`"
          class="minimap-column"
          :x="column.x - 8"
          :y="column.y"
          :width="column.width + 16"
          :height="column.height"
          rx="16"
        />
        <path
          v-for="edge in miniMapModel.edges"
          :key="`${edge.from}-${edge.to}`"
          data-minimap-edge="true"
          :d="edgePath(edge)"
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
          @pointerdown.stop
          @click.stop="$emit('focus-node', node.id)"
          @keydown.enter.prevent="$emit('focus-node', node.id)"
          @keydown.space.prevent="$emit('focus-node', node.id)"
        />
        <rect
          v-if="viewportRect.width && viewportRect.height"
          class="minimap-viewport"
          :x="viewportRect.left"
          :y="viewportRect.top"
          :width="viewportRect.width"
          :height="viewportRect.height"
          rx="14"
          tabindex="0"
          role="button"
          aria-label="拖动当前视口"
          @pointerdown.stop="onViewportPointerDown"
        />
      </svg>
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
import type { GenealogyLayout, GenealogyLayoutEdge } from "../../utils/genealogyGraph";
import { buildGenealogyMiniMapModel } from "../../utils/genealogyMiniMap";
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
let dragOffset = { x: 0, y: 0 };

const viewBox = computed(() => `0 0 ${Math.max(props.layout.width, 1)} ${Math.max(props.layout.height, 1)}`);
const miniMapModel = computed(() => buildGenealogyMiniMapModel(
  props.layout,
  props.selectedNodeId,
  props.bloodlineNodeIds,
));

function edgePath(edge: GenealogyLayoutEdge) {
  const middle = edge.fromX + Math.max(34, (edge.toX - edge.fromX) * 0.5);
  return `M ${edge.fromX} ${edge.fromY} C ${middle} ${edge.fromY}, ${middle} ${edge.toY}, ${edge.toX} ${edge.toY}`;
}

function onMapPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  const point = eventToSvgPoint(event);
  if (!point) return;
  emit("pan-to", point);
}

function onViewportPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  const point = eventToSvgPoint(event);
  if (!point) return;
  dragOffset = {
    x: point.x - (props.viewportRect.left + props.viewportRect.width / 2),
    y: point.y - (props.viewportRect.top + props.viewportRect.height / 2),
  };
  window.addEventListener("pointermove", onViewportPointerMove);
  window.addEventListener("pointerup", stopViewportDrag, { once: true });
  window.addEventListener("pointercancel", stopViewportDrag, { once: true });
}

function onViewportPointerMove(event: PointerEvent) {
  const point = eventToSvgPoint(event);
  if (!point) return;
  emit("pan-to", {
    x: point.x - dragOffset.x,
    y: point.y - dragOffset.y,
  });
}

function stopViewportDrag() {
  window.removeEventListener("pointermove", onViewportPointerMove);
  window.removeEventListener("pointercancel", stopViewportDrag);
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

onBeforeUnmount(stopViewportDrag);
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
    linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018)),
    rgba(7,8,10,.84);
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
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px),
    rgba(255,255,255,.014);
  background-size: 18px 18px;
  cursor: crosshair;
}
.minimap-plane {
  fill: transparent;
}
.minimap-column {
  fill: rgba(255,255,255,.018);
  stroke: rgba(255,255,255,.055);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.minimap-edge {
  fill: none;
  stroke: rgba(175,187,205,.32);
  stroke-width: 1.15;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
}
.minimap-edge.is-bloodline {
  stroke: rgba(143,184,255,.76);
  stroke-width: 1.7;
}
.minimap-node {
  fill: rgba(238,242,248,.24);
  stroke: rgba(255,255,255,.34);
  stroke-width: 1.1;
  vector-effect: non-scaling-stroke;
  cursor: pointer;
  transition: fill var(--transition), stroke var(--transition), opacity var(--transition);
}
.minimap-node.is-source {
  fill: rgba(245,215,110,.44);
  stroke: rgba(245,215,110,.7);
}
.minimap-node.is-bloodline {
  fill: rgba(143,184,255,.54);
  stroke: rgba(143,184,255,.86);
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
  fill: rgba(143,184,255,.07);
  stroke: rgba(255,255,255,.72);
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
  cursor: grab;
  transition: fill var(--transition), stroke var(--transition);
}
.minimap-viewport:hover,
.minimap-viewport:focus-visible {
  fill: rgba(143,184,255,.08);
  stroke: rgba(143,184,255,.78);
  outline: none;
}
.minimap-viewport:active {
  cursor: grabbing;
}
@media (max-width: 1040px) {
  .genealogy-minimap {
    width: 178px;
  }
}
</style>
