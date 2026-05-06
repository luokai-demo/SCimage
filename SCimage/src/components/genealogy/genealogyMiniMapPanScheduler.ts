export interface GenealogyMiniMapPanScheduler {
  dispose: () => void;
  flush: () => void;
  schedule: (point: { x: number; y: number }, immediate?: boolean) => void;
}

const MIN_PAN_INTERVAL_MS = 32;

export function createGenealogyMiniMapPanScheduler(
  onPanTo: (point: { x: number; y: number }) => void,
): GenealogyMiniMapPanScheduler {
  let frame = 0;
  let lastPanAt = 0;
  let pendingPoint: { x: number; y: number } | null = null;

  function schedule(point: { x: number; y: number }, immediate = false) {
    pendingPoint = point;
    if (immediate) {
      flush();
      return;
    }
    if (frame) return;
    frame = window.requestAnimationFrame(flush);
  }

  function flush() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!pendingPoint) return;

    const now = performance.now();
    if (now - lastPanAt < MIN_PAN_INTERVAL_MS) {
      frame = window.requestAnimationFrame(flush);
      return;
    }
    lastPanAt = now;
    const point = pendingPoint;
    pendingPoint = null;
    onPanTo(point);
  }

  function dispose() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    pendingPoint = null;
  }

  return {
    dispose,
    flush,
    schedule,
  };
}
