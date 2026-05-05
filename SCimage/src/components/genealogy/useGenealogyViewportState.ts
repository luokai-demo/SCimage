import { nextTick, onBeforeUnmount, ref, type Ref } from "vue";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import { GENEALOGY_CARD_HEIGHT, GENEALOGY_CARD_WIDTH } from "../../utils/genealogyGraph";

export interface GenealogyViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseGenealogyViewportStateOptions {
  viewport: Ref<HTMLElement | null>;
  getLayoutNode: (nodeId: string) => GenealogyLayoutNode | null | undefined;
  selectNode: (nodeId: string) => void;
}

export function useGenealogyViewportState(options: UseGenealogyViewportStateOptions) {
  const viewportState = ref<GenealogyViewportRect>({ left: 0, top: 0, width: 0, height: 0 });
  let viewportFrame = 0;

  function updateViewportState() {
    const viewport = options.viewport.value;
    if (!viewport) return;
    viewportState.value = {
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    };
  }

  function scheduleViewportUpdate() {
    window.cancelAnimationFrame(viewportFrame);
    viewportFrame = window.requestAnimationFrame(updateViewportState);
  }

  function focusNode(nodeId: string) {
    const node = options.getLayoutNode(nodeId);
    const viewport = options.viewport.value;
    if (!node || !viewport) return;
    options.selectNode(nodeId);
    viewport.scrollTo({
      left: Math.max(0, node.x - (viewport.clientWidth - GENEALOGY_CARD_WIDTH) / 2),
      top: Math.max(0, node.y - (viewport.clientHeight - GENEALOGY_CARD_HEIGHT) / 2),
      behavior: "smooth",
    });
    void nextTick(() => {
      const target = viewport.querySelector<HTMLElement>(`[data-genealogy-node-id="${cssAttributeValue(nodeId)}"]`);
      target?.focus({ preventScroll: true });
      scheduleViewportUpdate();
    });
  }

  function panTreeTo(point: { x: number; y: number }) {
    const viewport = options.viewport.value;
    if (!viewport) return;
    viewport.scrollTo({
      left: Math.max(0, point.x - viewport.clientWidth / 2),
      top: Math.max(0, point.y - viewport.clientHeight / 2),
      behavior: "smooth",
    });
    scheduleViewportUpdate();
  }

  function disposeViewportState() {
    window.cancelAnimationFrame(viewportFrame);
  }

  onBeforeUnmount(disposeViewportState);

  return {
    viewportState,
    updateViewportState,
    scheduleViewportUpdate,
    focusNode,
    panTreeTo,
    disposeViewportState,
  };
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
