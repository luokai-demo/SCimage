import type { QueueSnapshotPayload } from "../contracts/api";

function queueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function queueCount(value: unknown, fallback: number): number {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return fallback;
  return Math.trunc(count);
}

export function normalizeQueueSnapshot(payload?: QueueSnapshotPayload | null): QueueSnapshotPayload {
  const running = queueIds(payload?.running);
  const pending = queueIds(payload?.pending);
  return {
    running,
    pending,
    running_count: queueCount(payload?.running_count, running.length),
    pending_count: queueCount(payload?.pending_count, pending.length),
  };
}

export function emptyQueueSnapshot(): QueueSnapshotPayload {
  return normalizeQueueSnapshot(null);
}
