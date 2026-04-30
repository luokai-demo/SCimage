<template>
<!-- Right: Gallery -->
  <div class="gallery-area">
    <div class="gallery-page-drag-zone gallery-page-drag-zone-left" data-selection-drag-zone aria-hidden="true"></div>
    <div class="gallery-header" id="galleryHeader">
      <div class="gallery-page-drag-zone gallery-page-drag-zone-header" data-selection-drag-zone aria-hidden="true"></div>
      <div class="gallery-header-normal" id="galleryHeaderNormal">
        <div class="gallery-header-left">
          <span class="gallery-count" id="galleryCount"></span>
          <span id="fsDirStatus" style="display:none; color:var(--text-tertiary); font-size:11px;"></span>
        </div>
        <div class="gallery-actions-right">
          <div class="gallery-filter">
            <button class="active" data-gallery-filter="all">全部</button>
            <button data-gallery-filter="tasks">任务</button>
            <button data-gallery-filter="prompts">提示词</button>
          </div>
          <button class="gallery-sort-btn" id="sortBtn" title="排序">新→旧 ↓</button>
          <div class="settings-wrap">
            <IconButton id="settingsToggleBtn" class-name="settings-toggle" label="设置">
              <Settings aria-hidden="true" />
            </IconButton>
            <div class="settings-panel" id="settingsPanel">
              <span class="settings-info" id="storageMode">当前配置：载入中</span>
              <span class="settings-info" id="storageUsage">同步：自动刷新</span>
              <button id="refreshGalleryBtn">刷新</button>
              <button id="cleanupGeneratedBtn">清理空文件夹</button>
              <button id="clearSavedPromptsBtn">清空提示词</button>
              <hr>
              <button class="danger" id="resetFormStateBtn">重置表单</button>
            </div>
          </div>
        </div>
      </div>
      <div class="gallery-header-batch" id="galleryHeaderBatch" hidden>
        <div id="batchToolbar" class="batch-toolbar" hidden>
          <span id="batchCount">已选择 0 张</span>
          <span class="batch-hint">按住图库边缘空白拖拽可框选，单击边缘空白取消选择</span>
          <button id="batchDownloadBtn" type="button">下载</button>
          <button id="batchDeleteBtn" class="danger" type="button">删除</button>
          <button id="batchClearBtn" type="button">取消</button>
        </div>
      </div>
    </div>
    <RunningBanner />
    <div id="galleryWindowShell" class="gallery-window-shell">
      <div id="selectionBox" class="selection-box" hidden></div>
      <div id="galleryWindow" class="gallery-window">
        <div class="gallery-viewport-content">
          <div id="galleryGrid" class="gallery-grid"></div>
          <div id="galleryEmpty" class="gallery-empty">还没有图片</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Settings } from "lucide-vue-next";
import RunningBanner from "./jobs/RunningBanner.vue";
import IconButton from "./ui/IconButton.vue";
</script>
