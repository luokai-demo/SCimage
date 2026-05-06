import type { GenealogyLayoutEdge } from "../../utils/genealogyGraph";
import { genealogyEdgePath } from "../../utils/genealogyWire";
import type { GenealogyEdgeView } from "./useGenealogyLayoutState";

const EDGE_VIEW_CACHE_LIMIT = 1200;

export function createGenealogyEdgeViewCache() {
  const cache = new Map<string, Pick<GenealogyEdgeView, "key" | "path">>();

  function getEdgePath(edge: GenealogyLayoutEdge) {
    const key = genealogyEdgeViewKey(edge);
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const next = {
      key,
      path: genealogyEdgePath(edge),
    };
    cache.set(key, next);
    trimCache();
    return next;
  }

  function clear() {
    cache.clear();
  }

  function trimCache() {
    while (cache.size > EDGE_VIEW_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }

  return {
    clear,
    getEdgePath,
  };
}

function genealogyEdgeViewKey(edge: GenealogyLayoutEdge) {
  return [
    edge.from,
    edge.to,
    edge.fromX,
    edge.fromY,
    edge.toX,
    edge.toY,
  ].join(":");
}
