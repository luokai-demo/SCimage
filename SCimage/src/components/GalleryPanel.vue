<template>
<!-- Right: Gallery -->
  <div class="gallery-area">
    <div class="gallery-page-drag-zone gallery-page-drag-zone-left" data-selection-drag-zone aria-hidden="true" @pointerdown="startEdgeSelection"></div>
    <div class="gallery-header" id="galleryHeader">
      <div class="gallery-page-drag-zone gallery-page-drag-zone-header" data-selection-drag-zone aria-hidden="true" @pointerdown="startEdgeSelection"></div>
      <div class="gallery-header-normal" id="galleryHeaderNormal">
        <div class="gallery-header-left">
          <span class="gallery-count" id="galleryCount">{{ galleryCountText }}</span>
          <span v-if="jobStore.runningCount" id="fsDirStatus" style="color:var(--text-tertiary); font-size:11px;">{{ jobStore.runningCount }} 个任务进行中</span>
        </div>
        <div class="gallery-actions-right">
          <div class="gallery-filter">
            <button :class="{ active: galleryStore.filter === 'all' }" data-gallery-filter="all" @click="runtime.setGalleryFilter('all')">全部</button>
            <button :class="{ active: galleryStore.filter === 'tasks' }" data-gallery-filter="tasks" @click="runtime.setGalleryFilter('tasks')">任务</button>
            <button :class="{ active: galleryStore.filter === 'prompts' }" data-gallery-filter="prompts" @click="runtime.setGalleryFilter('prompts')">提示词</button>
          </div>
          <button class="gallery-sort-btn" id="sortBtn" title="排序" @click="runtime.toggleSort">
            <span>{{ galleryStore.sortAsc ? "旧到新" : "新到旧" }}</span>
            <ArrowUpDown aria-hidden="true" />
          </button>
          <div class="settings-wrap">
            <IconButton id="settingsToggleBtn" class-name="settings-toggle" label="设置" @click="settingsOpen = !settingsOpen">
              <Settings aria-hidden="true" />
            </IconButton>
            <div v-show="settingsOpen" class="settings-panel open" id="settingsPanel">
              <span class="settings-info" id="storageMode">当前配置：{{ providerStore.activeProfile?.name || "未设置" }}</span>
              <span class="settings-info" id="storageUsage">{{ syncText }}</span>
              <button id="refreshGalleryBtn" @click="runtime.refreshJobs({ manual: true })">刷新</button>
              <button id="cleanupGeneratedBtn" @click="runtime.cleanupEmptyGeneratedDirs">清理空文件夹</button>
              <button id="clearSavedPromptsBtn" @click="runtime.clearPrompts">清空提示词</button>
              <hr>
              <button class="danger" id="resetFormStateBtn" @click="resetForm">重置表单</button>
            </div>
          </div>
        </div>
      </div>
      <div class="gallery-header-batch" id="galleryHeaderBatch" :hidden="!galleryStore.selectedCount">
        <div id="batchToolbar" class="batch-toolbar" :hidden="!galleryStore.selectedCount">
          <span id="batchCount">已选择 {{ galleryStore.selectedCount }} 张</span>
          <span class="batch-hint">按住图库边缘空白拖拽可框选，单击边缘空白取消选择</span>
          <button id="batchDownloadBtn" type="button" @click="runtime.batchDownload">下载</button>
          <button id="batchDeleteBtn" class="danger" type="button" @click="runtime.batchDelete">删除</button>
          <button id="batchClearBtn" type="button" @click="runtime.clearSelection">取消</button>
        </div>
      </div>
    </div>
    <RunningBanner />
    <div id="galleryWindowShell" class="gallery-window-shell">
      <div id="selectionBox" class="selection-box" :hidden="!selectionBox.visible" :style="selectionBoxStyle"></div>
      <div id="galleryWindow" class="gallery-window" @scroll="onGalleryScroll">
        <div class="gallery-viewport-content">
          <div
            id="galleryGrid"
            ref="galleryGridRef"
            :class="['gallery-grid', { 'grouped-by-task': galleryStore.filter !== 'all' }]"
            :style="galleryGridStyle"
          >
            <template v-if="galleryStore.filter === 'all'">
              <div v-for="(column, columnIndex) in galleryColumns" :key="`gallery-column-${columnIndex}`" class="gallery-column">
                <div
                  v-for="item in column"
                  :key="`${item.jobId}:${item.slot}`"
                  :class="['gallery-item', 'is-loaded', { 'is-selected': isSelected(item) }]"
                  :data-gallery-key="`${item.jobId}:${item.slot}`"
                  :data-open-lightbox="itemIndex(item)"
                  :data-job-id="item.jobId"
                  :data-image-slot="item.slot"
                  @click="runtime.openLightbox(itemIndex(item))"
                >
                  <button type="button" class="gallery-select-btn" @click.stop="runtime.toggleSelection(item)">✓</button>
                  <img :src="item.src" :alt="item.prompt" loading="lazy">
                  <div class="gallery-overlay">
                    <div class="prompt-preview">{{ item.prompt }}</div>
                    <div class="meta-row">
                      <span class="meta-actions">
                        <button type="button" @click.stop="copyPrompt(item.prompt)">复制</button>
                        <button type="button" @click.stop="runtime.addSourceImageFromGallery(item)">参考</button>
                        <button type="button" @click.stop="runtime.downloadItem(item)">下载</button>
                        <button type="button" class="gallery-del-btn" @click.stop="runtime.deleteImage(item.jobId, item.slot)">删除</button>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <section v-for="group in galleryGroups.grouped.value" :key="group.id" class="gallery-task-section">
                <div class="gallery-task-section-info">
                  <div class="gallery-task-section-eyebrow">{{ galleryStore.filter === 'tasks' ? '任务' : '提示词' }}</div>
                  <div class="gallery-task-section-title" :title="group.title">{{ group.title }}</div>
                  <div v-if="galleryStore.filter === 'tasks'" class="gallery-task-section-summary" :title="group.summary">{{ group.summary }}</div>
                  <div class="gallery-task-section-meta">{{ group.meta }}</div>
                </div>
                <div class="gallery-task-section-grid" :style="galleryGridStyle">
                  <div v-for="(column, columnIndex) in distributeColumns(group.items)" :key="`${group.id}-column-${columnIndex}`" class="gallery-column">
                    <div
                      v-for="item in column"
                      :key="`${item.jobId}:${item.slot}`"
                      :class="['gallery-item', 'is-loaded', { 'is-selected': isSelected(item) }]"
                      :data-gallery-key="`${item.jobId}:${item.slot}`"
                      :data-open-lightbox="itemIndex(item)"
                      :data-job-id="item.jobId"
                      :data-image-slot="item.slot"
                      @click="runtime.openLightbox(itemIndex(item))"
                    >
                      <button type="button" class="gallery-select-btn" @click.stop="runtime.toggleSelection(item)">✓</button>
                      <img :src="item.src" :alt="item.prompt" loading="lazy">
                      <div class="gallery-overlay">
                        <div class="prompt-preview">{{ item.prompt }}</div>
                        <div class="meta-row">
                          <span class="meta-actions">
                            <button type="button" @click.stop="copyPrompt(item.prompt)">复制</button>
                            <button type="button" @click.stop="runtime.addSourceImageFromGallery(item)">参考</button>
                            <button type="button" @click.stop="runtime.downloadItem(item)">下载</button>
                            <button type="button" class="gallery-del-btn" @click.stop="runtime.deleteImage(item.jobId, item.slot)">删除</button>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </template>
          </div>
          <div v-show="!runtime.visibleGalleryItems.value.length" id="galleryEmpty" class="gallery-empty">还没有图片</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ArrowUpDown, Settings } from "lucide-vue-next";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import { useGalleryGroups } from "../composables/useGalleryGroups";
import type { GalleryFlatItem } from "../stores/gallery";
import RunningBanner from "./jobs/RunningBanner.vue";
import IconButton from "./ui/IconButton.vue";

const runtime = useScimageRuntime();
const galleryStore = runtime.galleryStore;
const jobStore = runtime.jobStore;
const providerStore = runtime.providerStore;
const settingsOpen = ref(false);
const galleryGridRef = ref<HTMLElement | null>(null);
const galleryGroups = useGalleryGroups(runtime.visibleGalleryItems, computed(() => galleryStore.filter));
const galleryColumnCount = ref(4);
const selectionStart = reactive({ x: 0, y: 0, active: false });
const selectionBox = reactive({ visible: false, left: 0, top: 0, width: 0, height: 0 });
let gridResizeObserver: ResizeObserver | null = null;
let layoutFrame = 0;

const galleryCountText = computed(() => {
  const count = runtime.visibleGalleryItems.value.length;
  const total = Number(galleryStore.pagination.total || count);
  return total > count ? `${count}/${total} 张图片` : `${count} 张图片`;
});

const syncText = computed(() => {
  if (jobStore.lastSyncError) return `同步失败：${jobStore.lastSyncError}`;
  if (jobStore.lastSyncAt) return `最后同步：${new Date(jobStore.lastSyncAt).toLocaleTimeString()}`;
  return "同步：自动刷新";
});

const selectionBoxStyle = computed(() => ({
  left: `${selectionBox.left}px`,
  top: `${selectionBox.top}px`,
  width: `${selectionBox.width}px`,
  height: `${selectionBox.height}px`,
}));

const galleryGridStyle = computed(() => ({
  "--gallery-columns": String(galleryColumnCount.value),
}));

const galleryColumns = computed(() => distributeColumns(runtime.visibleGalleryItems.value));

function isSelected(item: GalleryFlatItem) {
  return galleryStore.selectedKeys.has(`${item.jobId}:${item.slot}`);
}

function itemIndex(item: GalleryFlatItem) {
  return galleryGroups.itemIndexByKey.value.get(`${item.jobId}:${item.slot}`) ?? 0;
}

function distributeColumns(items: GalleryFlatItem[]) {
  const columns = Array.from({ length: galleryColumnCount.value }, () => [] as GalleryFlatItem[]);
  items.forEach((item, index) => {
    columns[index % galleryColumnCount.value].push(item);
  });
  return columns;
}

function startEdgeSelection(event: PointerEvent) {
  if (galleryStore.selectedCount && event.detail <= 1) {
    runtime.clearSelection();
  }
  selectionStart.x = event.clientX;
  selectionStart.y = event.clientY;
  selectionStart.active = true;
  selectionBox.visible = true;
  updateSelectionBox(event.clientX, event.clientY);
  window.addEventListener("pointermove", onSelectionMove);
  window.addEventListener("pointerup", finishSelection, { once: true });
}

function updateSelectionBox(x: number, y: number) {
  selectionBox.left = Math.min(selectionStart.x, x);
  selectionBox.top = Math.min(selectionStart.y, y);
  selectionBox.width = Math.abs(x - selectionStart.x);
  selectionBox.height = Math.abs(y - selectionStart.y);
}

function onSelectionMove(event: PointerEvent) {
  if (!selectionStart.active) return;
  updateSelectionBox(event.clientX, event.clientY);
}

function finishSelection() {
  window.removeEventListener("pointermove", onSelectionMove);
  selectionStart.active = false;
  const rect = new DOMRect(selectionBox.left, selectionBox.top, selectionBox.width, selectionBox.height);
  if (selectionBox.width > 8 && selectionBox.height > 8) runtime.selectByRect(rect);
  selectionBox.visible = false;
}

function onGalleryScroll(event: Event) {
  const target = event.currentTarget as HTMLElement;
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (remaining <= 900) void runtime.loadMoreGallery();
}

async function copyPrompt(prompt: string) {
  await navigator.clipboard?.writeText(prompt);
}

function resetForm() {
  runtime.currentWorkflowForm.value.prompt = "";
  runtime.currentWorkflowForm.value.count = "1";
  runtime.currentWorkflowForm.value.size = "auto";
  runtime.currentWorkflowForm.value.quality = "auto";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function updateGalleryColumns() {
  const grid = galleryGridRef.value;
  if (!grid) return;
  const gapPx = 12;
  const targetColumnWidth = 176;
  const width = grid.clientWidth;
  if (!width) return;
  const columns = clamp(Math.floor((width + gapPx) / (targetColumnWidth + gapPx)), 1, 8);
  galleryColumnCount.value = columns;
  grid.style.setProperty("--gallery-columns", String(columns));
  grid.style.setProperty("--gallery-task-columns", String(columns));
  grid.style.setProperty("--gallery-grid-gap", `${gapPx}px`);
}

function scheduleGalleryColumnsUpdate() {
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    updateGalleryColumns();
  });
}

onMounted(() => {
  nextTick(() => {
    updateGalleryColumns();
    if (typeof ResizeObserver === "function" && galleryGridRef.value) {
      gridResizeObserver = new ResizeObserver(scheduleGalleryColumnsUpdate);
      gridResizeObserver.observe(galleryGridRef.value);
    }
    window.addEventListener("resize", scheduleGalleryColumnsUpdate);
  });
});

onBeforeUnmount(() => {
  gridResizeObserver?.disconnect();
  gridResizeObserver = null;
  window.removeEventListener("resize", scheduleGalleryColumnsUpdate);
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
});

watch(() => runtime.visibleGalleryItems.value.length, () => nextTick(scheduleGalleryColumnsUpdate));
watch(() => galleryStore.filter, () => nextTick(scheduleGalleryColumnsUpdate));
watch(() => runtime.workspaceStore.isPanelCollapsed, () => nextTick(scheduleGalleryColumnsUpdate));
</script>
