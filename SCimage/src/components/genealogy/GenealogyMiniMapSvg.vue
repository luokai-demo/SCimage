<template>
  <svg
    ref="svgEl"
    class="minimap-svg"
    :class="{ 'is-sampled': model.isSampled }"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="当前族谱缩略导航"
  >
    <rect class="minimap-plane" x="0" y="0" :width="Math.max(layout.width, 1)" :height="Math.max(layout.height, 1)" rx="18" />
    <path
      v-for="edge in model.edges"
      :key="`${edge.from}-${edge.to}`"
      data-minimap-edge="true"
      :d="genealogyEdgePath(edge)"
      :class="['minimap-edge', { 'is-bloodline': bloodlineNodeIds.has(edge.from) && bloodlineNodeIds.has(edge.to) }]"
    />
    <rect
      v-for="node in model.nodes"
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
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { GenealogyLayout } from "../../utils/genealogyGraph";
import type { GenealogyMiniMapModel } from "../../utils/genealogyMiniMap";
import { genealogyEdgePath } from "../../utils/genealogyWire";

defineProps<{
  bloodlineNodeIds: Set<string>;
  layout: GenealogyLayout;
  model: GenealogyMiniMapModel;
  selectedNodeId: string;
  viewBox: string;
  viewportRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}>();

const emit = defineEmits<{
  "focus-node": [nodeId: string];
}>();

const svgEl = ref<SVGSVGElement | null>(null);

function getSvgElement() {
  return svgEl.value;
}

defineExpose({
  getSvgElement,
});
</script>

<style scoped>
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
.minimap-svg.is-sampled .minimap-node:not(.is-selected):not(.is-bloodline) {
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
@media (prefers-reduced-motion: reduce) {
  .minimap-node,
  .minimap-viewport {
    transition: none;
  }
}
</style>
