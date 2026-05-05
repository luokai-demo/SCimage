export type ApiRequestOptions = Omit<RequestInit, "body"> & { body?: unknown; timeoutMs?: number };

export class ApiError extends Error {
  path: string;
  status: number;
  payload: unknown;
  kind: "timeout" | "http" | "network";

  constructor(
    message: string,
    options: {
      path: string;
      status?: number;
      payload?: unknown;
      kind: "timeout" | "http" | "network";
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.path = options.path;
    this.status = options.status || 0;
    this.payload = options.payload;
    this.kind = options.kind;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  const headers = new Headers(options.headers || {});
  let body = options.body as BodyInit | null | undefined;
  if (body && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    try {
      const response = await fetch(path, { ...fetchOptions, headers, body, signal: controller.signal });
      const contentType = response.headers.get("Content-Type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        throw new ApiError(
          (payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "") || response.statusText,
          {
            path,
            status: response.status,
            payload,
            kind: "http",
          },
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("本地服务响应超时，请确认服务仍在运行。", {
          path,
          kind: "timeout",
        });
      }
      if (error instanceof ApiError) throw error;
      if (error instanceof TypeError) {
        throw new ApiError(error.message || "本地服务连接失败。", {
          path,
          kind: "network",
        });
      }
      throw error;
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}
