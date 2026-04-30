<template>
  <details class="task-panel" id="taskPanel">
    <summary class="task-panel-header">
      <span class="task-panel-heading">
        <span id="taskPanelTitle" class="task-panel-title">最近任务</span>
        <span id="taskPanelPreview" class="task-panel-preview">{{ previewText }}</span>
      </span>
      <span class="task-panel-meta">
        <span id="taskPanelCount" class="task-panel-count">{{ countText }}</span>
        <span class="task-panel-chevron">⌄</span>
      </span>
    </summary>
    <div class="task-panel-body">
      <div id="taskList" class="task-list" @scroll="onScroll">
        <div v-if="!sortedJobs.length" class="task-empty">暂无任务</div>
        <template v-else>
          <div v-if="startIndex > 0" class="task-list-spacer" :style="{ height: `${startIndex * itemHeight}px` }" />
          <article
            v-for="job in visibleJobs"
            :key="String(job.id || '')"
            :class="['left-task-card', `is-${job.status || 'unknown'}`]"
          >
            <div class="left-task-top">
              <span class="left-task-type">{{ getWorkflowLabel(String(job.workflow || '')) }}</span>
              <span :class="['left-task-badge', getStatusMeta(String(job.status || '')).className]">
                {{ getStatusMeta(String(job.status || '')).label }}
              </span>
            </div>
            <div class="left-task-prompt">{{ job.prompt || "未提供提示词" }}</div>
            <div class="left-task-message">{{ getJobMessage(job) }}</div>
            <div class="left-task-meta">
              <span>{{ getJobProgressText(job) }}</span>
              <span>{{ isActiveStatus(String(job.status || "")) ? getJobDurationText(job) : `耗时 ${getJobDurationText(job)}` }}</span>
            </div>
            <div class="left-task-actions">
              <button type="button" @click="copyPrompt(job)">复制</button>
              <button v-if="isActiveStatus(String(job.status || ''))" type="button" @click="runtime.jobAction(String(job.id || ''), 'cancel')">中断</button>
              <template v-else-if="isRetryableJob(job)">
                <button type="button" @click="runtime.jobAction(String(job.id || ''), 'retry')">重试</button>
                <button type="button" class="gallery-del-btn" @click="runtime.jobAction(String(job.id || ''), 'delete')">删除</button>
              </template>
              <button v-else type="button" class="gallery-del-btn" @click="runtime.jobAction(String(job.id || ''), 'delete')">删除</button>
            </div>
          </article>
          <div v-if="endIndex < sortedJobs.length" class="task-list-spacer" :style="{ height: `${(sortedJobs.length - endIndex) * itemHeight}px` }" />
          <button
            v-if="jobStore.pagination.hasMore"
            type="button"
            class="task-load-more-btn"
            :disabled="jobStore.pagination.isLoadingMore"
            @click="requestLoadMore"
          >
            {{ jobStore.pagination.isLoadingMore ? "正在加载更多任务..." : "加载更多历史任务" }}
          </button>
        </template>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import { useJobStore } from "../../stores/jobs";
import type { JobSummary } from "../../stores/jobs";
import {
  getJobDurationText,
  getJobMessage,
  getJobProgressText,
  getStatusMeta,
  getWorkflowLabel,
  isActiveStatus,
  isRetryableJob,
  truncateText,
} from "./job-formatters";

const itemHeight = 124;
const maxRendered = 180;
const overscan = 8;
const scrollTop = ref(0);
const viewportHeight = ref(280);
const jobStore = useJobStore();
const runtime = useScimageRuntime();

const sortedJobs = computed(() => jobStore.sortedJobs);
const runningCount = computed(() => jobStore.runningCount);
const countText = computed(() => {
  const total = Number(jobStore.pagination.total || 0);
  const loaded = sortedJobs.value.length;
  if (!total) {
    return `${loaded} 个任务`;
  }
  return loaded >= total ? `${total} 个任务` : `${loaded}/${total} 个任务`;
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

async function copyPrompt(job: JobSummary) {
  await navigator.clipboard?.writeText(String(job.prompt || ""));
}
</script>
