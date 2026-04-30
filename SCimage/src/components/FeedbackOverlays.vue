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
        @click="runtime.jobAction(runtime.failurePopup.jobId, 'retry')"
      >重试</button>
      <button
        type="button"
        id="failurePopupDelete"
        class="failure-popup-delete"
        @click="runtime.jobAction(runtime.failurePopup.jobId, 'delete')"
      >删除任务</button>
      <button type="button" id="failurePopupConfirm" @click="runtime.closeFailurePopup">确定</button>
    </div>
  </div>
</div>

<!-- Lightbox -->
<div :class="['lightbox', { open: runtime.lightbox.open }]" id="lightbox" @click.self="runtime.closeLightbox">
  <IconButton id="lightboxClose" class-name="lightbox-close" label="关闭预览" @click="runtime.closeLightbox">
    <X aria-hidden="true" />
  </IconButton>
  <div class="lightbox-zoom-toolbar" aria-label="图片缩放工具">
    <button type="button" id="lightboxZoomOut" aria-label="缩小图片" title="缩小" @click="zoomBy(-0.25)">−</button>
    <span class="lightbox-zoom-value" id="lightboxZoomValue" aria-live="polite">{{ Math.round(runtime.lightbox.zoom * 100) }}%</span>
    <button type="button" id="lightboxZoomIn" aria-label="放大图片" title="放大" @click="zoomBy(0.25)">+</button>
    <button type="button" id="lightboxZoomReset" aria-label="重置图片缩放" title="重置" @click="resetZoom">1:1</button>
  </div>
  <IconButton id="lightboxPrev" class-name="lightbox-nav prev" label="上一张" @click="runtime.navLightbox(-1)">
    <ChevronLeft aria-hidden="true" />
  </IconButton>
  <IconButton id="lightboxNext" class-name="lightbox-nav next" label="下一张" @click="runtime.navLightbox(1)">
    <ChevronRight aria-hidden="true" />
  </IconButton>
  <div :class="['lightbox-wrap', { 'is-zoomed': runtime.lightbox.zoom > 1 }]">
    <img
      id="lightboxImg"
      :src="runtime.currentLightboxItem.value?.src || ''"
      alt=""
      :style="{ transform: `translate(${runtime.lightbox.panX}px, ${runtime.lightbox.panY}px) scale(${runtime.lightbox.zoom})` }"
    >
    <div class="lightbox-overlay">
      <div class="prompt-full" id="lightboxPrompt">{{ runtime.currentLightboxItem.value?.prompt || "" }}</div>
      <div class="lightbox-meta">
        <span class="lightbox-counter" id="lightboxCounter">{{ runtime.lightbox.index + 1 }} / {{ runtime.galleryStore.flatItems.length }}</span>
        <div class="lightbox-actions">
          <button id="lightboxCopy" @click="copyPrompt">复制提示词</button>
          <button id="lightboxAddSource" @click="addSource">作参考图</button>
          <button id="lightboxDl" type="button" @click="download">下载</button>
          <button id="lightboxDel" class="lightbox-del-btn" @click="deleteImage">删除</button>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import { onMounted, onUnmounted } from "vue";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import IconButton from "./ui/IconButton.vue";

const runtime = useScimageRuntime();

function zoomBy(delta: number) {
  runtime.lightbox.zoom = Math.max(1, Math.min(4, runtime.lightbox.zoom + delta));
}

function resetZoom() {
  runtime.lightbox.zoom = 1;
  runtime.lightbox.panX = 0;
  runtime.lightbox.panY = 0;
}

async function copyPrompt() {
  await navigator.clipboard?.writeText(runtime.currentLightboxItem.value?.prompt || "");
}

function addSource() {
  const item = runtime.currentLightboxItem;
  if (item.value) void runtime.addSourceImageFromGallery(item.value);
}

function download() {
  const item = runtime.currentLightboxItem;
  if (item.value) void runtime.downloadItem(item.value);
}

function deleteImage() {
  const item = runtime.currentLightboxItem;
  if (item.value) void runtime.deleteImage(item.value.jobId, item.value.slot);
}

function onKeydown(event: KeyboardEvent) {
  if (!runtime.lightbox.open) return;
  if (event.key === "Escape") runtime.closeLightbox();
  if (event.key === "ArrowLeft") runtime.navLightbox(-1);
  if (event.key === "ArrowRight") runtime.navLightbox(1);
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>
