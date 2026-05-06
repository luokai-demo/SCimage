<template>
  <aside :class="['job-dock', { 'is-open': open }]" aria-label="任务列表">
    <button
      id="taskQueueToggleBtn"
      type="button"
      class="job-dock-toggle"
      aria-controls="taskQueuePanel"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span class="job-dock-toggle-icon">
        <ListChecks aria-hidden="true" />
        <span v-if="runningCount" class="job-dock-toggle-badge" :aria-label="`${runningCount} 个任务进行中`">{{ runningCount }}</span>
      </span>
      <span class="job-dock-summary">
        <span class="job-dock-title">任务队列</span>
        <span class="job-dock-preview">{{ previewText }}</span>
      </span>
      <span class="job-dock-count">{{ countText }}</span>
      <ChevronDown class="job-dock-chevron" aria-hidden="true" />
    </button>

    <div id="taskQueuePanel" class="job-dock-body" :hidden="!open">
      <TaskPanel />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, ListChecks } from "lucide-vue-next";
import TaskPanel from "./TaskPanel.vue";
import { useJobStore } from "../../stores/jobs";
import { createJobPanelSummary } from "../../utils/jobViewModel";

const open = ref(false);
const jobStore = useJobStore();
const runningCount = computed(() => jobStore.runningCount);
const sortedJobs = computed(() => jobStore.sortedJobs);
const summary = computed(() => createJobPanelSummary(sortedJobs.value, jobStore.pagination.total, runningCount.value));
const countText = computed(() => summary.value.compactCountText);
const previewText = computed(() => summary.value.previewText);

function toggleOpen() {
  open.value = !open.value;
}
</script>

<style scoped>
.job-dock {
  flex: 0 0 auto;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.015);
  overflow: hidden;
}
.job-dock.is-open {
  flex: 0 1 min(42vh, 420px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.job-dock-toggle {
  width: 100%;
  min-height: 38px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition);
}
.job-dock-toggle:hover {
  background: rgba(255,255,255,.035);
}
.job-dock-toggle-icon {
  position: relative;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  background: rgba(255,255,255,.025);
}
.job-dock-toggle-icon svg {
  width: 13px;
  height: 13px;
}
.job-dock-toggle-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(91,160,255,.36);
  border-radius: 999px;
  background: #132133;
  color: #d7ecff;
  font-size: 9px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.job-dock-summary {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.job-dock-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.job-dock-preview {
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.job-dock-count {
  color: var(--text-tertiary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.job-dock-chevron {
  width: 13px;
  height: 13px;
  color: var(--text-tertiary);
  stroke-width: 1.8;
  transition: transform 180ms ease;
}
.job-dock.is-open .job-dock-chevron {
  transform: rotate(180deg);
}
.job-dock-body {
  min-height: 0;
  border-top: 1px solid var(--border);
  overflow: hidden;
}
.job-dock-body[hidden] {
  display: none;
}
.job-dock :deep(.job-panel) {
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.job-dock :deep(.job-list) {
  height: 100%;
  max-height: none;
  overscroll-behavior: contain;
}
@media (max-width: 560px) {
  .job-dock.is-open {
    flex-basis: min(48vh, 360px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .job-dock-toggle,
  .job-dock-chevron {
    transition: none;
  }
}
</style>
