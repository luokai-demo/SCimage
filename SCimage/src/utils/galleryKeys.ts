export function imageKey(item: { jobId?: string; slot?: unknown }) {
  return `${item.jobId || ""}:${Number(item.slot || 0)}`;
}

export function imageKeyFromParts(jobId: string, slot: unknown) {
  return imageKey({ jobId, slot });
}
