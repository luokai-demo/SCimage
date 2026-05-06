<template>
  <header class="genealogy-header">
    <div class="genealogy-title-block">
      <div class="genealogy-eyebrow">Graph</div>
      <h2 id="genealogyTitle">{{ viewModel.title }}</h2>
      <span>{{ summaryText }}</span>
    </div>
    <div class="genealogy-toolbar">
      <TabsRoot v-model="viewModeModel" class="genealogy-segmented">
        <TabsList class="genealogy-segmented-list" aria-label="族谱视图">
          <TabsTrigger value="overview" class="genealogy-segmented-trigger">总览</TabsTrigger>
          <TabsTrigger value="tree" class="genealogy-segmented-trigger" :disabled="!viewModel.canOpenTree">当前族谱</TabsTrigger>
        </TabsList>
      </TabsRoot>
      <label class="genealogy-search">
        <Search aria-hidden="true" />
        <input v-model="queryModel" type="search" :placeholder="viewModel.queryPlaceholder">
      </label>
      <IconButton class-name="genealogy-icon-btn" :label="viewModel.refreshLabel" :disabled="loading" @click="emit('refresh')">
        <RefreshCw aria-hidden="true" />
      </IconButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { TabsList, TabsRoot, TabsTrigger } from "reka-ui";
import { RefreshCw, Search } from "lucide-vue-next";
import type { GenealogyViewMode } from "../../stores/genealogy";
import IconButton from "../ui/IconButton.vue";
import { createGenealogyWorkspaceToolbarViewModel } from "./genealogyToolbarViewModel";

const props = defineProps<{
  summaryText: string;
  query: string;
  viewMode: GenealogyViewMode;
  hasActiveFamily: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  "update:viewMode": [value: GenealogyViewMode];
  refresh: [];
}>();

const queryModel = computed({
  get: () => props.query,
  set: (value: string) => emit("update:query", value),
});

const viewModeModel = computed({
  get: () => props.viewMode,
  set: (value: string | number) => emit("update:viewMode", String(value) as GenealogyViewMode),
});
const viewModel = computed(() => createGenealogyWorkspaceToolbarViewModel({
  hasActiveFamily: props.hasActiveFamily,
  viewMode: props.viewMode,
}));
</script>

<style scoped>
.genealogy-header {
  min-height: 46px;
  display: grid;
  grid-template-columns: minmax(190px, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.genealogy-title-block {
  min-width: 0;
}
.genealogy-eyebrow {
  color: var(--text-tertiary);
  font-size: 10px;
  letter-spacing: 0;
}
.genealogy-title-block h2 {
  margin-top: 3px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0;
}
.genealogy-title-block span {
  display: block;
  margin-top: 5px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-toolbar {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.genealogy-segmented,
.genealogy-segmented-list {
  display: inline-flex;
}
.genealogy-segmented-list {
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 999px;
  background: rgba(255,255,255,.025);
}
.genealogy-segmented-trigger {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color var(--transition), background var(--transition), border-color var(--transition);
}
.genealogy-segmented-trigger[data-state="active"] {
  border-color: rgba(255,255,255,.08);
  color: var(--text-primary);
  background: rgba(255,255,255,.08);
}
.genealogy-segmented-trigger:disabled {
  opacity: .48;
  cursor: not-allowed;
}
.genealogy-search {
  width: min(260px, 26vw);
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 999px;
  background: rgba(255,255,255,.025);
  color: var(--text-tertiary);
}
.genealogy-search svg,
.genealogy-toolbar :deep(.genealogy-icon-btn svg) {
  width: 14px;
  height: 14px;
  stroke-width: 1.8;
}
.genealogy-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.genealogy-toolbar :deep(.genealogy-icon-btn) {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.09);
  background: rgba(255,255,255,.025);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.genealogy-toolbar :deep(.genealogy-icon-btn:hover) {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: rgba(255,255,255,.07);
}
@media (max-width: 1040px) {
  .genealogy-header {
    grid-template-columns: 1fr;
  }
  .genealogy-toolbar {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .genealogy-search {
    width: min(100%, 320px);
  }
}
</style>
