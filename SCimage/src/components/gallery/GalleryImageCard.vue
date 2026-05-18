<template>
  <div
    :class="galleryClass"
    :style="styleVars"
    :data-gallery-key="view.galleryKey"
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
    <img class="gallery-image" :src="item.src" :alt="item.prompt" :width="item.width" :height="item.height" loading="lazy">
    <div class="gallery-overlay">
      <div class="prompt-preview">{{ item.prompt }}</div>
      <div class="meta-row">
        <span class="time" :aria-label="`生成时间 ${formattedTime}`">
          <span class="time-date">{{ view.dateText }}</span>
          <span class="time-clock">{{ view.clockText }}</span>
        </span>
        <span class="meta-actions">
          <button type="button" @click.stop="$emit('copy-prompt')">复制</button>
          <button type="button" @click.stop="$emit('add-source')">参考</button>
          <button type="button" @click.stop="$emit('download')">下载</button>
          <button
            type="button"
            :class="{ 'gallery-del-btn': !view.isActive }"
            :aria-label="view.terminalActionLabel"
            :title="view.terminalActionLabel"
            @click.stop="$emit('terminal-action')"
          >{{ view.terminalActionText }}</button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { GalleryFlatItem } from "../../stores/gallery";
import type { GalleryLayoutProfile } from "../../utils/galleryLayout";
import { createGalleryItemViewModel } from "../../utils/galleryItemViewModel";

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

const view = computed(() => createGalleryItemViewModel(props.item, {
  layoutProfile: props.layoutProfile,
  selected: props.selected,
}));
const galleryClass = computed(() => view.value.classNames);
const styleVars = computed(() => view.value.styleVars);
const formattedTime = computed(() => view.value.formattedTime);

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  emit("open");
}
</script>
