<template>
  <div class="tree-head">
    <div class="tree-title">
      <div class="tree-kicker">当前族谱</div>
      <h3>{{ activeFamily?.title || "未选择族谱" }}</h3>
    </div>
    <div v-if="activeFamily" class="tree-stats" aria-label="当前族谱摘要">
      <span><GitBranch aria-hidden="true" />{{ activeFamily.generation_count }} 代</span>
      <span><Images aria-hidden="true" />{{ activeFamily.image_count }} 张</span>
      <span v-if="activeFamily.has_multi_source"><Combine aria-hidden="true" />多参考</span>
    </div>
    <div class="canvas-actions">
      <button type="button" class="canvas-tool-btn" :disabled="!activeFamily" title="定位根图" @click="emit('focus-root')">
        <LocateFixed aria-hidden="true" />
      </button>
      <button type="button" class="canvas-tool-btn" :disabled="!hasSelectedNode" title="定位当前节点" @click="emit('focus-selected')">
        <Crosshair aria-hidden="true" />
      </button>
      <button type="button" class="canvas-tool-btn" :disabled="loading" title="刷新族谱" @click="emit('refresh')">
        <RefreshCw aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Combine,
  Crosshair,
  GitBranch,
  Images,
  LocateFixed,
  RefreshCw,
} from "lucide-vue-next";
import type { GenealogyFamily } from "../../stores/genealogy";

defineProps<{
  activeFamily: GenealogyFamily | null;
  hasSelectedNode: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  "focus-root": [];
  "focus-selected": [];
  refresh: [];
}>();
</script>

<style scoped>
.tree-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  min-height: 42px;
}
.tree-title {
  min-width: 0;
}
.tree-kicker {
  color: var(--text-tertiary);
  font-size: 10px;
  letter-spacing: 0;
}
.tree-title h3 {
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0;
}
.tree-stats,
.canvas-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.tree-stats {
  flex-wrap: wrap;
}
.tree-stats span {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 999px;
  background: rgba(255,255,255,.035);
  color: var(--text-secondary);
  font-size: 11px;
}
.tree-stats svg,
.canvas-tool-btn svg {
  width: 13px;
  height: 13px;
  stroke-width: 1.8;
}
.canvas-tool-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 7px;
  background: rgba(255,255,255,.03);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.canvas-tool-btn:hover {
  border-color: rgba(255,255,255,.18);
  color: var(--text-primary);
  background: rgba(255,255,255,.07);
}
.canvas-tool-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
}
@media (max-width: 1040px) {
  .tree-head {
    grid-template-columns: 1fr;
  }
  .tree-stats,
  .canvas-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
