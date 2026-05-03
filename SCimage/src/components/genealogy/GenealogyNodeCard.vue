<template>
  <div
    :class="[
      'genealogy-node',
      {
        active,
        'is-source': node.type === 'source',
        'is-related': related,
        'is-bloodline': bloodline,
        'is-dimmed': dimmed,
        'is-multi-source': parentCount > 1,
      },
    ]"
    :data-genealogy-node-id="node.id"
    :style="{ transform: `translate3d(${node.x}px, ${node.y}px, 0)` }"
    role="button"
    tabindex="0"
    @click="$emit('select', node.id)"
    @keydown="$emit('node-keydown', $event, node.id)"
  >
    <span class="node-status-rail" aria-hidden="true"></span>
    <div class="genealogy-node-media">
      <img v-if="imageUrl" :src="imageUrl" :alt="node.prompt || node.filename" loading="lazy" decoding="async">
      <div v-else class="genealogy-node-placeholder">无预览</div>
      <span class="node-badge">{{ node.type === 'source' ? '根图' : generationLabel(node.generation) }}</span>
      <span v-if="parentCount > 1" class="node-multi-badge"><Combine aria-hidden="true" />多参考</span>
    </div>
    <div class="genealogy-node-copy">
      <strong>{{ shortText(node.prompt || node.filename || node.id, 34) }}</strong>
      <span class="genealogy-node-meta">
        <span><ImageIcon aria-hidden="true" />{{ node.type === 'source' ? '外部参考图' : node.size || 'auto' }}</span>
        <span><Clock3 aria-hidden="true" />{{ compactTime(node.updated_at) }}</span>
      </span>
      <span class="node-detail-chips">
        <span><Workflow aria-hidden="true" />{{ workflowLabel }}</span>
        <span v-if="node.model"><Cpu aria-hidden="true" />{{ shortText(node.model, 18) }}</span>
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
  SlidersHorizontal,
  Workflow,
} from "lucide-vue-next";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";

const props = defineProps<{
  node: GenealogyLayoutNode;
  imageUrl: string;
  active: boolean;
  related: boolean;
  bloodline: boolean;
  dimmed: boolean;
  parentCount: number;
}>();

defineEmits<{
  select: [nodeId: string];
  "node-keydown": [event: KeyboardEvent, nodeId: string];
}>();

const workflowLabel = computed(() => {
  if (props.node.type === "source") return "来源";
  return props.node.workflow === "image-to-image" ? "图生图" : "文生图";
});

const statusLabel = computed(() => {
  const status = String(props.node.status || "");
  if (status === "completed") return "完成";
  if (status === "partial") return "部分";
  if (status === "failed") return "失败";
  if (status === "canceled") return "中断";
  if (status === "source") return "来源";
  return status || "未知";
});

function generationLabel(generation: number) {
  return generation === 0 ? "Gen 0" : `Gen ${generation}`;
}

function compactTime(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function shortText(value: string, maxLength: number) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
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
  border: 1px solid var(--border);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012)),
    #080808;
  box-shadow: 0 16px 34px rgba(0,0,0,.32);
  cursor: pointer;
  contain: layout paint style;
  will-change: transform, opacity;
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition), opacity var(--transition), background var(--transition);
}
.genealogy-node:hover,
.genealogy-node:focus-visible {
  border-color: rgba(255,255,255,.28);
  background:
    linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.018)),
    #080808;
}
.genealogy-node.active {
  border-color: rgba(255,255,255,.5);
  box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 18px 42px rgba(0,0,0,.42);
}
.genealogy-node.is-related {
  border-color: rgba(143,184,255,.34);
}
.genealogy-node.is-bloodline:not(.active) {
  border-color: rgba(143,184,255,.24);
}
.genealogy-node.is-dimmed {
  opacity: .34;
}
.genealogy-node.is-source {
  border-style: dashed;
}
.node-status-rail {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 3;
  width: 3px;
  background: var(--genealogy-generated);
}
.genealogy-node.is-source .node-status-rail {
  background: var(--genealogy-source);
}
.genealogy-node-media {
  position: relative;
  height: 118px;
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
  color: var(--text-tertiary);
  font-size: 12px;
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
  padding: 9px 9px 8px 11px;
  display: flex;
  flex-direction: column;
  gap: 7px;
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
