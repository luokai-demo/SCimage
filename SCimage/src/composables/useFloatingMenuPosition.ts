import { onMounted, onUnmounted, ref } from "vue";
import type { CSSProperties, Ref } from "vue";

interface FloatingMenuPositionOptions {
  anchorRef: Ref<HTMLElement | null>;
  isOpen: Ref<boolean>;
  gap?: number;
  maxHeight?: number;
  minHeight?: number;
  viewportGap?: number;
}

export function useFloatingMenuPosition(options: FloatingMenuPositionOptions) {
  const menuStyle = ref<CSSProperties>({});
  const gap = options.gap ?? 5;
  const maxHeight = options.maxHeight ?? 212;
  const minHeight = options.minHeight ?? 120;
  const viewportGap = options.viewportGap ?? 8;

  function updateMenuPosition() {
    const anchor = options.anchorRef.value;
    if (!anchor || !options.isOpen.value) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > viewportHeight) {
      options.isOpen.value = false;
      return;
    }

    const maxWidth = Math.max(0, viewportWidth - viewportGap * 2);
    const width = Math.min(rect.width, maxWidth);
    const left = Math.min(
      Math.max(viewportGap, rect.left),
      Math.max(viewportGap, viewportWidth - viewportGap - width),
    );
    const spaceBelow = viewportHeight - rect.bottom - viewportGap - gap;
    const spaceAbove = rect.top - viewportGap - gap;
    const shouldOpenAbove = spaceBelow < minHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(80, Math.min(maxHeight, shouldOpenAbove ? spaceAbove : spaceBelow));
    const top = shouldOpenAbove
      ? Math.max(viewportGap, rect.top - gap - availableHeight)
      : Math.max(viewportGap, Math.min(rect.bottom + gap, viewportHeight - viewportGap - availableHeight));

    menuStyle.value = {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.round(availableHeight)}px`,
    };
  }

  onMounted(() => {
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateMenuPosition);
    window.removeEventListener("scroll", updateMenuPosition, true);
  });

  return {
    menuStyle,
    updateMenuPosition,
  };
}
