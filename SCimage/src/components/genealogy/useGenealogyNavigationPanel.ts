import { onBeforeUnmount, onMounted, ref } from "vue";

export function useGenealogyNavigationPanel() {
  const isMiniMapOpen = ref(false);

  function openMiniMap() {
    isMiniMapOpen.value = true;
  }

  function closeMiniMap() {
    isMiniMapOpen.value = false;
  }

  function toggleMiniMap() {
    isMiniMapOpen.value = !isMiniMapOpen.value;
  }

  function closeMiniMapOnOutsidePointer(event: PointerEvent) {
    if (!isMiniMapOpen.value) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#genealogyNavPopover") || target.closest("#genealogyNavToggleBtn")) return;
    closeMiniMap();
  }

  function closeMiniMapOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !isMiniMapOpen.value) return;
    closeMiniMap();
  }

  onMounted(() => {
    document.addEventListener("pointerdown", closeMiniMapOnOutsidePointer);
    document.addEventListener("keydown", closeMiniMapOnEscape);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", closeMiniMapOnOutsidePointer);
    document.removeEventListener("keydown", closeMiniMapOnEscape);
  });

  return {
    closeMiniMap,
    isMiniMapOpen,
    openMiniMap,
    toggleMiniMap,
  };
}
