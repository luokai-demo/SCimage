import { DEFAULT_OUTPUT_PROFILE_ID } from "./outputProfiles";
import { getDefaultQuality, normalizeQuality } from "./outputQuality";
import { getDefaultSizeOption, inferQualityFromSize, normalizeSizeOption } from "./outputSize";

export function normalizeOutputForm(rawForm: Partial<{ prompt: unknown; size: unknown; quality: unknown; count: unknown }>, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const rawSize = rawForm?.size ?? getDefaultSizeOption();
  const quality = normalizeQuality(
    rawForm?.quality ?? inferQualityFromSize(rawSize, getDefaultQuality(outputProfileId), outputProfileId),
    getDefaultQuality(outputProfileId),
    outputProfileId,
  );
  const count = Number.parseInt(String(rawForm?.count ?? "1"), 10);
  return {
    prompt: String(rawForm?.prompt ?? ""),
    quality,
    size: normalizeSizeOption(rawSize, getDefaultSizeOption(), quality, outputProfileId),
    count: String(Number.isNaN(count) ? 1 : Math.max(1, count)),
  };
}
