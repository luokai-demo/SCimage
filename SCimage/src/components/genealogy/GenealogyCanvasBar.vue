<template>
  <div class="tree-head">
    <div class="tree-title">
      <div class="tree-kicker">当前族谱</div>
      <h3>{{ viewModel.familyTitle }}</h3>
    </div>
    <div v-if="viewModel.showStats" class="tree-stats" aria-label="当前族谱摘要">
      <span><GitBranch aria-hidden="true" />{{ viewModel.generationLabel }}</span>
      <span><Images aria-hidden="true" />{{ viewModel.imageCountLabel }}</span>
      <span v-if="viewModel.showMultiSource"><Combine aria-hidden="true" />多参考</span>
    </div>
    <div class="canvas-actions">
      <IconButton class-name="canvas-tool-btn" label="定位根图" :disabled="!activeFamily" @click="emit('focus-root')">
        <LocateFixed aria-hidden="true" />
      </IconButton>
      <IconButton class-name="canvas-tool-btn" label="刷新族谱" :disabled="loading" @click="emit('refresh')">
        <RefreshCw aria-hidden="true" />
      </IconButton>
      <IconButton
        id="genealogyNavToggleBtn"
        :class-name="['canvas-tool-btn', 'is-navigation-toggle', { active: navigationOpen }].filter(Boolean).join(' ')"
        controls="genealogyNavPopover"
        :disabled="!hasNavigation"
        :expanded="navigationOpen"
        :pressed="navigationOpen"
        :label="viewModel.navigationLabel"
        @click="emit('toggle-navigation')"
      >
        <MapPinned aria-hidden="true" />
      </IconButton>
      <slot name="navigation-panel"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Combine,
  GitBranch,
  Images,
  LocateFixed,
  MapPinned,
  RefreshCw,
} from "lucide-vue-next";
import type { GenealogyFamily } from "../../stores/genealogy";
import IconButton from "../ui/IconButton.vue";
import { createGenealogyCanvasBarViewModel } from "./genealogyToolbarViewModel";

const props = defineProps<{
  activeFamily: GenealogyFamily | null;
  hasNavigation: boolean;
  navigationOpen: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  "focus-root": [];
  refresh: [];
  "toggle-navigation": [];
}>();

const viewModel = computed(() => createGenealogyCanvasBarViewModel(props.activeFamily, props.navigationOpen));
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
  position: relative;
}
.canvas-actions :deep(.ui-tooltip-trigger) {
  display: inline-flex;
}
.canvas-actions :deep(.canvas-tool-btn) {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 999px;
  background: rgba(255,255,255,.03);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.canvas-actions :deep(.canvas-tool-btn:hover) {
  border-color: rgba(255,255,255,.18);
  color: var(--text-primary);
  background: rgba(255,255,255,.07);
}
.canvas-actions :deep(.canvas-tool-btn:disabled) {
  opacity: .45;
  cursor: not-allowed;
}
.canvas-actions :deep(.canvas-tool-btn.active) {
  border-color: rgba(255,255,255,.24);
  color: var(--text-primary);
  background: rgba(255,255,255,.09);
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
.canvas-actions :deep(.canvas-tool-btn svg) {
  width: 13px;
  height: 13px;
  stroke-width: 1.8;
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
