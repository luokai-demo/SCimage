<template>
  <aside :class="['job-dock', { 'is-collapsed': collapsed }]" aria-label="任务列表">
    <div class="job-dock-rail">
      <IconButton
        class-name="job-dock-toggle"
        :label="collapsed ? '展开任务列表' : '收起任务列表'"
        @click="collapsed = !collapsed"
      >
        <PanelRightClose v-if="!collapsed" aria-hidden="true" />
        <PanelRightOpen v-else aria-hidden="true" />
      </IconButton>
      <div v-if="collapsed" class="job-dock-rail-summary" aria-label="任务列表摘要">
        <span class="job-dock-rail-label">任务</span>
        <span v-if="runningCount" class="job-dock-activity is-running" :aria-label="`${runningCount} 个任务进行中`">{{ runningCount }}</span>
      </div>
    </div>
    <div class="job-dock-body" :aria-hidden="collapsed">
      <TaskPanel variant="dock" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PanelRightClose, PanelRightOpen } from "lucide-vue-next";
import IconButton from "../ui/IconButton.vue";
import TaskPanel from "./TaskPanel.vue";
import { useJobStore } from "../../stores/jobs";

const collapsed = ref(false);
const jobStore = useJobStore();
const runningCount = computed(() => jobStore.runningCount);
</script>

<style scoped>
.job-dock {
  width: 286px;
  min-width: 286px;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  border-left: 1px solid var(--border);
  background: #050505;
  transition: width var(--panel-transition), min-width var(--panel-transition);
}
.job-dock.is-collapsed {
  width: 42px;
  min-width: 42px;
}
.job-dock-rail {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12px;
  border-right: 1px solid rgba(255,255,255,.05);
}
.job-dock :deep(.job-dock-toggle) {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255,255,255,.03);
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.job-dock :deep(.job-dock-toggle:hover) {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: rgba(255,255,255,.07);
}
.job-dock :deep(.job-dock-toggle svg) {
  width: 13px;
  height: 13px;
}
.job-dock-rail-summary {
  position: absolute;
  top: 36px;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  transform: translateX(-50%);
}
.job-dock-rail-label {
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0;
  writing-mode: vertical-rl;
}
.job-dock-activity {
  min-width: 18px;
  min-height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(91,160,255,.18);
  color: #d7ecff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.job-dock-body {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 10px;
  transition: opacity 220ms ease, transform var(--panel-transition), visibility 0s linear 0s;
}
.job-dock.is-collapsed .job-dock-body {
  opacity: 0;
  transform: translateX(12px);
  visibility: hidden;
  pointer-events: none;
}
@media (max-width: 1040px) {
  .job-dock {
    width: 248px;
    min-width: 248px;
  }
}
@media (max-width: 560px) {
  .job-dock,
  .job-dock.is-collapsed {
    width: 100%;
    min-width: 0;
    min-height: 260px;
    grid-template-columns: 34px minmax(0, 1fr);
    border-top: 1px solid var(--border);
    border-left: none;
  }
  .job-dock.is-collapsed {
    min-height: 42px;
  }
  .job-dock-rail-summary {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .job-dock,
  .job-dock-body,
  .job-dock :deep(.job-dock-toggle) {
    transition: none;
  }
}
</style>
