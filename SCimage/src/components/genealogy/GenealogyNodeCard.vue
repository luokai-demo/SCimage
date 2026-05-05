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
    @pointerdown="$emit('node-pointerdown', $event, node.id)"
    @dragstart.prevent
    @keydown="$emit('node-keydown', $event, node.id)"
  >
    <span class="node-port node-port-in" aria-hidden="true"></span>
    <span class="node-port node-port-out" aria-hidden="true"></span>
    <span class="node-status-rail" aria-hidden="true"></span>
    <div class="genealogy-node-titlebar">
      <span>{{ node.type === 'source' ? 'Load Image' : 'Image to Image' }}</span>
      <small>{{ node.type === 'source' ? 'source' : node.type === 'pending' ? 'reserved' : formatGenealogyGeneration(node.generation) }}</small>
    </div>
    <div class="genealogy-node-media">
      <img v-if="imageUrl" :src="imageUrl" :alt="node.prompt || node.filename" loading="lazy" decoding="async" draggable="false" @dragstart.prevent>
      <div v-else-if="node.type === 'pending'" class="genealogy-node-placeholder is-pending">
        <LoaderCircle aria-hidden="true" />
        <span>预定位置</span>
      </div>
      <div v-else class="genealogy-node-placeholder">无预览</div>
      <span class="node-badge">{{ node.type === 'source' ? '根图' : node.type === 'pending' ? pendingBadgeText : formatGenealogyGeneration(node.generation) }}</span>
      <span v-if="parentCount > 1" class="node-multi-badge"><Combine aria-hidden="true" />多参考</span>
    </div>
    <div class="genealogy-node-copy">
      <strong>{{ shortGenealogyText(node.prompt || node.filename || node.id, 34) }}</strong>
      <span class="genealogy-node-meta">
        <span><ImageIcon aria-hidden="true" />{{ node.type === 'source' ? '外部参考图' : node.size || 'auto' }}</span>
        <span><Clock3 aria-hidden="true" />{{ compactTime(node.updated_at) }}</span>
      </span>
      <span class="node-detail-chips">
        <span><Workflow aria-hidden="true" />{{ workflowLabel }}</span>
        <span v-if="node.model"><Cpu aria-hidden="true" />{{ shortGenealogyText(node.model, 18) }}</span>
        <span><SlidersHorizontal aria-hidden="true" />{{ node.quality || 'auto' }}</span>
        <span><GitMerge aria-hidden="true" />{{ Math.max(parentCount, node.type === 'source' ? 0 : 1) }} 来源</span>
        <span><Activity aria-hidden="true" />{{ statusLabel }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  Clock3,
  Combine,
  Cpu,
  GitMerge,
  ImageIcon,
  LoaderCircle,
  SlidersHorizontal,
  Workflow,
} from "lucide-vue-next";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import {
  formatGenealogyGeneration,
  formatGenealogyNodeStatus,
  shortGenealogyText,
} from "../../utils/genealogyFormat";
import {
  GENEALOGY_NODE_PORT_OFFSET,
  GENEALOGY_NODE_PORT_SIZE,
  GENEALOGY_NODE_PORT_TOP,
} from "../../utils/genealogyWire";

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
}>();

defineEmits<{
  select: [nodeId: string];
  "node-keydown": [event: KeyboardEvent, nodeId: string];
  "node-pointerdown": [event: PointerEvent, nodeId: string];
}>();

const workflowLabel = computed(() => {
  if (props.node.type === "source") return "来源";
  if (props.node.type === "pending") return "预定";
  return props.node.workflow === "image-to-image" ? "图生图" : "文生图";
});

const statusLabel = computed(() => formatGenealogyNodeStatus(props.node.status));
const pendingBadgeText = computed(() => props.node.status === "queued" ? "排队中" : "生成中");
const nodeStyle = computed<Record<string, string>>(() => ({
  transform: `translate3d(${props.node.x}px, ${props.node.y}px, 0)`,
  "--genealogy-node-port-offset": `${GENEALOGY_NODE_PORT_OFFSET}px`,
  "--genealogy-node-port-size": `${GENEALOGY_NODE_PORT_SIZE}px`,
  "--genealogy-node-port-top": `${GENEALOGY_NODE_PORT_TOP}px`,
}));

function compactTime(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

</script>

<style scoped>
.genealogy-node {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2;
  width: 168px;
  height: 208px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.018)),
    #111214;
  box-shadow: 0 18px 38px rgba(0,0,0,.38);
  cursor: pointer;
  contain: layout paint style;
  user-select: none;
  touch-action: none;
  will-change: transform, opacity;
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition), opacity var(--transition), background var(--transition);
}
.genealogy-node.is-draggable {
  cursor: grab;
}
.genealogy-node.is-dragging {
  z-index: 5;
  cursor: grabbing;
  opacity: .92;
  border-color: rgba(255,255,255,.62);
  box-shadow: 0 0 0 1px rgba(255,255,255,.14), 0 22px 52px rgba(0,0,0,.48);
  transition: border-color var(--transition), box-shadow var(--transition), opacity var(--transition), background var(--transition);
}
.genealogy-node:hover,
.genealogy-node:focus-visible {
  border-color: rgba(255,255,255,.3);
  background:
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.024)),
    #121315;
}
.genealogy-node.active {
  border-color: rgba(255,255,255,.58);
  box-shadow: 0 0 0 1px rgba(255,255,255,.13), 0 18px 46px rgba(0,0,0,.48);
}
.genealogy-node.is-related {
  border-color: rgba(212,216,224,.34);
}
.genealogy-node.is-bloodline:not(.active) {
  border-color: rgba(212,216,224,.24);
}
.genealogy-node.is-dimmed {
  opacity: .34;
}
.genealogy-node.is-source {
  border-style: dashed;
}
.genealogy-node.is-pending {
  border-style: dashed;
  border-color: rgba(143,200,255,.34);
  background:
    linear-gradient(180deg, rgba(143,200,255,.08), rgba(255,255,255,.018)),
    #0d1115;
}
.genealogy-node.is-pending.active {
  border-color: rgba(176,216,255,.62);
}
.node-port {
  position: absolute;
  z-index: 6;
  width: var(--genealogy-node-port-size);
  height: var(--genealogy-node-port-size);
  border: 2px solid #050607;
  border-radius: 50%;
  background: #9aa4b2;
  box-shadow: 0 0 0 1px rgba(255,255,255,.36);
}
.node-port-in {
  left: var(--genealogy-node-port-offset);
  top: var(--genealogy-node-port-top);
}
.node-port-out {
  right: var(--genealogy-node-port-offset);
  top: var(--genealogy-node-port-top);
  background: #d4d8e0;
}
.node-status-rail {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 3;
  width: 2px;
  background: var(--genealogy-generated);
}
.genealogy-node.is-source .node-status-rail {
  background: var(--genealogy-source);
}
.genealogy-node.is-pending .node-status-rail {
  background: #8fc8ff;
}
.genealogy-node-titlebar {
  height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 11px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(255,255,255,.045);
  color: var(--text-primary);
}
.genealogy-node-titlebar span,
.genealogy-node-titlebar small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.genealogy-node-titlebar span {
  font-size: 11px;
  font-weight: 650;
}
.genealogy-node-titlebar small {
  color: var(--text-tertiary);
  font-size: 9px;
}
.genealogy-node-media {
  position: relative;
  height: 96px;
  overflow: hidden;
  background: rgba(255,255,255,.06);
}
.genealogy-node-media::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 56px;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,.62));
  pointer-events: none;
}
.genealogy-node-media img,
.genealogy-node-placeholder {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: rgba(255,255,255,.06);
}
.genealogy-node-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-node-placeholder.is-pending {
  flex-direction: column;
  color: #cfe6ff;
  background:
    linear-gradient(135deg, rgba(143,200,255,.08), rgba(255,255,255,.025)),
    rgba(255,255,255,.04);
}
.genealogy-node-placeholder.is-pending svg {
  width: 18px;
  height: 18px;
  stroke-width: 1.8;
}
@media (prefers-reduced-motion: no-preference) {
  .genealogy-node.is-pending {
    animation: pending-node-pulse 1200ms ease-in-out infinite;
  }
  .genealogy-node-placeholder.is-pending svg {
    animation: pending-node-spin 900ms linear infinite;
  }
}
@keyframes pending-node-pulse {
  0%, 100% { opacity: .74; }
  50% { opacity: 1; }
}
@keyframes pending-node-spin {
  to { transform: rotate(360deg); }
}
.node-badge,
.node-multi-badge {
  position: absolute;
  z-index: 2;
  min-height: 21px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px;
  background: rgba(0,0,0,.5);
  color: rgba(255,255,255,.84);
  font-size: 10px;
  backdrop-filter: blur(8px);
}
.node-badge {
  left: 8px;
  bottom: 8px;
}
.node-multi-badge {
  right: 8px;
  bottom: 8px;
  color: #ffe9a3;
}
.node-multi-badge svg {
  width: 11px;
  height: 11px;
}
.genealogy-node-copy {
  position: relative;
  padding: 8px 9px 8px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.genealogy-node-copy strong {
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.genealogy-node-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 10px;
}
.genealogy-node-meta span,
.node-detail-chips span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.genealogy-node-meta svg,
.node-detail-chips svg {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
  stroke-width: 1.8;
}
.node-detail-chips {
  max-height: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-2px);
  transition: max-height var(--transition), opacity var(--transition), transform var(--transition);
}
.genealogy-node:hover .node-detail-chips,
.genealogy-node:focus-visible .node-detail-chips,
.genealogy-node.active .node-detail-chips {
  max-height: 42px;
  opacity: 1;
  transform: translateY(0);
}
.node-detail-chips span {
  min-height: 18px;
  max-width: 100%;
  padding: 0 5px;
  border: 1px solid rgba(255,255,255,.075);
  border-radius: 999px;
  background: rgba(255,255,255,.035);
  color: var(--text-tertiary);
  font-size: 9px;
}
@media (prefers-reduced-motion: reduce) {
  .genealogy-node,
  .node-detail-chips {
    transition: none;
  }
}
</style>
