<template>
<div id="failurePopup" :class="['failure-popup', { open: runtime.failurePopup.open }]" aria-live="assertive">
  <div class="failure-popup-card">
    <div class="failure-popup-title">任务失败</div>
    <div id="failurePopupPrompt" class="failure-popup-prompt">{{ runtime.failurePopup.prompt || "未提供提示词" }}</div>
    <div id="failurePopupContent" class="failure-popup-content">{{ runtime.failurePopup.message }}</div>
    <div class="failure-popup-actions">
      <button
        v-if="runtime.failurePopup.retryable"
        type="button"
        id="failurePopupRetry"
        class="failure-popup-retry"
        :disabled="runtime.busyJobIds.value.has(runtime.failurePopup.jobId)"
        @click="runtime.jobAction(runtime.failurePopup.jobId, 'retry')"
      >重试</button>
      <button
        type="button"
        id="failurePopupDelete"
        class="failure-popup-delete"
        :disabled="runtime.busyJobIds.value.has(runtime.failurePopup.jobId)"
        @click="runtime.jobAction(runtime.failurePopup.jobId, 'delete')"
      >删除任务</button>
      <button type="button" id="failurePopupConfirm" @click="runtime.closeFailurePopup">确定</button>
    </div>
  </div>
</div>

<!-- Lightbox -->
<div
  :class="['lightbox', { open: runtime.lightbox.open }]"
  id="lightbox"
  role="dialog"
  aria-modal="true"
  aria-label="图片预览"
  @click.self="runtime.closeLightbox"
>
  <IconButton id="lightboxClose" class-name="lightbox-close" label="关闭预览" @click="runtime.closeLightbox">
    <X aria-hidden="true" />
  </IconButton>
  <div class="lightbox-zoom-toolbar" aria-label="图片缩放工具">
    <button type="button" id="lightboxZoomOut" aria-label="缩小图片" title="缩小" :disabled="runtime.lightbox.zoom <= 1" @click.stop="zoomBy(-0.25)">−</button>
    <span class="lightbox-zoom-value" id="lightboxZoomValue" aria-live="polite">{{ Math.round(runtime.lightbox.zoom * 100) }}%</span>
    <button type="button" id="lightboxZoomIn" aria-label="放大图片" title="放大" :disabled="runtime.lightbox.zoom >= LIGHTBOX_ZOOM_MAX" @click.stop="zoomBy(0.25)">+</button>
    <button type="button" id="lightboxZoomReset" aria-label="重置图片缩放" title="重置" :disabled="runtime.lightbox.zoom <= 1" @click.stop="resetZoom">1:1</button>
  </div>
  <IconButton id="lightboxPrev" class-name="lightbox-nav prev" label="上一张" :disabled="runtime.lightbox.index <= 0" @click="runtime.navLightbox(-1)">
    <ChevronLeft aria-hidden="true" />
  </IconButton>
  <IconButton id="lightboxNext" class-name="lightbox-nav next" label="下一张" :disabled="runtime.lightbox.index >= runtime.galleryStore.flatItems.length - 1" @click="runtime.navLightbox(1)">
    <ChevronRight aria-hidden="true" />
  </IconButton>
  <div :class="['lightbox-wrap', { 'is-zoomed': runtime.lightbox.zoom > 1, 'is-dragging': runtime.lightbox.dragging }]">
    <img
      id="lightboxImg"
      :src="runtime.currentLightboxItem.value?.src || ''"
      alt=""
      :style="{ transform: `translate(${runtime.lightbox.panX}px, ${runtime.lightbox.panY}px) scale(${runtime.lightbox.zoom})` }"
      @wheel.prevent="onWheel"
      @dblclick.prevent.stop="toggleZoom"
      @pointerdown="startPan"
      @pointermove="updatePan"
      @pointerup="stopPan"
      @pointercancel="stopPan"
      @dragstart.prevent
    >
    <div class="lightbox-overlay">
      <div :class="['prompt-full', { expanded: promptExpanded }]" id="lightboxPrompt" @click.stop="promptExpanded = !promptExpanded">{{ runtime.currentLightboxItem.value?.prompt || "" }}</div>
      <div class="lightbox-meta">
        <span class="lightbox-counter" id="lightboxCounter">{{ runtime.lightbox.index + 1 }} / {{ runtime.galleryStore.flatItems.length }}</span>
        <div class="lightbox-actions">
          <button id="lightboxCopy" @click.stop="copyPrompt">{{ copyLabel }}</button>
          <button id="lightboxAddSource" :disabled="sourceBusy" @click.stop="addSource">作参考图</button>
          <button id="lightboxDl" type="button" :disabled="downloadBusy" @click.stop="download">下载</button>
          <button id="lightboxDel" class="lightbox-del-btn" @click.stop="deleteImage">{{ deleteLabel }}</button>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import { copyTextToClipboard } from "../utils/clipboard";
import IconButton from "./ui/IconButton.vue";

const runtime = useScimageRuntime();
const LIGHTBOX_ZOOM_MAX = 5;
const promptExpanded = ref(false);
const copyLabel = ref("复制提示词");
const sourceBusy = ref(false);
const downloadBusy = ref(false);
const currentJob = computed(() => {
  const item = runtime.currentLightboxItem.value;
  if (!item) return null;
  return runtime.jobStore.jobs.find((job) => String(job.id || "") === item.jobId) || null;
});
const deleteLabel = computed(() => (
  currentJob.value && runtime.isActiveStatus(String(currentJob.value.status || "")) ? "中断任务" : "删除图片"
));

function zoomBy(delta: number) {
  runtime.lightbox.zoom = Math.max(1, Math.min(LIGHTBOX_ZOOM_MAX, runtime.lightbox.zoom + delta));
}

function resetZoom() {
  runtime.lightbox.zoom = 1;
  runtime.lightbox.panX = 0;
  runtime.lightbox.panY = 0;
}

async function copyPrompt() {
  const copied = await copyTextToClipboard(runtime.currentLightboxItem.value?.prompt || "");
  if (copied) {
    copyLabel.value = "已复制";
    window.setTimeout(() => {
      copyLabel.value = "复制提示词";
    }, 1200);
    return;
  }
  runtime.setStatus("error", "无法复制到剪贴板。", 2500);
}

async function addSource() {
  const item = runtime.currentLightboxItem;
  if (!item.value) return;
  sourceBusy.value = true;
  try {
    await runtime.addSourceImageFromGallery(item.value);
  } finally {
    sourceBusy.value = false;
  }
}

async function download() {
  const item = runtime.currentLightboxItem;
  if (!item.value) return;
  downloadBusy.value = true;
  try {
    await runtime.downloadItem(item.value);
  } finally {
    downloadBusy.value = false;
  }
}

function deleteImage() {
  void runtime.deleteLightboxItem();
}

function onWheel(event: WheelEvent) {
  zoomBy(event.deltaY < 0 ? 0.25 : -0.25);
}

function toggleZoom() {
  if (runtime.lightbox.zoom > 1) resetZoom();
  else runtime.lightbox.zoom = 2;
}

function startPan(event: PointerEvent) {
  if (runtime.lightbox.zoom <= 1 || event.button !== 0) return;
  event.preventDefault();
  runtime.lightbox.dragging = true;
  runtime.lightbox.dragStartX = event.clientX;
  runtime.lightbox.dragStartY = event.clientY;
  runtime.lightbox.startPanX = runtime.lightbox.panX;
  runtime.lightbox.startPanY = runtime.lightbox.panY;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function updatePan(event: PointerEvent) {
  if (!runtime.lightbox.dragging) return;
  event.preventDefault();
  runtime.lightbox.panX = runtime.lightbox.startPanX + event.clientX - runtime.lightbox.dragStartX;
  runtime.lightbox.panY = runtime.lightbox.startPanY + event.clientY - runtime.lightbox.dragStartY;
}

function stopPan(event: PointerEvent) {
  if (!runtime.lightbox.dragging) return;
  runtime.lightbox.dragging = false;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
}

function onKeydown(event: KeyboardEvent) {
  if (!runtime.lightbox.open) return;
  if (event.key === "Escape") runtime.closeLightbox();
  if (event.key === "ArrowLeft") runtime.navLightbox(-1);
  if (event.key === "ArrowRight") runtime.navLightbox(1);
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomBy(0.25);
  }
  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    zoomBy(-0.25);
  }
  if (event.key === "0") {
    event.preventDefault();
    resetZoom();
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

watch(() => runtime.lightbox.index, () => {
  promptExpanded.value = false;
  copyLabel.value = "复制提示词";
});
</script>
