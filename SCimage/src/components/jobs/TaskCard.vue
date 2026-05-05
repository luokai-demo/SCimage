<template>
  <article :class="['left-task-card', `is-${job.status || 'unknown'}`, { 'is-busy': busy }]">
    <div class="left-task-header">
      <span class="left-task-type">{{ workflowLabel }}</span>
      <span :class="['left-task-badge', statusMeta.className]">
        <span>{{ statusMeta.label }}</span>
      </span>
    </div>

    <div class="left-task-content">
      <p class="left-task-prompt">{{ job.prompt || "未提供提示词" }}</p>
      <p v-if="message" class="left-task-message">{{ message }}</p>
    </div>

    <div class="left-task-meta">
      <span>{{ progressText }}</span>
      <span>{{ durationLabel }}</span>
    </div>

    <div class="left-task-actions">
      <button type="button" class="task-action-btn" :disabled="busy" title="复制提示词" @click="$emit('copy', job)">
        <span>复制</span>
      </button>
      <button
        v-if="active"
        type="button"
        class="task-action-btn is-primary"
        :disabled="busy"
        title="中断任务"
        @click="$emit('action', jobId, 'cancel')"
      >
        <span>中断</span>
      </button>
      <template v-else-if="retryable">
        <button type="button" class="task-action-btn" :disabled="busy" title="重试任务" @click="$emit('action', jobId, 'retry')">
          <span>重试</span>
        </button>
        <button type="button" class="task-action-btn gallery-del-btn is-danger" :disabled="busy" title="删除任务" @click="$emit('action', jobId, 'delete')">
          <span>删除</span>
        </button>
      </template>
      <button v-else type="button" class="task-action-btn gallery-del-btn is-danger" :disabled="busy" title="删除任务" @click="$emit('action', jobId, 'delete')">
        <span>删除</span>
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { JobSummary } from "../../stores/jobs";
import {
  getJobDurationText,
  getJobMessage,
  getJobProgressText,
  getStatusMeta,
  getWorkflowLabel,
  isActiveStatus,
  isRetryableJob,
} from "../../utils/jobFormatters";

const props = defineProps<{
  job: JobSummary;
  busy?: boolean;
  clockTick: number;
}>();

defineEmits<{
  copy: [job: JobSummary];
  action: [jobId: string, action: "cancel" | "retry" | "delete"];
}>();

const jobId = computed(() => String(props.job.id || ""));
const statusMeta = computed(() => getStatusMeta(String(props.job.status || "")));
const workflowLabel = computed(() => getWorkflowLabel(String(props.job.workflow || "")));
const active = computed(() => isActiveStatus(String(props.job.status || "")));
const retryable = computed(() => isRetryableJob(props.job));
const message = computed(() => getJobMessage(props.job));
const progressText = computed(() => getJobProgressText(props.job));
const durationLabel = computed(() => {
  props.clockTick;
  const duration = getJobDurationText(props.job);
  return active.value ? duration : `耗时 ${duration}`;
});
</script>

<style scoped>
.left-task-card {
  min-height: 132px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 7px;
  align-content: start;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 9px;
  background: rgba(255,255,255,.025);
  transition: border-color var(--transition), background var(--transition);
}
.left-task-card:hover {
  border-color: rgba(255,255,255,.14);
  background: rgba(255,255,255,.045);
}
.left-task-card.is-busy {
  pointer-events: auto;
}
.left-task-card.is-running,
.left-task-card.is-queued,
.left-task-card.is-canceling {
  border-color: rgba(91,160,255,.26);
}
.left-task-card.is-failed,
.left-task-card.is-canceled {
  border-color: rgba(229,72,77,.32);
}
.left-task-card.is-completed {
  border-color: rgba(69,165,87,.22);
}
.left-task-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.left-task-type {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.left-task-badge {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9px;
  color: var(--text-secondary);
  background: rgba(255,255,255,.08);
  white-space: nowrap;
}
.left-task-badge.running,
.left-task-badge.queued,
.left-task-badge.canceling {
  color: #d7ecff;
  background: rgba(91,160,255,.18);
}
.left-task-badge.completed {
  color: #d6f6dd;
  background: rgba(69,165,87,.18);
}
.left-task-badge.partial {
  color: #ffe6b5;
  background: rgba(199,146,23,.18);
}
.left-task-badge.failed,
.left-task-badge.canceled {
  color: #ffd6d6;
  background: rgba(229,72,77,.2);
}
.left-task-content {
  min-width: 0;
  display: grid;
  gap: 4px;
  align-content: start;
}
.left-task-prompt {
  min-height: 28px;
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.left-task-message {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 9px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}
.left-task-meta {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 9px;
}
.left-task-meta span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.left-task-actions {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: 6px;
}
.task-action-btn {
  min-width: 0;
  min-height: 26px;
  padding: 0 7px;
  border-radius: var(--radius);
  font-size: 9px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition), opacity var(--transition);
}
.task-action-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-action-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: rgba(255,255,255,.06);
}
.task-action-btn:disabled {
  cursor: wait;
  opacity: .58;
}
.task-action-btn.is-primary {
  border-color: rgba(91,160,255,.22);
  color: #d7ecff;
  background: rgba(91,160,255,.11);
}
.task-action-btn.is-danger {
  border-color: rgba(229,72,77,.24);
}
@media (prefers-reduced-motion: reduce) {
  .left-task-card,
  .task-action-btn {
    transition: none;
  }
}
</style>
