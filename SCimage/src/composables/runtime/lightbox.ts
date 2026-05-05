import { computed, reactive, ref, type Ref } from "vue";
import type { GalleryFlatItem } from "../../stores/gallery";
import { imageKeyFromParts } from "../../utils/galleryKeys";

interface LightboxState {
  open: boolean;
  index: number;
  selectionKey: string;
  zoom: number;
  panX: number;
  panY: number;
  dragging: boolean;
  dragStartX: number;
  dragStartY: number;
  startPanX: number;
  startPanY: number;
}

interface UseRuntimeLightboxOptions {
  galleryItems: Ref<GalleryFlatItem[]>;
}

export function useRuntimeLightbox(options: UseRuntimeLightboxOptions) {
  const lightbox = reactive<LightboxState>({
    open: false,
    index: 0,
    selectionKey: "",
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startPanX: 0,
    startPanY: 0,
  });
  const lightboxItemsOverride = ref<GalleryFlatItem[] | null>(null);
  const lightboxItems = computed(() => lightboxItemsOverride.value || options.galleryItems.value);
  const currentLightboxItem = computed(() => lightboxItems.value[lightbox.index] || null);

  function openLightbox(index: number) {
    const item = options.galleryItems.value[index];
    if (!item) return;
    lightboxItemsOverride.value = null;
    openLightboxAt(index, item);
  }

  function openLightboxFromItems(items: GalleryFlatItem[], index: number) {
    const normalizedItems = items.filter((item) => item.src);
    const item = normalizedItems[index];
    if (!item) return;
    lightboxItemsOverride.value = normalizedItems;
    openLightboxAt(index, item);
  }

  function openLightboxAt(index: number, item: GalleryFlatItem) {
    lightbox.index = index;
    lightbox.selectionKey = imageKeyFromParts(item.jobId, item.slot);
    lightbox.open = true;
    resetLightboxView();
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.open = false;
    lightbox.selectionKey = "";
    lightbox.index = 0;
    lightboxItemsOverride.value = null;
    resetLightboxView();
    lightbox.dragging = false;
    document.body.style.overflow = "";
  }

  function syncLightboxSelection() {
    if (!lightbox.open) return;
    const items = lightboxItems.value;
    if (!items.length) {
      closeLightbox();
      return;
    }
    const nextIndex = lightbox.selectionKey
      ? items.findIndex((item) => imageKeyFromParts(item.jobId, item.slot) === lightbox.selectionKey)
      : -1;
    if (nextIndex < 0) {
      closeLightbox();
      return;
    }
    lightbox.index = nextIndex;
  }

  function navLightbox(delta: number) {
    const items = lightboxItems.value;
    const total = items.length;
    if (!total) return;
    const nextIndex = lightbox.index + delta;
    if (nextIndex < 0 || nextIndex >= total) return;
    const item = items[nextIndex];
    if (!item) return;
    lightbox.index = nextIndex;
    lightbox.selectionKey = imageKeyFromParts(item.jobId, item.slot);
    resetLightboxView();
  }

  function resetLightboxView() {
    lightbox.zoom = 1;
    lightbox.panX = 0;
    lightbox.panY = 0;
  }

  return {
    lightbox,
    lightboxItems,
    currentLightboxItem,
    openLightbox,
    openLightboxFromItems,
    closeLightbox,
    syncLightboxSelection,
    navLightbox,
  };
}
