<template>
  <section id="runningBanner" :class="['running-banner', { 'is-empty': !runningJobs.length }]" aria-live="polite">
    <button id="runningBannerToggle" class="running-banner-toggle" type="button" aria-expanded="true">
      <span class="running-banner-title">
        <span class="running-dot"></span>
        <span class="running-title-text">正在运行的任务</span>
        <span id="runningBannerSubtitle" class="running-subtitle">{{ subtitle }}</span>
      </span>
      <span class="running-banner-meta">
        <span id="runningBannerCount" class="running-banner-count">{{ runningJobs.length }} 个</span>
        <span class="running-chevron">⌄</span>
      </span>
    </button>
    <div id="runningBannerBody" class="running-banner-body">
      <article
        v-for="job in runningJobs"
        :key="String(job.id || '')"
        :class="['running-job-card', `is-${getStatusMeta(String(job.status || '')).className || job.status || 'unknown'}`]"
      >
        <div class="running-job-header">
          <div class="running-job-main">
            <div class="running-job-top">
              <span class="running-job-status">{{ getStatusMeta(String(job.status || "")).label }}</span>
              <span class="running-job-type">{{ getWorkflowLabel(String(job.workflow || "")) }}</span>
            </div>
            <div class="running-job-prompt">{{ job.prompt || "未提供提示词" }}</div>
          </div>
          <div class="running-job-actions">
            <button type="button" @click="copyPrompt(job)">复制</button>
            <button type="button" @click="runtime.jobAction(String(job.id || ''), 'cancel')">中断</button>
          </div>
        </div>
        <div class="running-job-progress-block">
          <div class="running-job-stats">
            <div class="running-job-stat">
              <div class="running-job-stat-label">进度</div>
              <div class="running-job-stat-value">{{ getJobProgressText(job) }} · {{ getJobProgressPercent(job) }}%</div>
            </div>
            <div class="running-job-stat">
              <div class="running-job-stat-label">耗时</div>
              <div class="running-job-stat-value">{{ getJobDurationText(job) }}</div>
            </div>
            <div class="running-job-stat">
              <div class="running-job-stat-label">剩余</div>
              <div class="running-job-stat-value">{{ remainingCount(job) }} 张</div>
            </div>
          </div>
          <div class="running-job-progress-track">
            <div class="running-job-progress-fill" :style="{ width: progressWidth(job) }"></div>
          </div>
          <div class="running-job-progress-note">{{ getJobMessage(job) }}</div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useScimageRuntime } from "../../composables/useScimageRuntime";
import type { JobSummary } from "../../stores/jobs";
import { useJobStore } from "../../stores/jobs";
import {
  getJobDurationText,
  getJobMessage,
  getJobProgressPercent,
  getJobProgressText,
  getStatusMeta,
  getWorkflowLabel,
  truncateText,
} from "./job-formatters";

const jobStore = useJobStore();
const runtime = useScimageRuntime();
const runningJobs = computed(() => jobStore.runningJobs);
const subtitle = computed(() => {
  if (!runningJobs.value.length) {
    return "暂无运行中任务";
  }
  if (runningJobs.value.length > 1) {
    return `${runningJobs.value.length} 个任务进行中 · ${truncateText(runningJobs.value[0].prompt || "任务", 18)}`;
  }
  return String(runningJobs.value[0].prompt || "任务");
});

function remainingCount(job: JobSummary) {
  const completedCount = Array.isArray(job.images) ? job.images.length : 0;
  const totalCount = Number(job.count || 0);
  return Math.max(0, totalCount - completedCount);
}

function progressWidth(job: JobSummary) {
  const progress = getJobProgressPercent(job);
  return progress > 0 ? `${Math.max(progress, 6)}%` : "0%";
}

async function copyPrompt(job: JobSummary) {
  await navigator.clipboard?.writeText(String(job.prompt || ""));
}
</script>
