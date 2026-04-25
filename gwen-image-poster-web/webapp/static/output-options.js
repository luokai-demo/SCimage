"use strict";

(() => {
  const QUALITY_STANDARD = "standard";
  const QUALITY_HD = "hd";
  const QUALITY_4K = "4k";

  const DEFAULT_QUALITY = QUALITY_STANDARD;
  const DEFAULT_SIZE_OPTION = "720x1280";
  const QUALITY_OPTIONS = [
    { value: QUALITY_STANDARD, label: "标准 1K" },
    { value: QUALITY_HD, label: "高清 2K" },
    { value: QUALITY_4K, label: "超清 4K" },
  ];
  const QUALITY_ALIAS_MAP = new Map([
    ["standard", QUALITY_STANDARD],
    ["1k", QUALITY_STANDARD],
    ["low", QUALITY_STANDARD],
    ["hd", QUALITY_HD],
    ["2k", QUALITY_HD],
    ["medium", QUALITY_HD],
    ["4k", QUALITY_4K],
    ["high", QUALITY_4K],
    ["ultra", QUALITY_4K],
  ]);
  const ASPECT_LABELS = {
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
  const PRESET_SIZE_VALUES = {
    [QUALITY_STANDARD]: [
      ["1:1", "1024x1024"],
      ["16:9", "1280x720"],
      ["9:16", "720x1280"],
      ["3:2", "1248x832"],
      ["2:3", "832x1248"],
      ["4:3", "1152x864"],
      ["3:4", "864x1152"],
      ["5:4", "1120x896"],
      ["4:5", "896x1120"],
      ["21:9", "1456x624"],
    ],
    [QUALITY_HD]: [
      ["1:1", "2048x2048"],
      ["16:9", "2560x1440"],
      ["9:16", "1440x2560"],
      ["3:2", "2496x1664"],
      ["2:3", "1664x2496"],
      ["4:3", "2304x1728"],
      ["3:4", "1728x2304"],
      ["5:4", "2240x1792"],
      ["4:5", "1792x2240"],
      ["21:9", "3024x1296"],
    ],
    [QUALITY_4K]: [
      ["1:1", "2880x2880"],
      ["16:9", "3840x2160"],
      ["9:16", "2160x3840"],
      ["3:2", "3504x2336"],
      ["2:3", "2336x3504"],
      ["4:3", "3264x2448"],
      ["3:4", "2448x3264"],
      ["5:4", "3200x2560"],
      ["4:5", "2560x3200"],
      ["21:9", "3696x1584"],
    ],
  };
  const TIER_LONG_EDGE_MAX = new Map([
    [QUALITY_STANDARD, 1600],
    [QUALITY_HD, 2800],
  ]);
  const PIXEL_SIZE_PATTERN = /^[1-9]\d*x[1-9]\d*$/i;

  const SIZE_OPTIONS = QUALITY_OPTIONS.flatMap((quality) => {
    return PRESET_SIZE_VALUES[quality.value].map(([aspect, value]) => ({
      value,
      aspect,
      quality: quality.value,
      label: `${ASPECT_LABELS[aspect]} · ${value}`,
    }));
  });
  const SIZE_OPTIONS_BY_QUALITY = new Map(
    QUALITY_OPTIONS.map((quality) => [
      quality.value,
      SIZE_OPTIONS.filter((option) => option.quality === quality.value),
    ])
  );
  const sizeByValue = new Map(SIZE_OPTIONS.map((option) => [option.value, option]));
  const sizeByAspectAndQuality = new Map();
  Object.keys(ASPECT_LABELS).forEach((aspect) => {
    const entries = new Map();
    QUALITY_OPTIONS.forEach((quality) => {
      const option = SIZE_OPTIONS_BY_QUALITY.get(quality.value).find((item) => item.aspect === aspect);
      entries.set(quality.value, option);
    });
    sizeByAspectAndQuality.set(aspect, entries);
  });

  function parsePixelSize(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!PIXEL_SIZE_PATTERN.test(normalized)) {
      return null;
    }
    const [width, height] = normalized.split("x");
    return [Number.parseInt(width, 10), Number.parseInt(height, 10)];
  }

  function normalizeQuality(value, fallback = DEFAULT_QUALITY) {
    const normalized = String(value || "").trim().toLowerCase();
    const mapped = QUALITY_ALIAS_MAP.get(normalized) || normalized;
    return QUALITY_OPTIONS.some((option) => option.value === mapped) ? mapped : fallback;
  }

  function isSupportedQuality(value) {
    return QUALITY_OPTIONS.some((option) => option.value === normalizeQuality(value, ""));
  }

  function inferQualityFromSize(value, fallback = DEFAULT_QUALITY) {
    const pixelSize = parsePixelSize(value);
    if (!pixelSize) {
      return normalizeQuality(fallback);
    }
    const longEdge = Math.max(...pixelSize);
    if (longEdge <= TIER_LONG_EDGE_MAX.get(QUALITY_STANDARD)) {
      return QUALITY_STANDARD;
    }
    if (longEdge <= TIER_LONG_EDGE_MAX.get(QUALITY_HD)) {
      return QUALITY_HD;
    }
    return QUALITY_4K;
  }

  function defaultSizeForQuality(quality) {
    return sizeByAspectAndQuality.get("9:16").get(normalizeQuality(quality)).value;
  }

  function coerceSizeToQuality(value, quality, fallback = null) {
    const normalizedQuality = normalizeQuality(quality);
    const normalized = String(value || "").trim().toLowerCase();
    if (parsePixelSize(normalized)) {
      return normalized;
    }
    if (sizeByValue.has(normalized)) {
      return sizeByAspectAndQuality.get(sizeByValue.get(normalized).aspect).get(normalizedQuality).value;
    }
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized)) {
      return sizeByAspectAndQuality.get(normalized).get(normalizedQuality).value;
    }
    if (fallback && parsePixelSize(fallback)) {
      return String(fallback).trim().toLowerCase();
    }
    return defaultSizeForQuality(normalizedQuality);
  }

  function mapSizeToQuality(value, quality, fallback = null) {
    const normalizedQuality = normalizeQuality(quality);
    const normalized = String(value || "").trim().toLowerCase();
    if (sizeByValue.has(normalized)) {
      return sizeByAspectAndQuality.get(sizeByValue.get(normalized).aspect).get(normalizedQuality).value;
    }
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized)) {
      return sizeByAspectAndQuality.get(normalized).get(normalizedQuality).value;
    }
    if (parsePixelSize(normalized)) {
      return normalized;
    }
    return coerceSizeToQuality(normalized, normalizedQuality, fallback);
  }

  function normalizeSizeOption(value, fallback = DEFAULT_SIZE_OPTION, quality = DEFAULT_QUALITY) {
    const normalized = String(value || "").trim().toLowerCase();
    if (parsePixelSize(normalized)) {
      return normalized;
    }
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized)) {
      return sizeByAspectAndQuality.get(normalized).get(normalizeQuality(quality)).value;
    }
    const fallbackNormalized = String(fallback || "").trim().toLowerCase();
    if (parsePixelSize(fallbackNormalized)) {
      return fallbackNormalized;
    }
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, fallbackNormalized)) {
      return sizeByAspectAndQuality.get(fallbackNormalized).get(normalizeQuality(quality)).value;
    }
    return defaultSizeForQuality(quality);
  }

  function isSupportedSize(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return Boolean(parsePixelSize(normalized) || sizeByValue.has(normalized) || Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized));
  }

  function getSizeOptions(quality) {
    return SIZE_OPTIONS_BY_QUALITY.get(normalizeQuality(quality)) || [];
  }

  function formatQuality(value) {
    return QUALITY_OPTIONS.find((option) => option.value === normalizeQuality(value))?.label || QUALITY_OPTIONS[0].label;
  }

  function formatSize(value, quality = DEFAULT_QUALITY) {
    const normalized = normalizeSizeOption(value, DEFAULT_SIZE_OPTION, quality);
    if (sizeByValue.has(normalized)) {
      return sizeByValue.get(normalized).label;
    }
    return normalized;
  }

  window.OutputOptions = {
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    QUALITY_OPTIONS,
    SIZE_OPTIONS,
    normalizeQuality,
    isSupportedQuality,
    inferQualityFromSize,
    defaultSizeForQuality,
    coerceSizeToQuality,
    mapSizeToQuality,
    normalizeSizeOption,
    isSupportedSize,
    getSizeOptions,
    formatQuality,
    formatSize,
  };
})();
