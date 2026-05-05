import { onBeforeUnmount, ref } from "vue";
import type { useGenealogyStore } from "../../stores/genealogy";
import type { GenealogyNodeDragPosition } from "./useGenealogyNodeDrag";

interface UseGenealogyPositionBatchSaveOptions {
  genealogyStore: ReturnType<typeof useGenealogyStore>;
  setStatus: (tone: "error", message: string, timeoutMs?: number) => void;
  onIdle?: () => void;
  debounceMs?: number;
}

interface PendingPositionSave {
  position: GenealogyNodeDragPosition;
  fallback: GenealogyNodeDragPosition;
}

export function useGenealogyPositionBatchSave(options: UseGenealogyPositionBatchSaveOptions) {
  const savingCount = ref(0);
  const pendingPositions = new Map<string, PendingPositionSave>();
  let flushTimer = 0;

  function queueNodePositionSave(
    nodeId: string,
    position: GenealogyNodeDragPosition,
    fallback: GenealogyNodeDragPosition,
  ) {
    pendingPositions.set(nodeId, { position, fallback });
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushNodePositionBatch, options.debounceMs ?? 80);
  }

  async function flushNodePositionBatch() {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    if (!pendingPositions.size) {
      options.onIdle?.();
      return;
    }

    const entries = [...pendingPositions.entries()];
    pendingPositions.clear();
    const positions = Object.fromEntries(entries.map(([nodeId, item]) => [nodeId, item.position]));
    savingCount.value += 1;
    try {
      const response = await fetch("/api/genealogy/nodes/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || `位置保存失败：${response.status}`));
      }
    } catch (error) {
      entries.forEach(([nodeId, item]) => {
        options.genealogyStore.updateNodePosition(nodeId, item.fallback);
      });
      options.setStatus("error", error instanceof Error ? error.message : String(error || "位置保存失败。"), 2600);
    } finally {
      savingCount.value = Math.max(0, savingCount.value - 1);
      if (!savingCount.value && !pendingPositions.size) options.onIdle?.();
    }
  }

  function hasPendingPositionSave() {
    return Boolean(savingCount.value || pendingPositions.size);
  }

  function disposePositionBatchSave() {
    window.clearTimeout(flushTimer);
    pendingPositions.clear();
  }

  onBeforeUnmount(disposePositionBatchSave);

  return {
    savingCount,
    queueNodePositionSave,
    flushNodePositionBatch,
    hasPendingPositionSave,
    disposePositionBatchSave,
  };
}
