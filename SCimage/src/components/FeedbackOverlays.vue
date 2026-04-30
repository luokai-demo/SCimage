<template>
<div id="failurePopup" class="failure-popup" aria-live="assertive">
  <div class="failure-popup-card">
    <div class="failure-popup-title">任务失败</div>
    <div id="failurePopupPrompt" class="failure-popup-prompt"></div>
    <div id="failurePopupContent" class="failure-popup-content"></div>
    <div class="failure-popup-actions">
      <button type="button" id="failurePopupRetry" class="failure-popup-retry">重试</button>
      <button type="button" id="failurePopupDelete" class="failure-popup-delete">删除任务</button>
      <button type="button" id="failurePopupConfirm">确定</button>
    </div>
  </div>
</div>

<!-- Lightbox -->
<div class="lightbox" id="lightbox">
  <IconButton id="lightboxClose" class-name="lightbox-close" label="关闭预览">
    <X aria-hidden="true" />
  </IconButton>
  <div class="lightbox-zoom-toolbar" aria-label="图片缩放工具">
    <button type="button" id="lightboxZoomOut" aria-label="缩小图片" title="缩小">−</button>
    <span class="lightbox-zoom-value" id="lightboxZoomValue" aria-live="polite">100%</span>
    <button type="button" id="lightboxZoomIn" aria-label="放大图片" title="放大">+</button>
    <button type="button" id="lightboxZoomReset" aria-label="重置图片缩放" title="重置">1:1</button>
  </div>
  <IconButton id="lightboxPrev" class-name="lightbox-nav prev" label="上一张">
    <ChevronLeft aria-hidden="true" />
  </IconButton>
  <IconButton id="lightboxNext" class-name="lightbox-nav next" label="下一张">
    <ChevronRight aria-hidden="true" />
  </IconButton>
  <div class="lightbox-wrap">
    <img id="lightboxImg" src="" alt="">
    <div class="lightbox-overlay">
      <div class="prompt-full" id="lightboxPrompt"></div>
      <div class="lightbox-meta">
        <span class="lightbox-counter" id="lightboxCounter"></span>
        <div class="lightbox-actions">
          <button id="lightboxCopy">复制提示词</button>
          <button id="lightboxAddSource">作参考图</button>
          <button id="lightboxDl" type="button">下载</button>
          <button id="lightboxDel" class="lightbox-del-btn">删除</button>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import IconButton from "./ui/IconButton.vue";
</script>
