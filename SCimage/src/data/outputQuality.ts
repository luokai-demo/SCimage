import {
  AUTO_OPTION,
  DEFAULT_OUTPUT_PROFILE_ID,
  OUTPUT_PROFILE_ASPECT_V1,
  OUTPUT_PROFILE_PIXEL_V1,
  type OutputOption,
} from "./outputProfiles";

export const qualityOptionsByProfile: Record<string, OutputOption[]> = {
  [OUTPUT_PROFILE_ASPECT_V1]: [
    { value: AUTO_OPTION, label: "自动" },
    { value: "low", label: "标准 1K" },
    { value: "medium", label: "高清 2K" },
    { value: "high", label: "超清 4K" },
  ],
  [OUTPUT_PROFILE_PIXEL_V1]: [
    { value: AUTO_OPTION, label: "自动" },
    { value: "standard", label: "标准 1K" },
    { value: "hd", label: "高清 2K" },
    { value: "4k", label: "超清 4K" },
  ],
};

export const qualityAliasesByProfile: Record<string, Record<string, string>> = {
  [OUTPUT_PROFILE_ASPECT_V1]: {
    auto: AUTO_OPTION, "1k": "low", "2k": "medium", "4k": "high",
    low: "low", medium: "medium", high: "high", standard: "low", hd: "medium", ultra: "high",
  },
  [OUTPUT_PROFILE_PIXEL_V1]: {
    auto: AUTO_OPTION, "1k": "standard", "2k": "hd", "4k": "4k",
    low: "standard", medium: "hd", high: "4k", standard: "standard", hd: "hd", ultra: "4k",
  },
};

export function normalizeOutputProfileId(value: unknown, fallback = DEFAULT_OUTPUT_PROFILE_ID) {
  const normalized = String(value || "").trim().toLowerCase();
  return qualityOptionsByProfile[normalized] ? normalized : fallback;
}

export function getDefaultQuality(outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  return normalizeOutputProfileId(outputProfileId) === OUTPUT_PROFILE_ASPECT_V1 ? AUTO_OPTION : AUTO_OPTION;
}

export function getResolvedDefaultQuality(outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  return normalizeOutputProfileId(outputProfileId) === OUTPUT_PROFILE_ASPECT_V1 ? "low" : "standard";
}

export function getQualityOptions(outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  return [...qualityOptionsByProfile[normalizeOutputProfileId(outputProfileId)]];
}

export function normalizeQuality(value: unknown, fallback: string | null = null, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalized = String(value || "").trim().toLowerCase();
  const mapped = qualityAliasesByProfile[profileId][normalized] || normalized;
  let nextFallback = fallback == null ? getDefaultQuality(profileId) : String(fallback).trim().toLowerCase();
  if (!qualityOptionsByProfile[profileId].some((option) => option.value === nextFallback)) {
    nextFallback = getDefaultQuality(profileId);
  }
  return qualityOptionsByProfile[profileId].some((option) => option.value === mapped) ? mapped : nextFallback;
}

export function formatQuality(value: unknown, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalized = normalizeQuality(value, null, profileId);
  return qualityOptionsByProfile[profileId].find((option) => option.value === normalized)?.label || "自动";
}
