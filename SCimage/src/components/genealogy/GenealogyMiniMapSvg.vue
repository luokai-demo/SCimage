<template>
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
