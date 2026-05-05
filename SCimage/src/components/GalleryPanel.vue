<template>
<!-- Right: Gallery -->
  <div class="gallery-area">
    <div class="gallery-page-drag-zone gallery-page-drag-zone-left" data-selection-drag-zone aria-hidden="true" @pointerdown="startEdgeSelection"></div>
    <div class="gallery-header" id="galleryHeader">
      <div class="gallery-page-drag-zone gallery-page-drag-zone-header" data-selection-drag-zone aria-hidden="true" @pointerdown="startEdgeSelection"></div>
      <div class="gallery-header-normal" id="galleryHeaderNormal">
        <div class="gallery-header-left">
          <span class="gallery-count" id="galleryCount">{{ galleryCountText }}</span>
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
              <button id="cleanupGeneratedBtn" :disabled="runtime.isCleaningGeneratedDirs.value" @click="runtime.cleanupEmptyGeneratedDirs">
                {{ runtime.isCleaningGeneratedDirs.value ? "清理中..." : "清理空文件夹" }}
              </button>
              <button id="clearSavedPromptsBtn" @click="runtime.clearPrompts">清空提示词</button>
              <hr>
              <button class="danger" id="resetFormStateBtn" @click="runtime.resetFormState">重置表单</button>
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
    <div id="galleryWindowShell" class="gallery-window-shell">
      <div id="selectionBox" class="selection-box" :hidden="!selectionBox.visible" :style="selectionBoxStyle"></div>
      <div id="galleryWindow" ref="galleryWindowRef" class="gallery-window" @scroll="onGalleryScroll">
        <div class="gallery-viewport-content">
          <div
            id="galleryGrid"
            ref="galleryGridRef"
            :class="['gallery-grid', { 'grouped-by-task': galleryStore.filter !== 'all', 'is-virtualized': galleryStore.filter === 'all' }]"
            :style="galleryGridStyle"
          >
            <template v-if="galleryStore.filter === 'all'">
              <div
                v-for="record in visibleGalleryRecords"
                :key="record.key"
                class="gallery-virtual-item"
                :style="galleryRecordStyle(record)"
              >
                <GalleryImageCard
                  :item="record.item"
                  :layout-profile="record.profile"
                  :open-index="record.index"
                  :selected="isSelected(record.item)"
                  @open="runtime.openLightbox(record.index)"
                  @toggle-select="runtime.toggleSelection(record.item)"
                  @copy-prompt="copyPrompt(record.item.prompt)"
                  @add-source="runtime.addSourceImageFromGallery(record.item)"
                  @download="runtime.downloadItem(record.item)"
                  @terminal-action="runtime.resolveGalleryTerminalAction(record.item)"
                />
              </div>
            </template>
            <template v-else>
              <section v-for="group in galleryGroups.grouped.value" :key="group.id" class="gallery-job-section">
                <div class="gallery-job-section-info">
                  <div class="gallery-job-section-eyebrow">{{ galleryStore.filter === 'tasks' ? '任务' : '提示词' }}</div>
                  <div class="gallery-job-section-title" :title="group.title">{{ group.title }}</div>
                  <div v-if="galleryStore.filter === 'tasks'" class="gallery-job-section-summary" :title="group.summary">{{ group.summary }}</div>
                  <div class="gallery-job-section-meta">{{ group.meta }}</div>
                </div>
                <div class="gallery-job-section-grid" :style="galleryGridStyle">
                  <div v-for="(column, columnIndex) in distributeColumns(group.items)" :key="`${group.id}-column-${columnIndex}`" class="gallery-column">
                    <GalleryImageCard
                      v-for="item in column"
                      :key="`${item.jobId}:${item.slot}`"
                      :item="item"
                      :layout-profile="groupedProfileByKey.get(imageKey(item))"
                      :open-index="itemIndex(item)"
                      :selected="isSelected(item)"
                      @open="runtime.openLightbox(itemIndex(item))"
                      @toggle-select="runtime.toggleSelection(item)"
                      @copy-prompt="copyPrompt(item.prompt)"
                      @add-source="runtime.addSourceImageFromGallery(item)"
                      @download="runtime.downloadItem(item)"
                      @terminal-action="runtime.resolveGalleryTerminalAction(item)"
                    />
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
import { copyTextToClipboard } from "../utils/clipboard";
import {
  buildGalleryMasonryLayout,
  filterVisibleGalleryItems,
  warmGalleryImages,
  type GalleryLayoutItem,
} from "../utils/galleryLayout";
import { imageKey } from "../utils/galleryKeys";
import GalleryImageCard from "./gallery/GalleryImageCard.vue";
import IconButton from "./ui/IconButton.vue";

const runtime = useScimageRuntime();
const galleryStore = runtime.galleryStore;
const jobStore = runtime.jobStore;
const providerStore = runtime.providerStore;
const settingsOpen = ref(false);
const galleryGridRef = ref<HTMLElement | null>(null);
const galleryWindowRef = ref<HTMLElement | null>(null);
const galleryGroups = useGalleryGroups(runtime.visibleGalleryItems, computed(() => galleryStore.filter));
const galleryColumnCount = ref(4);
const galleryContainerWidth = ref(0);
const galleryScrollTop = ref(0);
const galleryViewportHeight = ref(1);
const selectionStart = reactive({ x: 0, y: 0, active: false });
const selectionBox = reactive({ visible: false, left: 0, top: 0, width: 0, height: 0 });
let gridResizeObserver: ResizeObserver | null = null;
let layoutFrame = 0;

const galleryCountText = computed(() => {
  const count = runtime.visibleGalleryItems.value.length;
  if (!count) return "";
  const total = Number(galleryStore.pagination.total || count);
  const loadedText = total > count ? `已加载 ${count}/${total} 张` : `${count} 张图片`;
  if (galleryStore.filter === "tasks") {
    return `${galleryGroups.grouped.value.length} 个可见任务 · ${count} 张 · ${loadedText}`;
  }
  if (galleryStore.filter === "prompts") {
    return `${galleryGroups.grouped.value.length} 组提示词 · ${count} 张 · ${loadedText}`;
  }
  return total > count ? `${count}/${total} 张图片` : loadedText;
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
  "--gallery-virtual-height": `${Math.ceil(galleryLayout.value.totalHeight)}px`,
}));

const galleryLayout = computed(() => buildGalleryMasonryLayout(runtime.visibleGalleryItems.value, {
  containerWidth: galleryContainerWidth.value,
  targetColumnWidth: 176,
  minColumns: 1,
  maxColumns: 8,
  gapPx: 12,
  allowFeatured: galleryStore.filter === "all",
}));

const visibleGalleryRecords = computed(() => (
  filterVisibleGalleryItems(galleryLayout.value.items, {
    scrollTop: galleryScrollTop.value,
    viewportHeight: galleryViewportHeight.value,
    overscanScreens: 1.25,
  })
));

const groupedProfileByKey = computed(() => {
  const layout = buildGalleryMasonryLayout(runtime.visibleGalleryItems.value, {
    containerWidth: galleryContainerWidth.value,
    targetColumnWidth: 176,
    minColumns: 1,
    maxColumns: 8,
    gapPx: 12,
    allowFeatured: false,
  });
  return new Map(layout.items.map((record) => [record.key, record.profile]));
});

function isSelected(item: GalleryFlatItem) {
  return galleryStore.selectedKeys.has(imageKey(item));
}

function itemIndex(item: GalleryFlatItem) {
  return galleryGroups.itemIndexByKey.value.get(imageKey(item)) ?? 0;
}

function galleryRecordStyle(record: GalleryLayoutItem) {
  return {
    transform: `translate3d(${Math.round(record.x)}px, ${Math.round(record.y)}px, 0)`,
    width: `${Math.round(record.width)}px`,
    height: `${Math.round(record.height)}px`,
    "--gallery-column-span": String(record.columnSpan),
  };
}

function distributeColumns(items: GalleryFlatItem[]) {
  const columns = Array.from({ length: galleryColumnCount.value }, () => [] as GalleryFlatItem[]);
  const byKey = new Map(groupedProfileByKey.value);
  const sorted = items.map((item) => {
    const key = imageKey(item);
    const profile = byKey.get(key);
    const ratio = profile?.heightRatio || (item.width && item.height ? item.height / item.width : 1);
    return { item, ratio };
  });
  const heights = Array.from({ length: galleryColumnCount.value }, () => 0);
  sorted.forEach(({ item, ratio }) => {
    const columnIndex = heights.reduce((bestIndex, height, index) => (
      height < heights[bestIndex] ? index : bestIndex
    ), 0);
    columns[columnIndex].push(item);
    heights[columnIndex] += Math.max(0.5, ratio);
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
  galleryScrollTop.value = target.scrollTop || 0;
  galleryViewportHeight.value = target.clientHeight || 1;
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (remaining <= 900) void runtime.loadMoreGallery();
}

async function copyPrompt(prompt: string) {
  const copied = await copyTextToClipboard(prompt);
  runtime.setStatus(copied ? "success" : "error", copied ? "提示词已复制。" : "无法复制到剪贴板。", copied ? 1200 : 2500);
}

function closeSettingsPanel() {
  settingsOpen.value = false;
}

function onDocumentClick(event: MouseEvent) {
  if (!settingsOpen.value) return;
  const target = event.target as HTMLElement;
  if (target.closest(".settings-wrap")) return;
  closeSettingsPanel();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeSettingsPanel();
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
  galleryContainerWidth.value = width;
  grid.style.setProperty("--gallery-columns", String(columns));
  grid.style.setProperty("--gallery-grid-gap", `${gapPx}px`);
  const windowNode = galleryWindowRef.value;
  if (windowNode) {
    galleryScrollTop.value = windowNode.scrollTop || 0;
    galleryViewportHeight.value = windowNode.clientHeight || 1;
  }
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
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeydown);
  });
});

onBeforeUnmount(() => {
  gridResizeObserver?.disconnect();
  gridResizeObserver = null;
  window.removeEventListener("resize", scheduleGalleryColumnsUpdate);
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
});

watch(() => runtime.visibleGalleryItems.value.length, () => nextTick(scheduleGalleryColumnsUpdate));
watch(() => runtime.visibleGalleryItems.value, (items) => warmGalleryImages(items), { immediate: true });
watch(() => galleryStore.filter, () => nextTick(scheduleGalleryColumnsUpdate));
watch(() => runtime.workspaceStore.isPanelCollapsed, () => nextTick(scheduleGalleryColumnsUpdate));
</script>
