<template>
  <section class="workspace-group">
    <div class="workspace-group-head">
      <div class="workspace-group-title">执行</div>
    </div>
    <div id="status" class="status" :data-tone="runtime.status.tone">{{ runtime.status.message }}</div>
    <div class="button-row">
      <button type="button" id="generateBtn" class="btn-primary" :disabled="!runtime.canGenerate.value" @click="runtime.generate">{{ runtime.workspaceStore.activeWorkflow === 'image-to-image' ? '开始图生图' : '生成图片' }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { UseScimageRuntimeReturn } from "../../composables/useScimageRuntime";

defineProps<{
  runtime: UseScimageRuntimeReturn;
}>();
</script>
