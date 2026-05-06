import { computed, reactive } from "vue";
import { useGalleryStore } from "../../stores/gallery";
import { createFailurePopupController } from "./failurePopup";
import { useRuntimeLightbox } from "./lightbox";
import { createStatusController, type StatusTone } from "./status";

export function createScimageRuntimeBase() {
  const status = reactive({ tone: "" as StatusTone, message: "" });
  const statusController = createStatusController(status);
  const visibleGalleryItems = computed(() => useGalleryStore().flatItems);
  const lightboxRuntime = useRuntimeLightbox({ galleryItems: visibleGalleryItems });
  const failurePopupRuntime = createFailurePopupController();

  function setStatus(tone: StatusTone, message: string, timeoutMs = 0) {
    statusController.setStatus(tone, message, timeoutMs);
  }

  return {
    ...failurePopupRuntime,
    ...lightboxRuntime,
    setStatus,
    status,
    visibleGalleryItems,
  };
}

export type ScimageRuntimeBase = ReturnType<typeof createScimageRuntimeBase>;
