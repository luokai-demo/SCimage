<template>
  <div
    :class="galleryClass"
    :style="styleVars"
    :data-gallery-key="galleryKey"
    :data-open-lightbox="openIndex"
    :data-job-id="item.jobId"
    :data-image-slot="item.slot"
    role="button"
    tabindex="0"
    @click="$emit('open')"
    @keydown="onKeydown"
  >
    <button
      type="button"
      class="gallery-select-btn"
      :aria-label="selected ? '取消选择图片' : '选择图片'"
      @click.stop="$emit('toggle-select')"
    ></button>
    <img v-if="hasPreview" class="gallery-preview" :src="item.previewSrc" alt="" aria-hidden="true">
    <img class="gallery-image" :src="item.src" :alt="item.prompt" :width="item.width" :height="item.height" loading="lazy">
    <div class="gallery-overlay">
      <div class="prompt-preview">{{ item.prompt }}</div>
      <div class="meta-row">
        <span class="time" :aria-label="`生成时间 ${formattedTime}`">
          <span class="time-date">{{ dateText }}</span>
          <span class="time-clock">{{ clockText }}</span>
        </span>
        <span class="meta-actions">
          <button type="button" @click.stop="$emit('copy-prompt')">复制</button>
          <button type="button" @click.stop="$emit('add-source')">参考</button>
          <button type="button" @click.stop="$emit('download')">下载</button>
          <button
            type="button"
            :class="{ 'gallery-del-btn': !isActive }"
            :aria-label="terminalActionLabel"
            :title="terminalActionLabel"
            @click.stop="$emit('terminal-action')"
          >{{ isActive ? "中断" : "删除" }}</button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { GalleryFlatItem } from "../../stores/gallery";
import { isActiveJobStatus } from "../../utils/jobStatus";
import type { GalleryLayoutProfile } from "../../utils/galleryLayout";

const props = defineProps<{
  item: GalleryFlatItem;
  openIndex: number;
  selected: boolean;
  layoutProfile?: GalleryLayoutProfile;
}>();

const emit = defineEmits<{
  open: [];
  "toggle-select": [];
  "copy-prompt": [];
  "add-source": [];
  download: [];
  "terminal-action": [];
}>();

const galleryKey = computed(() => `${props.item.jobId}:${props.item.slot}`);
const isActive = computed(() => isActiveJobStatus(props.item.jobStatus));
const terminalActionLabel = computed(() => (isActive.value ? "中断任务" : "删除图片"));
const hasPreview = computed(() => Boolean(props.item.previewSrc && props.item.previewSrc !== props.item.src));
const galleryClass = computed(() => [
  "gallery-item",
  {
    "is-selected": props.selected,
    "has-preview": hasPreview.value,
    "has-masonry-profile": Boolean(props.layoutProfile),
  },
  props.layoutProfile ? `is-${props.layoutProfile.variant}` : "",
  props.layoutProfile ? `shape-${props.layoutProfile.shape}` : "",
]);
const styleVars = computed(() => ({
  "--gallery-placeholder-color": props.item.placeholderColor || undefined,
  "--gallery-card-aspect-ratio": props.layoutProfile?.aspectRatio || undefined,
}));

const formattedTime = computed(() => {
  const value = props.item.updatedAt || props.item.createdAt || "";
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
});
const timeParts = computed(() => formattedTime.value.split(/\s+/, 2));
const dateText = computed(() => timeParts.value[0] || "--");
const clockText = computed(() => timeParts.value[1] || "");

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  emit("open");
}
</script>
