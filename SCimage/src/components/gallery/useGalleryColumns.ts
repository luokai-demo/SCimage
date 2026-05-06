import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { GalleryFlatItem } from "../../stores/gallery";
import {
  buildGalleryMasonryLayout,
  filterVisibleGalleryItems,
  warmGalleryImages,
  type GalleryLayoutItem,
} from "../../utils/galleryLayout";
import { imageKey } from "../../utils/galleryKeys";

interface UseGalleryColumnsOptions {
  items: ComputedRef<GalleryFlatItem[]>;
  filter: ComputedRef<string>;
  isPanelCollapsed: ComputedRef<boolean>;
  galleryGridRef: Ref<HTMLElement | null>;
  galleryWindowRef: Ref<HTMLElement | null>;
}

const GAP_PX = 12;
const TARGET_COLUMN_WIDTH = 176;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 8;

export function useGalleryColumns(options: UseGalleryColumnsOptions) {
  const galleryColumnCount = ref(4);
  const galleryContainerWidth = ref(0);
  const galleryScrollTop = ref(0);
  const galleryViewportHeight = ref(1);
  let gridResizeObserver: ResizeObserver | null = null;
  let layoutFrame = 0;

  const galleryGridStyle = computed(() => ({
    "--gallery-columns": String(galleryColumnCount.value),
    "--gallery-virtual-height": `${Math.ceil(galleryLayout.value.totalHeight)}px`,
  }));
  const galleryLayout = computed(() => buildGalleryMasonryLayout(options.items.value, {
    containerWidth: galleryContainerWidth.value,
    targetColumnWidth: TARGET_COLUMN_WIDTH,
    minColumns: MIN_COLUMNS,
    maxColumns: MAX_COLUMNS,
    gapPx: GAP_PX,
    allowFeatured: options.filter.value === "all",
  }));
  const visibleGalleryRecords = computed(() => (
    filterVisibleGalleryItems(galleryLayout.value.items, {
      scrollTop: galleryScrollTop.value,
      viewportHeight: galleryViewportHeight.value,
      overscanScreens: 1.25,
    })
  ));
  const groupedProfileByKey = computed(() => {
    const layout = buildGalleryMasonryLayout(options.items.value, {
      containerWidth: galleryContainerWidth.value,
      targetColumnWidth: TARGET_COLUMN_WIDTH,
      minColumns: MIN_COLUMNS,
      maxColumns: MAX_COLUMNS,
      gapPx: GAP_PX,
      allowFeatured: false,
    });
    return new Map(layout.items.map((record) => [record.key, record.profile]));
  });

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

  function updateGalleryColumns() {
    const grid = options.galleryGridRef.value;
    if (!grid) return;
    const width = grid.clientWidth;
    if (!width) return;
    const columns = clamp(Math.floor((width + GAP_PX) / (TARGET_COLUMN_WIDTH + GAP_PX)), MIN_COLUMNS, MAX_COLUMNS);
    galleryColumnCount.value = columns;
    galleryContainerWidth.value = width;
    grid.style.setProperty("--gallery-columns", String(columns));
    grid.style.setProperty("--gallery-grid-gap", `${GAP_PX}px`);
    updateGalleryScrollMetrics();
  }

  function updateGalleryScrollMetrics() {
    const windowNode = options.galleryWindowRef.value;
    if (!windowNode) return;
    galleryScrollTop.value = windowNode.scrollTop || 0;
    galleryViewportHeight.value = windowNode.clientHeight || 1;
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
      if (typeof ResizeObserver === "function" && options.galleryGridRef.value) {
        gridResizeObserver = new ResizeObserver(scheduleGalleryColumnsUpdate);
        gridResizeObserver.observe(options.galleryGridRef.value);
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

  watch(() => options.items.value.length, () => nextTick(scheduleGalleryColumnsUpdate));
  watch(options.items, (items) => warmGalleryImages(items), { immediate: true });
  watch(options.filter, () => nextTick(scheduleGalleryColumnsUpdate));
  watch(options.isPanelCollapsed, () => nextTick(scheduleGalleryColumnsUpdate));

  return {
    distributeColumns,
    galleryGridStyle,
    galleryRecordStyle,
    groupedProfileByKey,
    scheduleGalleryColumnsUpdate,
    updateGalleryScrollMetrics,
    visibleGalleryRecords,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
