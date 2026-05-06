<template>
  <section v-show="props.active" class="workspace-group" data-workflow-scope="image-to-image">
    <div class="workspace-group-head">
      <div>
        <div id="sourceTitle" class="workspace-group-title">参考图</div>
        <div id="sourceHint" class="workspace-group-hint">支持拖拽、粘贴或选择多张图片作为参考。</div>
      </div>
    </div>
    <div
      :class="['drop-zone', { dragover: sourceDragOver }]"
      id="sourceDropZone"
      tabindex="0"
      aria-label="参考图上传区域"
      @click="onSourceZoneClick"
      @drop.prevent="onDrop"
      @dragover.prevent="sourceDragOver = true"
      @dragleave="sourceDragOver = false"
      @paste="onPaste"
    >
      <div class="drop-zone-text" id="sourceDropText">{{ props.runtime.sourceImages.value.length ? `已选择 ${props.runtime.sourceImages.value.length} 张参考图` : "将多张参考图拖到这里，或粘贴到工作区" }}</div>
      <div class="drop-zone-preview" id="sourcePreview">
        <span v-for="item in props.runtime.sourceImages.value" :key="item.key" class="source-preview-item">
          <img :src="item.url" :alt="item.name">
          <button type="button" aria-label="移除参考图" @click.stop="props.runtime.removeSourceImage(item.key)">
            <X aria-hidden="true" />
          </button>
        </span>
      </div>
      <input ref="sourceInput" type="file" id="sourceImage" accept="image/*" multiple style="display:none;" @change="onSourceChange">
      <button type="button" class="drop-zone-browse" id="sourceBrowseBtn" @click="sourceInput?.click()">选择多张参考图</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { X } from "lucide-vue-next";
import type { UseScimageRuntimeReturn } from "../../composables/useScimageRuntime";

const props = defineProps<{
  active: boolean;
  runtime: UseScimageRuntimeReturn;
}>();

const sourceInput = ref<HTMLInputElement | null>(null);
const sourceDragOver = ref(false);

function onSourceChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const runtime = getRuntime();
  if (input.files) runtime.addSourceFiles(input.files);
  input.value = "";
}

function onSourceZoneClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest("button")) return;
  sourceInput.value?.click();
}

function onDrop(event: DragEvent) {
  sourceDragOver.value = false;
  const runtime = getRuntime();
  if (event.dataTransfer?.files) runtime.addSourceFiles(event.dataTransfer.files);
}

function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean) as File[];
  if (!files.length) return;
  event.preventDefault();
  getRuntime().addSourceFiles(files);
}

function getRuntime() {
  return props.runtime;
}
</script>
