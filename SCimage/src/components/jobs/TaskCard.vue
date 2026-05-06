<template>
  <article :class="['left-job-card', `is-${job.status || 'unknown'}`, { 'is-busy': busy }]">
    <div class="left-job-header">
      <span class="left-job-type">{{ workflowLabel }}</span>
      <span :class="['left-job-badge', view.statusClassName]">
        <span>{{ view.statusLabel }}</span>
      </span>
    </div>

    <div class="left-job-content">
      <p class="left-job-prompt">{{ view.promptText }}</p>
      <p v-if="view.message" class="left-job-message">{{ view.message }}</p>
    </div>

    <div class="left-job-meta">
      <span>{{ view.progressText }}</span>
      <span>{{ view.durationLabel }}</span>
    </div>

    <div class="left-job-actions">
      <button type="button" class="job-action-btn" :disabled="busy" title="复制提示词" @click="$emit('copy', job)">
        <span>复制</span>
      </button>
      <button
        v-for="action in view.actions"
        :key="action.action"
        type="button"
        :class="['job-action-btn', action.className]"
        :disabled="busy"
        :title="action.title"
        @click="$emit('action', view.id, action.action)"
      >
        <span>{{ action.label }}</span>
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { JobSummary } from "../../stores/jobs";
import { createJobCardViewModel } from "../../utils/jobViewModel";

const props = defineProps<{
  job: JobSummary;
  busy?: boolean;
  clockTick: number;
}>();

defineEmits<{
  copy: [job: JobSummary];
  action: [jobId: string, action: "cancel" | "retry" | "delete"];
}>();

const view = computed(() => {
  props.clockTick;
  return createJobCardViewModel(props.job);
});
const workflowLabel = computed(() => view.value.workflowLabel);
</script>
