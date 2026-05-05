<template>
  <section :class="['job-panel', `is-${props.variant}`]" id="taskPanel" :open="open ? '' : undefined" aria-labelledby="taskPanelTitle">
    <button type="button" class="job-panel-header" :aria-expanded="open" aria-controls="taskPanelBody" @click="toggleOpen">
      <span class="job-panel-heading">
        <span id="taskPanelTitle" class="job-panel-title">最近任务</span>
        <span id="taskPanelPreview" class="job-panel-preview">{{ previewText }}</span>
      </span>
      <span class="job-panel-meta">
        <span id="taskPanelCount" class="job-panel-count">{{ countText }}</span>
        <ChevronDown class="job-panel-chevron" aria-hidden="true" />
      </span>
    </button>
    <div id="taskPanelBody" class="job-panel-body">
      <div id="taskList" class="job-list" @scroll="onScroll">
        <div v-if="!sortedJobs.length" class="job-empty">暂无任务</div>
        <template v-else>
          <div v-if="startIndex > 0" class="job-list-spacer" :style="{ height: `${startIndex * itemHeight}px` }" />
          <TaskCard
            v-for="job in visibleJobs"
            :key="String(job.id || '')"
            :job="job"
            :busy="runtime.busyJobIds.value.has(String(job.id || ''))"
            :clock-tick="runtime.clockTick.value"
            @copy="copyPrompt"
            @action="onJobAction"
          />
          <div v-if="endIndex < sortedJobs.length" class="job-list-spacer" :style="{ height: `${(sortedJobs.length - endIndex) * itemHeight}px` }" />
          <button
            v-if="jobStore.pagination.hasMore"
            type="button"
            class="job-load-more-btn"
            :disabled="jobStore.pagination.isLoadingMore"
            @click="requestLoadMore"
          >
            {{ jobStore.pagination.isLoadingMore ? "正在加载更多任务..." : "加载更多历史任务" }}
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import { useJobStore } from "../../stores/jobs";
import type { JobSummary } from "../../stores/jobs";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  getStatusMeta,
  isActiveStatus,
  truncateText,
} from "../../utils/jobFormatters";
import TaskCard from "./TaskCard.vue";

const itemHeight = 144;
const maxRendered = 180;
const overscan = 8;
const scrollTop = ref(0);
const viewportHeight = ref(280);
const jobStore = useJobStore();
const runtime = useScimageRuntime();

const props = withDefaults(defineProps<{
  variant?: "inline" | "dock";
}>(), {
  variant: "inline",
});
const open = ref(true);

const sortedJobs = computed(() => jobStore.sortedJobs);
const runningCount = computed(() => jobStore.runningCount);
const countText = computed(() => {
  const total = Number(jobStore.pagination.total || 0);
  const loaded = sortedJobs.value.length;
  return `${total || loaded} 个任务`;
});
const previewText = computed(() => {
  if (!sortedJobs.value.length) {
    return "暂无任务";
  }
  if (runningCount.value > 0) {
    return `${runningCount.value} 个进行中`;
  }
  const latestJob = sortedJobs.value[0];
  const statusMeta = getStatusMeta(String(latestJob.status || ""));
  return `${statusMeta.label} · ${truncateText(latestJob.prompt || "未提供提示词", 14)}`;
});
const visibleCapacity = computed(() => Math.max(12, Math.ceil(viewportHeight.value / itemHeight) + overscan * 2));
const startIndex = computed(() => (
  sortedJobs.value.length > maxRendered
    ? Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan)
    : 0
));
const endIndex = computed(() => (
  sortedJobs.value.length > maxRendered
    ? Math.min(sortedJobs.value.length, startIndex.value + visibleCapacity.value)
    : Math.min(sortedJobs.value.length, maxRendered)
));
const visibleJobs = computed(() => sortedJobs.value.slice(startIndex.value, endIndex.value));

function onScroll(event: Event) {
  const target = event.currentTarget as HTMLElement;
  scrollTop.value = target.scrollTop || 0;
  viewportHeight.value = target.clientHeight || 280;
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (remaining <= 900) {
    void runtime.loadMoreJobs();
  }
}

function requestLoadMore() {
  void runtime.loadMoreJobs();
}

function toggleOpen() {
  open.value = !open.value;
}

async function copyPrompt(job: JobSummary) {
  const copied = await copyTextToClipboard(String(job.prompt || ""));
  runtime.setStatus(copied ? "success" : "error", copied ? "提示词已复制。" : "无法复制到剪贴板。", copied ? 1200 : 2500);
}

function onJobAction(jobId: string, action: "cancel" | "retry" | "delete") {
  void runtime.jobAction(jobId, action);
}
</script>

<style scoped>
.job-panel {
  margin-top: 0;
  flex-shrink: 0;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #000;
  overflow: hidden;
  min-width: 0;
}
.job-panel[open] {
  height: 100%;
}
.job-panel.is-dock {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.job-panel-header {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 8px 9px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
  min-width: 0;
  transition: background var(--transition);
}
.job-panel-header:hover {
  background: rgba(255,255,255,.035);
}
.job-panel-header::-webkit-details-marker {
  display: none;
}
.job-panel-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}
.job-panel-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.job-panel-preview {
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.job-panel-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-width: 0;
  max-width: 96px;
  justify-content: flex-end;
}
.job-panel-count {
  min-width: 0;
  font-size: 10px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.job-panel-chevron {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  color: var(--text-tertiary);
  transition: transform 180ms ease;
  stroke-width: 1.8;
}
.job-panel[open] .job-panel-chevron {
  transform: rotate(180deg);
}
.job-panel-body {
  border-top: 1px solid var(--border);
  flex: 1;
  min-height: 0;
  max-height: 0;
  overflow: hidden;
  transition: max-height 180ms ease;
}
.job-panel:not([open]) .job-panel-body {
  border-top-color: transparent;
}
.job-panel[open] .job-panel-body {
  max-height: 280px;
}
.job-panel.is-dock[open] .job-panel-body {
  height: auto;
  max-height: none;
}
.job-list {
  overflow-y: auto;
  padding: 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 279px;
  min-height: 0;
}
.job-panel.is-dock .job-list {
  height: 100%;
  max-height: none;
  overscroll-behavior: contain;
}
.job-list-spacer {
  flex: 0 0 auto;
  min-height: 0;
  pointer-events: none;
}
.job-empty {
  flex: 1;
  min-height: 116px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 11px;
  text-align: center;
}
.job-load-more-btn {
  width: 100%;
  min-height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.02);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition), opacity var(--transition);
}
.job-load-more-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: rgba(255,255,255,.05);
}
.job-load-more-btn:disabled {
  cursor: wait;
  opacity: .62;
}
@media (max-width: 1040px) {
  .job-panel-meta {
    max-width: 82px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .job-panel-header,
  .job-panel-body,
  .job-panel-chevron,
  .job-load-more-btn {
    transition: none;
  }
}
</style>
