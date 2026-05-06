<template>
  <section class="workspace-group">
    <div class="workspace-group-head">
      <div>
        <div class="workspace-group-title">输出参数</div>
        <div class="workspace-group-hint">当前工作流独立保存这一组输出参数，尺寸会随质量档位联动。</div>
      </div>
    </div>
    <div class="row">
      <UiSelectField v-model="runtime.currentWorkflowForm.value.size" select-id="size" label="尺寸">
        <option v-for="option in sizeOptionItems" :key="option.value" :value="option.value">{{ option.label }}</option>
      </UiSelectField>
      <UiSelectField v-model="runtime.currentWorkflowForm.value.quality" select-id="quality" label="质量">
        <option v-for="option in qualityOptionItems" :key="option.value" :value="option.value">{{ option.label }}</option>
      </UiSelectField>
    </div>
    <div class="row">
      <UiSelectField v-model="runtime.currentWorkflowForm.value.count" select-id="count" label="数量">
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
      </UiSelectField>
      <div class="form-group">
        <label>输出格式</label>
        <div class="helper-note">当前固定输出 PNG，格式与压缩选项后续再开放。</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UseScimageRuntimeReturn } from "../../composables/useScimageRuntime";
import type { OutputOption } from "../../data/outputOptions";
import UiSelectField from "../ui/UiSelectField.vue";

const props = defineProps<{
  runtime: UseScimageRuntimeReturn;
}>();

const sizeOptionItems = computed(() => props.runtime.sizeOptions.value as OutputOption[]);
const qualityOptionItems = computed(() => props.runtime.qualityOptions.value as OutputOption[]);
</script>
