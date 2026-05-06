<template>
  <section
    v-if="layout.nodes.length"
    id="genealogyNavPopover"
    :class="['genealogy-minimap', { 'is-sampled': miniMapModel.isSampled }]"
    aria-label="导航小地图"
  >
    <div class="minimap-head">
      <span><MapPinned aria-hidden="true" />导航</span>
      <small class="minimap-status">{{ statusText }}</small>
    </div>
    <div class="minimap-body">
      <GenealogyMiniMapSvg
        ref="miniMapSvg"
        :bloodline-node-ids="bloodlineNodeIds"
        :layout="layout"
        :model="miniMapModel"
        :selected-node-id="selectedNodeId"
        :view-box="viewBox"
        :viewport-rect="viewportRect"
        @focus-node="emit('focus-node', $event)"
      />
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
import { computed, ref, toRef } from "vue";
import { MapPinned } from "lucide-vue-next";
import type { GenealogyLayout } from "../../utils/genealogyGraph";
import GenealogyMiniMapSvg from "./GenealogyMiniMapSvg.vue";
import { useGenealogyMiniMapInteraction } from "./useGenealogyMiniMapInteraction";
import { useGenealogyMiniMapView } from "./useGenealogyMiniMapView";

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

const miniMapSvg = ref<InstanceType<typeof GenealogyMiniMapSvg> | null>(null);
const svgEl = computed(() => miniMapSvg.value?.getSvgElement() || null);
const {
  miniMapModel,
  statusText,
  viewBox,
} = useGenealogyMiniMapView({
  layout: toRef(props, "layout"),
  selectedNodeId: toRef(props, "selectedNodeId"),
  bloodlineNodeIds: toRef(props, "bloodlineNodeIds"),
});
const {
  onOverlayPointerDown,
  onOverlayPointerMove,
  stopOverlayDrag,
} = useGenealogyMiniMapInteraction({
  layout: toRef(props, "layout"),
  miniMapModel,
  onFocusNode: (nodeId) => emit("focus-node", nodeId),
  onPanTo: (point) => emit("pan-to", point),
  svgEl,
});
</script>

<style scoped src="../../styles/parts/genealogy-minimap.css"></style>
