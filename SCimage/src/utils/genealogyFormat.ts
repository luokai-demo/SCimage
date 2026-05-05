export function formatGenealogyGeneration(generation: number) {
  return generation === 0 ? "Gen 0" : `Gen ${generation}`;
}

export function formatGenealogyNodeStatus(statusValue: string | undefined | null) {
  const status = String(statusValue || "");
  if (status === "completed") return "完成";
  if (status === "partial") return "部分";
  if (status === "queued") return "排队";
  if (status === "running") return "生成";
  if (status === "canceling") return "中断中";
  if (status === "failed") return "失败";
  if (status === "canceled") return "中断";
  if (status === "source") return "来源";
  return status || "未知";
}

export function shortGenealogyText(value: string, maxLength: number) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
