<template>
  <section class="job-panel" id="taskPanel" aria-label="最近任务">
    <div id="taskList" class="job-list scrollbar-data" @scroll="onScroll">
      <div v-if="!sortedJobs.length" class="job-empty">暂无任务</div>
      <template v-else>
        <div v-if="startIndex > 0" class="job-list-spacer" :style="{ height: `${beforeSpacerHeight}px` }" />
        <template v-for="item in visibleItems" :key="item.id">
          <div v-if="item.type === 'group'" class="job-group-heading">
            <span>{{ item.title }}</span>
            <small>{{ item.count }} 个</small>
          </div>
          <TaskCard
            v-else
            :job="item.job"
            :busy="runtime.busyJobIds.value.has(String(item.job.id || ''))"
            :clock-tick="runtime.clockTick.value"
            @copy="copyPrompt"
            @action="onJobAction"
          />
        </template>
        <div v-if="endIndex < jobListItems.length" class="job-list-spacer" :style="{ height: `${afterSpacerHeight}px` }" />
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import { useJobStore } from "../../stores/jobs";
import type { JobSummary } from "../../stores/jobs";
import { copyTextToClipboard } from "../../utils/clipboard";
import { createJobPanelListItems } from "../../utils/jobViewModel";
import TaskCard from "./TaskCard.vue";

const itemHeight = 144;
const groupHeaderHeight = 32;
const maxRendered = 180;
const overscan = 8;
const scrollTop = ref(0);
const viewportHeight = ref(280);
const jobStore = useJobStore();
const runtime = useScimageRuntime();

const sortedJobs = computed(() => jobStore.sortedJobs);
const jobListItems = computed(() => createJobPanelListItems(sortedJobs.value));
const visibleCapacity = computed(() => Math.max(12, Math.ceil(viewportHeight.value / itemHeight) + overscan * 2));
const startIndex = computed(() => (
  jobListItems.value.length > maxRendered
    ? Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan)
    : 0
));
const endIndex = computed(() => (
  jobListItems.value.length > maxRendered
    ? Math.min(jobListItems.value.length, startIndex.value + visibleCapacity.value)
    : Math.min(jobListItems.value.length, maxRendered)
));
const visibleItems = computed(() => jobListItems.value.slice(startIndex.value, endIndex.value));
const beforeSpacerHeight = computed(() => estimateListHeight(jobListItems.value.slice(0, startIndex.value)));
const afterSpacerHeight = computed(() => estimateListHeight(jobListItems.value.slice(endIndex.value)));

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
  const copied = await copyTextToClipboard(String(job.prompt || ""));
  runtime.setStatus(copied ? "success" : "error", copied ? "提示词已复制。" : "无法复制到剪贴板。", copied ? 1200 : 2500);
}

function onJobAction(jobId: string, action: "cancel" | "retry" | "delete") {
  void runtime.jobAction(jobId, action);
}

function estimateListHeight(items: ReturnType<typeof createJobPanelListItems>) {
  return items.reduce((height, item) => height + (item.type === "group" ? groupHeaderHeight : itemHeight), 0);
}
</script>
