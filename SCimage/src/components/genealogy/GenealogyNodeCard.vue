<template>
  <div
    :class="[
      'genealogy-node',
      {
        active,
        'is-source': node.type === 'source',
        'is-pending': node.type === 'pending',
        'is-related': related,
        'is-bloodline': bloodline,
        'is-dimmed': dimmed,
        'is-multi-source': parentCount > 1,
        'is-draggable': draggable,
        'is-dragging': dragging,
      },
    ]"
    :data-genealogy-node-id="node.id"
    :data-genealogy-x="node.x"
    :data-genealogy-y="node.y"
    :style="nodeStyle"
    role="button"
    tabindex="0"
    @click="$emit('select', node.id)"
    @pointerup="$emit('node-pointerup', $event, node.id)"
    @pointerdown="$emit('node-pointerdown', $event, node.id)"
    @dragstart.prevent
    @keydown="$emit('node-keydown', $event, node.id)"
  >
    <span class="node-port node-port-in" aria-hidden="true"></span>
    <span class="node-port node-port-out" aria-hidden="true"></span>
    <span class="node-status-rail" aria-hidden="true"></span>
    <div class="genealogy-node-titlebar">
      <span>{{ title }}</span>
      <small>{{ subtitle }}</small>
    </div>
    <GenealogyNodeMedia
      :alt-text="node.prompt || node.filename"
      :badge-text="badgeText"
      :image-url="imageUrl"
      :loading-mode="imageLoadingMode"
      :multi-source="parentCount > 1"
      :pending="node.type === 'pending'"
    />
    <GenealogyNodeCopy
      :media-label="node.type === 'source' ? '外部参考图' : node.size || 'auto'"
      :model="node.model ? shortGenealogyText(node.model, 18) : ''"
      :quality="node.quality || 'auto'"
      :source-count="sourceCountText"
      :status-label="statusLabel"
      :time-label="viewModel.timeLabel"
      :title="shortGenealogyText(node.prompt || node.filename || node.id, 34)"
      :workflow-label="workflowLabel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import {
  shortGenealogyText,
} from "../../utils/genealogyFormat";
import {
  GENEALOGY_NODE_PORT_SIZE,
  GENEALOGY_NODE_PORT_TOP,
} from "../../utils/genealogyWire";
import GenealogyNodeCopy from "./GenealogyNodeCopy.vue";
import GenealogyNodeMedia from "./GenealogyNodeMedia.vue";
import { useGenealogyNodeCardView } from "./useGenealogyNodeCardView";

const props = defineProps<{
  node: GenealogyLayoutNode;
  imageUrl: string;
  active: boolean;
  related: boolean;
  bloodline: boolean;
  dimmed: boolean;
  parentCount: number;
  draggable?: boolean;
  dragging?: boolean;
  imageLoadingMode?: "lazy" | "eager";
}>();

defineEmits<{
  select: [nodeId: string];
  "node-keydown": [event: KeyboardEvent, nodeId: string];
  "node-pointerdown": [event: PointerEvent, nodeId: string];
  "node-pointerup": [event: PointerEvent, nodeId: string];
}>();

const {
  badgeText,
  sourceCountText,
  statusLabel,
  subtitle,
  title,
  viewModel,
  workflowLabel,
} = useGenealogyNodeCardView(toRef(props, "node"), toRef(props, "parentCount"));
const nodeStyle = computed<Record<string, string>>(() => ({
  transform: `translate3d(${props.node.x}px, ${props.node.y}px, 0)`,
  "--genealogy-node-port-size": `${GENEALOGY_NODE_PORT_SIZE}px`,
  "--genealogy-node-port-top": `${GENEALOGY_NODE_PORT_TOP}px`,
}));
</script>
