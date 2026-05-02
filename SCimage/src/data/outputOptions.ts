export const AUTO_OPTION = "auto";
export const OUTPUT_PROFILE_ASPECT_V1 = "aspect_v1";
export const OUTPUT_PROFILE_PIXEL_V1 = "pixel_v1";
export const DEFAULT_OUTPUT_PROFILE_ID = OUTPUT_PROFILE_PIXEL_V1;

export interface OutputOption {
  value: string;
  label: string;
  aspect?: string;
  width?: number;
  height?: number;
  quality?: string;
}

const aspectLabels: Record<string, string> = {
  "1:1": "1:1 方形",
  "16:9": "16:9 横屏",
  "9:16": "9:16 竖屏",
  "3:2": "3:2 横屏（相机）",
  "2:3": "2:3 竖屏（相机）",
  "4:3": "4:3 横屏",
  "3:4": "3:4 竖屏",
  "5:4": "5:4 横屏",
  "4:5": "4:5 竖屏（社媒）",
  "21:9": "21:9 超宽屏",
};

const pixelSizeValues: Record<string, Array<[string, string]>> = {
  standard: [
    ["1:1", "1024x1024"], ["16:9", "1280x720"], ["9:16", "720x1280"],
    ["3:2", "1248x832"], ["2:3", "832x1248"], ["4:3", "1152x864"],
    ["3:4", "864x1152"], ["5:4", "1120x896"], ["4:5", "896x1120"],
    ["21:9", "1456x624"],
  ],
  hd: [
    ["1:1", "2048x2048"], ["16:9", "2560x1440"], ["9:16", "1440x2560"],
    ["3:2", "2496x1664"], ["2:3", "1664x2496"], ["4:3", "2304x1728"],
    ["3:4", "1728x2304"], ["5:4", "2240x1792"], ["4:5", "1792x2240"],
    ["21:9", "3024x1296"],
  ],
  "4k": [
    ["1:1", "2880x2880"], ["16:9", "3840x2160"], ["9:16", "2160x3840"],
    ["3:2", "3504x2336"], ["2:3", "2336x3504"], ["4:3", "3264x2448"],
    ["3:4", "2448x3264"], ["5:4", "3200x2560"], ["4:5", "2560x3200"],
    ["21:9", "3696x1584"],
  ],
};

const qualityOptionsByProfile: Record<string, OutputOption[]> = {
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

const qualityAliasesByProfile: Record<string, Record<string, string>> = {
  [OUTPUT_PROFILE_ASPECT_V1]: {
    auto: AUTO_OPTION, "1k": "low", "2k": "medium", "4k": "high",
    low: "low", medium: "medium", high: "high", standard: "low", hd: "medium", ultra: "high",
  },
  [OUTPUT_PROFILE_PIXEL_V1]: {
    auto: AUTO_OPTION, "1k": "standard", "2k": "hd", "4k": "4k",
    low: "standard", medium: "hd", high: "4k", standard: "standard", hd: "hd", ultra: "4k",
  },
};

const aspectSizeOptions: OutputOption[] = [
  { value: AUTO_OPTION, label: "自动", aspect: AUTO_OPTION, width: 0, height: 0 },
  ...Object.entries(aspectLabels).map(([aspect, label]) => {
    const [width, height] = aspect.split(":").map((value) => Number.parseInt(value, 10));
    return { value: aspect, label, aspect, width, height };
  }),
];

const pixelAutoOption: OutputOption = { value: AUTO_OPTION, label: "自动", aspect: AUTO_OPTION, quality: AUTO_OPTION, width: 0, height: 0 };
const pixelPresetOptions = Object.entries(pixelSizeValues).flatMap(([quality, entries]) => (
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

const pixelOptionsByQuality = new Map<string, OutputOption[]>([
  [AUTO_OPTION, [pixelAutoOption]],
  ["standard", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "standard")]],
  ["hd", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "hd")]],
  ["4k", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "4k")]],
]);

const pixelByValue = new Map([pixelAutoOption, ...pixelPresetOptions].map((option) => [option.value, option]));
const pixelByAspectAndQuality = new Map<string, Map<string, OutputOption>>();
Object.keys(aspectLabels).forEach((aspect) => {
  const byQuality = new Map<string, OutputOption>();
  ["standard", "hd", "4k"].forEach((quality) => {
    const option = pixelOptionsByQuality.get(quality)?.find((item) => item.aspect === aspect);
    if (option) byQuality.set(quality, option);
  });
  pixelByAspectAndQuality.set(aspect, byQuality);
});

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

export function getDefaultSizeOption() {
  return AUTO_OPTION;
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
  const lookupQuality = normalizeQuality(quality, null, profileId) === AUTO_OPTION ? getResolvedDefaultQuality(profileId) : normalizeQuality(quality, null, profileId);
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

export function formatQuality(value: unknown, outputProfileId = DEFAULT_OUTPUT_PROFILE_ID) {
  const profileId = normalizeOutputProfileId(outputProfileId);
  const normalized = normalizeQuality(value, null, profileId);
  return qualityOptionsByProfile[profileId].find((option) => option.value === normalized)?.label || "自动";
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

function parsePixelSize(value: unknown): [number, number] | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[1-9]\d*x[1-9]\d*$/.test(normalized)) return null;
  const [width, height] = normalized.split("x");
  return [Number.parseInt(width, 10), Number.parseInt(height, 10)];
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
