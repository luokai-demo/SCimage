import type { JobSummary } from "../stores/jobs";

export interface JobProblemDetails {
  title: string;
  localBackendText: string;
  upstreamText: string;
  rawText: string;
}

export function normalizeErrorText(value: unknown) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "none" || text.toLowerCase() === "null") return "";
  return text;
}

export function extractUpstreamError(rawText: unknown) {
  const normalized = normalizeErrorText(rawText).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("auth_required") || normalized.includes("chat-requirements failed")) return "auth_required / chat-requirements failed";
  if (normalized.includes("未通过权限校验")) return "权限校验失败";
  if (normalized.includes("504 gateway time-out") || normalized.includes("504 gateway timeout") || normalized.includes("gateway request timed out")) return "504 Gateway Timeout";
  if (normalized.includes("图像服务超时") || normalized.includes("长时间没有返回结果")) return "请求超时";
  if (normalized.includes("429") || normalized.includes("too many requests")) return "429 Too Many Requests";
  if (normalized.includes("请求过多")) return "请求过多";
  if (normalized.includes("502") || normalized.includes("bad gateway")) return "502 Bad Gateway";
  if (normalized.includes("503") || normalized.includes("service unavailable") || normalized.includes("temporarily unavailable")) return "503 Service Unavailable";
  if (normalized.includes("暂时不可用")) return "服务暂时不可用";
  if (normalized.includes("non-json") || normalized.includes("<html") || normalized.includes("invalid response")) return "返回了非 JSON / HTML 异常页";
  if (normalized.includes("异常页面")) return "返回了异常页面";
  if (normalized.includes("timed out")) return "请求超时";
  return "";
}

export function getJobProblemDetails(job: JobSummary): JobProblemDetails {
  const errorText = normalizeErrorText(job.error);
  const warningTexts = Array.isArray(job.warnings) ? job.warnings.map(normalizeErrorText).filter(Boolean) : [];
  const rawText = errorText || warningTexts.join("；");
  const upstreamText = extractUpstreamError(rawText);
  const title = upstreamText ? "API上游原因失败" : "本地后端原因失败";
  let localBackendText = normalizeErrorText(job.message);

  if (!localBackendText) {
    localBackendText = upstreamText ? "生成失败。" : (rawText || "生成失败。");
  }
  if (!upstreamText && !errorText && warningTexts.length) {
    localBackendText = localBackendText || `已生成 ${Array.isArray(job.images) ? job.images.length : 0}/${job.count || 0} 张图片。`;
  }

  return {
    title,
    localBackendText: localBackendText || "生成失败。",
    upstreamText: upstreamText || "未识别到明确上游返回",
    rawText: rawText || normalizeErrorText(job.message) || "生成失败。",
  };
}

export function formatJobFailureMessage(job: JobSummary) {
  const details = getJobProblemDetails(job);
  return [
    details.title,
    `本地后端：${details.localBackendText}`,
    `API上游：${details.upstreamText}`,
    `error：${details.rawText}`,
  ].join("\n");
}
