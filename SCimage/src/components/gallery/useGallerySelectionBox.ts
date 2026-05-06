import { computed, reactive, onBeforeUnmount } from "vue";

interface UseGallerySelectionBoxOptions {
  clearSelection: () => void;
  hasSelection: () => boolean;
  selectByRect: (rect: DOMRect) => void;
}

export function useGallerySelectionBox(options: UseGallerySelectionBoxOptions) {
  const selectionStart = reactive({ x: 0, y: 0, active: false });
  const selectionBox = reactive({ visible: false, left: 0, top: 0, width: 0, height: 0 });
  const selectionBoxStyle = computed(() => ({
    left: `${selectionBox.left}px`,
    top: `${selectionBox.top}px`,
    width: `${selectionBox.width}px`,
    height: `${selectionBox.height}px`,
  }));

  function startEdgeSelection(event: PointerEvent) {
    if (options.hasSelection() && event.detail <= 1) {
      options.clearSelection();
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
    if (selectionBox.width > 8 && selectionBox.height > 8) options.selectByRect(rect);
    selectionBox.visible = false;
  }

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onSelectionMove);
  });

  return {
    selectionBox,
    selectionBoxStyle,
    startEdgeSelection,
  };
}
