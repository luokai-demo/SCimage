import {
  AUTO_OPTION,
  DEFAULT_OUTPUT_PROFILE_ID,
  OUTPUT_PROFILE_ASPECT_V1,
  OUTPUT_PROFILE_PIXEL_V1,
  aspectLabels,
  parsePixelSize,
  pixelSizeValues,
  type OutputOption,
} from "./outputProfiles";
import { getResolvedDefaultQuality, normalizeOutputProfileId, normalizeQuality } from "./outputQuality";

export const aspectSizeOptions: OutputOption[] = [
  { value: AUTO_OPTION, label: "自动", aspect: AUTO_OPTION, width: 0, height: 0 },
  ...Object.entries(aspectLabels).map(([aspect, label]) => {
    const [width, height] = aspect.split(":").map((value) => Number.parseInt(value, 10));
    return { value: aspect, label, aspect, width, height };
  }),
];

export const pixelAutoOption: OutputOption = { value: AUTO_OPTION, label: "自动", aspect: AUTO_OPTION, quality: AUTO_OPTION, width: 0, height: 0 };
export const pixelPresetOptions = Object.entries(pixelSizeValues).flatMap(([quality, entries]) => (
  entries.map(([aspect, value]) => {
    const [width, height] = parsePixelSize(value) || [0, 0];
    return {
      value,
      label: `${aspectLabels[aspect]} · ${value}`,
      aspect,
      quality,
      width,
      height,
    };
  })
));

export const pixelOptionsByQuality = new Map<string, OutputOption[]>([
  [AUTO_OPTION, [pixelAutoOption]],
  ["standard", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "standard")]],
  ["hd", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "hd")]],
  ["4k", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "4k")]],
]);

export const pixelByValue = new Map([pixelAutoOption, ...pixelPresetOptions].map((option) => [option.value, option]));
export const pixelByAspectAndQuality = new Map<string, Map<string, OutputOption>>();
Object.keys(aspectLabels).forEach((aspect) => {
  const byQuality = new Map<string, OutputOption>();
  ["standard", "hd", "4k"].forEach((quality) => {
    const option = pixelOptionsByQuality.get(quality)?.find((item) => item.aspect === aspect);
    if (option) byQuality.set(quality, option);
  });
  pixelByAspectAndQuality.set(aspect, byQuality);
});

export function getDefaultSizeOption() {
  return AUTO_OPTION;
}

export function inferQualityFromSize(value: unknown, fallback: string | null = null, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === AUTO_OPTION) return AUTO_OPTION;
  if (profileId === OUTPUT_PROFILE_ASPECT_V1) return normalizeQuality(fallback, null, profileId);
  const pixelSize = parsePixelSize(normalized);
  if (!pixelSize) return normalizeQuality(fallback, null, profileId);
  const longEdge = Math.max(...pixelSize);
  if (longEdge <= 1600) return "standard";
  if (longEdge <= 2800) return "hd";
  return "4k";
}

export function defaultSizeForQuality(quality: unknown, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalizedQuality = normalizeQuality(quality, null, profileId);
  if (profileId === OUTPUT_PROFILE_ASPECT_V1) return normalizedQuality === AUTO_OPTION ? AUTO_OPTION : "9:16";
  if (normalizedQuality === AUTO_OPTION) return AUTO_OPTION;
  return pixelByAspectAndQuality.get("9:16")?.get(normalizedQuality)?.value || AUTO_OPTION;
}

export function normalizeSizeOption(value: unknown, fallback: string | null = null, quality: unknown = null, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === AUTO_OPTION) return AUTO_OPTION;
  if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
    return inferAspectFromSize(normalized) || inferAspectFromSize(fallback) || defaultSizeForQuality(quality, profileId);
  }
  const normalizedQuality = normalizeQuality(quality, null, profileId);
  const lookupQuality = normalizedQuality === AUTO_OPTION ? getResolvedDefaultQuality(profileId) : normalizedQuality;
  if (parsePixelSize(normalized)) return normalized;
  if (pixelByValue.has(normalized)) {
    const option = pixelByValue.get(normalized);
    if (option?.value === AUTO_OPTION) return AUTO_OPTION;
    return pixelByAspectAndQuality.get(option?.aspect || "")?.get(lookupQuality)?.value || defaultSizeForQuality(lookupQuality, profileId);
  }
  if (aspectLabels[normalized]) return pixelByAspectAndQuality.get(normalized)?.get(lookupQuality)?.value || defaultSizeForQuality(lookupQuality, profileId);
  const fallbackNormalized = String(fallback || "").trim().toLowerCase();
  if (fallbackNormalized === AUTO_OPTION) return AUTO_OPTION;
  if (parsePixelSize(fallbackNormalized)) return fallbackNormalized;
  if (aspectLabels[fallbackNormalized]) return pixelByAspectAndQuality.get(fallbackNormalized)?.get(lookupQuality)?.value || defaultSizeForQuality(lookupQuality, profileId);
  return defaultSizeForQuality(lookupQuality, profileId);
}

export function getSizeOptions(quality: unknown, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  if (profileId === OUTPUT_PROFILE_ASPECT_V1) return [...aspectSizeOptions];
  return [...(pixelOptionsByQuality.get(normalizeQuality(quality, null, profileId)) || [pixelAutoOption])];
}

export function getSizeOptionsForValue(quality: unknown, value: unknown, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const options = getSizeOptions(quality, profileId);
  const normalized = normalizeSizeOption(value, getDefaultSizeOption(), quality, profileId);
  if (options.some((option) => option.value === normalized)) return options;
  const pixelSize = profileId === OUTPUT_PROFILE_PIXEL_V1 ? parsePixelSize(normalized) : null;
  if (!pixelSize) return options;
  const [width, height] = pixelSize;
  return [
    ...options,
    {
      value: normalized,
      label: `自定义像素 · ${normalized}`,
      width,
      height,
      quality: normalizeQuality(quality, null, profileId),
    },
  ];
}

export function formatSize(value: unknown, quality: unknown, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalized = normalizeSizeOption(value, defaultSizeForQuality(quality, profileId), quality, profileId);
  if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
    if (normalized === AUTO_OPTION) return "自动";
    const originalPixel = parsePixelSize(value);
    const aspectLabel = aspectLabels[normalized] || normalized;
    return originalPixel ? `${aspectLabel} · ${originalPixel[0]}x${originalPixel[1]}` : aspectLabel;
  }
  return pixelByValue.get(normalized)?.label || normalized;
}

function inferAspectFromSize(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (aspectLabels[normalized]) return normalized;
  const pixelSize = parsePixelSize(normalized);
  if (!pixelSize) return null;
  const [width, height] = pixelSize;
  const ratio = width / height;
  return Object.keys(aspectLabels).reduce((best, aspect) => {
    const [aspectWidth, aspectHeight] = aspect.split(":").map((item) => Number.parseInt(item, 10));
    const delta = Math.abs(aspectWidth / aspectHeight - ratio);
    return !best || delta < best.delta ? { aspect, delta } : best;
  }, null as { aspect: string; delta: number } | null)?.aspect || null;
}
