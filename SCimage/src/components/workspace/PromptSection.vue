<template>
  <section class="workspace-group">
    <div class="workspace-group-head">
      <div>
        <div class="workspace-group-title">提示词</div>
        <div id="promptSectionHint" class="workspace-group-hint">{{ hint }}</div>
      </div>
      <button
        type="button"
        id="togglePromptBankBtn"
        class="chip-btn"
        :aria-expanded="promptDialog.open.value"
        @click="promptDialog.setOpen(!promptDialog.open.value)"
      >词库</button>
    </div>
    <textarea v-model="runtime.currentWorkflowForm.value.prompt" id="prompt" :placeholder="placeholder"></textarea>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UseScimageRuntimeReturn } from "../../composables/useScimageRuntime";
import { usePromptLibraryDialog } from "../../composables/usePromptLibraryDialog";

const props = defineProps<{
  runtime: UseScimageRuntimeReturn;
}>();

const promptDialog = usePromptLibraryDialog();
const hint = computed(() => (
  props.runtime.workspaceStore.activeWorkflow === "image-to-image"
    ? "可上传多张参考图，再描述你希望统一迁移出的画面效果。"
    : "直接描述你想生成的画面、风格和细节。"
));
const placeholder = computed(() => (
  props.runtime.workspaceStore.activeWorkflow === "image-to-image"
    ? "参考多张样图的构图与质感，输出统一风格的人像海报"
    : "一只在星空下奔跑的白色柴犬，水彩风格"
));
</script>
