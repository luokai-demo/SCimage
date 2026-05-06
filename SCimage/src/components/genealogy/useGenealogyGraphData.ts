import { onBeforeUnmount } from "vue";
import type { GenealogyGraphPayload } from "../../stores/genealogy";
import type { useGenealogyStore } from "../../stores/genealogy";

interface LoadGraphOptions {
  silent?: boolean;
  force?: boolean;
}

interface UseGenealogyGraphDataOptions {
  genealogyStore: ReturnType<typeof useGenealogyStore>;
  shouldDeferGraphRefresh: () => boolean;
  afterGraphLoaded?: () => void;
}

export function useGenealogyGraphData(options: UseGenealogyGraphDataOptions) {
  let graphAbortController: AbortController | null = null;
  let pendingGraphRefreshAfterDrag = false;

  async function loadGraph(loadOptions: LoadGraphOptions = {}) {
    if (!loadOptions.force && options.shouldDeferGraphRefresh()) {
      pendingGraphRefreshAfterDrag = true;
      return;
    }
    if (options.genealogyStore.loading && !loadOptions.force) return;
    graphAbortController?.abort();
    graphAbortController = new AbortController();
    if (!loadOptions.silent) {
      options.genealogyStore.loading = true;
      options.genealogyStore.error = "";
    }
    try {
      const response = await fetch("/api/genealogy/graph", { signal: graphAbortController.signal });
      if (!response.ok) throw new Error(`族谱同步失败：${response.status}`);
      const payload = await response.json() as GenealogyGraphPayload;
      if (!loadOptions.force && options.shouldDeferGraphRefresh()) {
        pendingGraphRefreshAfterDrag = true;
        return;
      }
      options.genealogyStore.replaceGraph(payload);
      options.afterGraphLoaded?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      options.genealogyStore.error = error instanceof Error ? error.message : String(error || "族谱同步失败。");
    } finally {
      if (!loadOptions.silent) options.genealogyStore.loading = false;
    }
  }

  function consumePendingGraphRefresh() {
    if (!pendingGraphRefreshAfterDrag || options.shouldDeferGraphRefresh()) return;
    pendingGraphRefreshAfterDrag = false;
    void loadGraph({ silent: true, force: true });
  }

  function disposeGraphData() {
    graphAbortController?.abort();
  }

  onBeforeUnmount(disposeGraphData);

  return {
    loadGraph,
    consumePendingGraphRefresh,
    disposeGraphData,
  };
}
