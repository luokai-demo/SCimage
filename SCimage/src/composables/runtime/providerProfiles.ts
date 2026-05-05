import type { ProviderProfilesState } from "../../stores/provider";

export function normalizeBaseUrlForSignature(value: string) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/v1";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

export function normalizeProviderState(payload: ProviderProfilesState): ProviderProfilesState {
  return {
    active_profile_id: payload?.active_profile_id || null,
    compat_profiles: Array.isArray(payload?.compat_profiles) ? payload.compat_profiles : [],
    profiles: Array.isArray(payload?.profiles) ? payload.profiles : [],
    active_profile: payload?.active_profile || null,
    is_ready: Boolean(payload?.is_ready),
  };
}
