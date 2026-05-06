<template>
  <div class="genealogy-node-copy">
    <strong>{{ title }}</strong>
    <span class="genealogy-node-meta">
      <span><ImageIcon aria-hidden="true" />{{ mediaLabel }}</span>
      <span><Clock3 aria-hidden="true" />{{ timeLabel }}</span>
    </span>
    <span class="node-detail-chips">
      <span><Workflow aria-hidden="true" />{{ workflowLabel }}</span>
      <span v-if="model"><Cpu aria-hidden="true" />{{ model }}</span>
      <span><SlidersHorizontal aria-hidden="true" />{{ quality }}</span>
      <span><GitMerge aria-hidden="true" />{{ sourceCount }} 来源</span>
      <span><Activity aria-hidden="true" />{{ statusLabel }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import {
  Activity,
  Clock3,
  Cpu,
  GitMerge,
  ImageIcon,
  SlidersHorizontal,
  Workflow,
} from "lucide-vue-next";

defineProps<{
  mediaLabel: string;
  model: string;
  quality: string;
  sourceCount: string;
  statusLabel: string;
  timeLabel: string;
  title: string;
  workflowLabel: string;
}>();
</script>

<style scoped>
.genealogy-node-copy {
  position: relative;
  height: 82px;
  padding: 7px 9px 7px 11px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow: hidden;
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
:global(.genealogy-node:hover) .node-detail-chips,
:global(.genealogy-node:focus-visible) .node-detail-chips,
:global(.genealogy-node.active) .node-detail-chips {
  max-height: 20px;
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
  .node-detail-chips {
    transition: none;
  }
}
</style>
