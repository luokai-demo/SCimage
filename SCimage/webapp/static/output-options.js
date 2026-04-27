"use strict";

(() => {
  const AUTO_OPTION = "auto";
  const OUTPUT_PROFILE_ASPECT_V1 = "aspect_v1";
  const OUTPUT_PROFILE_PIXEL_V1 = "pixel_v1";
  const DEFAULT_OUTPUT_PROFILE_ID = OUTPUT_PROFILE_PIXEL_V1;
  const API_EDGE_MULTIPLE = 16;
  const API_MAX_EDGE = 3840;
  const API_MAX_PIXELS = 8294400;
  const API_MIN_PIXELS = 655360;
  const PIXEL_SIZE_PATTERN = /^[1-9]\d*x[1-9]\d*$/i;
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
  const PROFILE_DEFS = {
    [OUTPUT_PROFILE_ASPECT_V1]: {
      defaultQuality: "low",
      defaultSize: "9:16",
      qualityOptions: [
        { value: AUTO_OPTION, label: "自动" },
        { value: "low", label: "标准 1K" },
        { value: "medium", label: "高清 2K" },
        { value: "high", label: "超清 4K" },
      ],
      qualityAliases: new Map([
        ["auto", AUTO_OPTION],
        ["1k", "low"],
        ["2k", "medium"],
        ["4k", "high"],
        ["low", "low"],
        ["medium", "medium"],
        ["high", "high"],
        ["standard", "low"],
        ["hd", "medium"],
        ["ultra", "high"],
      ]),
      sizeOptions: [
        { value: AUTO_OPTION, label: "自动", aspect: AUTO_OPTION, width: 0, height: 0 },
        ...Object.entries(ASPECT_LABELS).map(([aspect, label]) => {
          const [width, height] = aspect.split(":").map((value) => Number.parseInt(value, 10));
          return { value: aspect, label, aspect, width, height };
        }),
      ],
    },
    [OUTPUT_PROFILE_PIXEL_V1]: {
      defaultQuality: "standard",
      defaultSize: "720x1280",
      qualityOptions: [
        { value: AUTO_OPTION, label: "自动" },
        { value: "standard", label: "标准 1K" },
        { value: "hd", label: "高清 2K" },
        { value: "4k", label: "超清 4K" },
      ],
      qualityAliases: new Map([
        ["auto", AUTO_OPTION],
        ["1k", "standard"],
        ["2k", "hd"],
        ["4k", "4k"],
        ["low", "standard"],
        ["medium", "hd"],
        ["high", "4k"],
        ["standard", "standard"],
        ["hd", "hd"],
        ["ultra", "4k"],
      ]),
      pixelSizeValues: {
        standard: [
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
        hd: [
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
        "4k": [
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
      },
      tierLongEdgeMax: new Map([
        ["standard", 1600],
        ["hd", 2800],
      ]),
    },
  };
  const QUALITY_TARGET_LONG_EDGES = new Map([
    ["low", 1024],
    ["medium", 2048],
    ["high", API_MAX_EDGE],
  ]);

  let activeOutputProfileId = DEFAULT_OUTPUT_PROFILE_ID;

  const pixelProfile = PROFILE_DEFS[OUTPUT_PROFILE_PIXEL_V1];
  const pixelAutoOption = { value: AUTO_OPTION, label: "自动", aspect: AUTO_OPTION, quality: AUTO_OPTION, width: 0, height: 0 };
  const pixelPresetOptions = ["standard", "hd", "4k"].flatMap((quality) => {
    return pixelProfile.pixelSizeValues[quality].map(([aspect, value]) => {
      const [width, height] = parsePixelSize(value) || [0, 0];
      return {
        value,
        label: `${ASPECT_LABELS[aspect]} · ${value}`,
        aspect,
        quality,
        width,
        height,
      };
    });
  });
  pixelProfile.sizeOptionsByQuality = new Map([
    [AUTO_OPTION, [pixelAutoOption]],
    ["standard", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "standard")]],
    ["hd", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "hd")]],
    ["4k", [pixelAutoOption, ...pixelPresetOptions.filter((option) => option.quality === "4k")]],
  ]);
  pixelProfile.sizeByValue = new Map([pixelAutoOption, ...pixelPresetOptions].map((option) => [option.value, option]));
  pixelProfile.sizeByAspectAndQuality = new Map();
  Object.keys(ASPECT_LABELS).forEach((aspect) => {
    const entries = new Map();
    ["standard", "hd", "4k"].forEach((quality) => {
      entries.set(quality, pixelProfile.sizeOptionsByQuality.get(quality).find((option) => option.aspect === aspect));
    });
    pixelProfile.sizeByAspectAndQuality.set(aspect, entries);
  });

  const aspectProfile = PROFILE_DEFS[OUTPUT_PROFILE_ASPECT_V1];
  aspectProfile.sizeByValue = new Map(aspectProfile.sizeOptions.map((option) => [option.value, option]));

  function getProfile(outputProfileId) {
    return PROFILE_DEFS[normalizeOutputProfileId(outputProfileId)];
  }

  function normalizeOutputProfileId(value, fallback = DEFAULT_OUTPUT_PROFILE_ID) {
    const normalized = String(value || "").trim().toLowerCase();
    return PROFILE_DEFS[normalized] ? normalized : fallback;
  }

  function getActiveOutputProfileId() {
    return activeOutputProfileId;
  }

  function setActiveOutputProfile(value) {
    activeOutputProfileId = normalizeOutputProfileId(value);
    return activeOutputProfileId;
  }

  function getDefaultQuality(outputProfileId = activeOutputProfileId) {
    return getProfile(outputProfileId).defaultQuality;
  }

  function getDefaultSizeOption(outputProfileId = activeOutputProfileId) {
    return getProfile(outputProfileId).defaultSize;
  }

  function parsePixelSize(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!PIXEL_SIZE_PATTERN.test(normalized)) {
      return null;
    }
    const [width, height] = normalized.split("x");
    return [Number.parseInt(width, 10), Number.parseInt(height, 10)];
  }

  function inferOutputProfileId(quality, size, fallback = activeOutputProfileId) {
    const normalizedQuality = String(quality || "").trim().toLowerCase();
    if (["low", "medium", "high"].includes(normalizedQuality)) {
      return OUTPUT_PROFILE_ASPECT_V1;
    }
    if (["standard", "hd", "4k"].includes(normalizedQuality)) {
      return OUTPUT_PROFILE_PIXEL_V1;
    }
    const normalizedSize = String(size || "").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalizedSize)) {
      return OUTPUT_PROFILE_ASPECT_V1;
    }
    if (parsePixelSize(normalizedSize)) {
      return OUTPUT_PROFILE_PIXEL_V1;
    }
    return normalizeOutputProfileId(fallback);
  }

  function normalizeQuality(value, fallback = null, outputProfileId = activeOutputProfileId) {
    const profile = getProfile(outputProfileId);
    const normalized = String(value || "").trim().toLowerCase();
    const mapped = profile.qualityAliases.get(normalized) || normalized;
    let nextFallback = fallback == null ? profile.defaultQuality : String(fallback).trim().toLowerCase();
    if (!profile.qualityOptions.some((option) => option.value === nextFallback)) {
      nextFallback = profile.defaultQuality;
    }
    return profile.qualityOptions.some((option) => option.value === mapped) ? mapped : nextFallback;
  }

  function isSupportedQuality(value, outputProfileId = activeOutputProfileId) {
    const profile = getProfile(outputProfileId);
    const normalized = normalizeQuality(value, "", outputProfileId);
    return profile.qualityOptions.some((option) => option.value === normalized);
  }

  function getQualityOptions(outputProfileId = activeOutputProfileId) {
    return [...getProfile(outputProfileId).qualityOptions];
  }

  function inferAspectFromSize(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized)) {
      return normalized;
    }
    const pixelSize = parsePixelSize(normalized);
    if (!pixelSize) {
      return null;
    }
    const [width, height] = pixelSize;
    const ratio = width / height;
    let bestAspect = null;
    let bestDelta = null;
    Object.keys(ASPECT_LABELS).forEach((aspect) => {
      const [aspectWidth, aspectHeight] = aspect.split(":").map((item) => Number.parseInt(item, 10));
      const delta = Math.abs(aspectWidth / aspectHeight - ratio);
      if (bestDelta == null || delta < bestDelta) {
        bestDelta = delta;
        bestAspect = aspect;
      }
    });
    return bestAspect;
  }

  function getSizeLookupQuality(quality, outputProfileId = activeOutputProfileId) {
    const normalizedQuality = normalizeQuality(quality, null, outputProfileId);
    return normalizedQuality === AUTO_OPTION ? getDefaultQuality(outputProfileId) : normalizedQuality;
  }

  function defaultSizeForQuality(quality, outputProfileId = activeOutputProfileId) {
    const profileId = normalizeOutputProfileId(outputProfileId);
    const normalizedQuality = normalizeQuality(quality, null, profileId);
    if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
      return normalizedQuality === AUTO_OPTION ? AUTO_OPTION : "9:16";
    }
    if (normalizedQuality === AUTO_OPTION) {
      return AUTO_OPTION;
    }
    return pixelProfile.sizeByAspectAndQuality.get("9:16").get(normalizedQuality).value;
  }

  function inferQualityFromSize(value, fallback = null, outputProfileId = activeOutputProfileId) {
    const profileId = normalizeOutputProfileId(outputProfileId);
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === AUTO_OPTION) {
      return AUTO_OPTION;
    }
    if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
      return normalizeQuality(fallback, null, profileId);
    }
    const pixelSize = parsePixelSize(normalized);
    if (!pixelSize) {
      return normalizeQuality(fallback, null, profileId);
    }
    const longEdge = Math.max(...pixelSize);
    if (longEdge <= pixelProfile.tierLongEdgeMax.get("standard")) {
      return "standard";
    }
    if (longEdge <= pixelProfile.tierLongEdgeMax.get("hd")) {
      return "hd";
    }
    return "4k";
  }

  function normalizeSizeOption(value, fallback = null, quality = null, outputProfileId = activeOutputProfileId) {
    const profileId = normalizeOutputProfileId(outputProfileId);
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === AUTO_OPTION) {
      return AUTO_OPTION;
    }

    if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
      const aspect = inferAspectFromSize(normalized);
      if (aspect) {
        return aspect;
      }
      const fallbackAspect = inferAspectFromSize(fallback);
      if (fallbackAspect) {
        return fallbackAspect;
      }
      return defaultSizeForQuality(quality, profileId);
    }

    const lookupQuality = getSizeLookupQuality(quality, profileId);
    if (parsePixelSize(normalized)) {
      return normalized;
    }
    if (pixelProfile.sizeByValue.has(normalized)) {
      const option = pixelProfile.sizeByValue.get(normalized);
      if (option.value === AUTO_OPTION) {
        return AUTO_OPTION;
      }
      return pixelProfile.sizeByAspectAndQuality.get(option.aspect).get(lookupQuality).value;
    }
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized)) {
      return pixelProfile.sizeByAspectAndQuality.get(normalized).get(lookupQuality).value;
    }
    const fallbackNormalized = String(fallback || "").trim().toLowerCase();
    if (fallbackNormalized === AUTO_OPTION) {
      return AUTO_OPTION;
    }
    if (parsePixelSize(fallbackNormalized)) {
      return fallbackNormalized;
    }
    if (Object.prototype.hasOwnProperty.call(ASPECT_LABELS, fallbackNormalized)) {
      return pixelProfile.sizeByAspectAndQuality.get(fallbackNormalized).get(lookupQuality).value;
    }
    return defaultSizeForQuality(quality, profileId);
  }

  function mapSizeToQuality(value, quality, fallback = null, outputProfileId = activeOutputProfileId) {
    return normalizeSizeOption(value, fallback, quality, outputProfileId);
  }

  function isSupportedSizeOption(value, outputProfileId = activeOutputProfileId) {
    const profileId = normalizeOutputProfileId(outputProfileId);
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === AUTO_OPTION) {
      return true;
    }
    if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
      return Boolean(inferAspectFromSize(normalized));
    }
    return Boolean(parsePixelSize(normalized) || pixelProfile.sizeByValue.has(normalized) || Object.prototype.hasOwnProperty.call(ASPECT_LABELS, normalized));
  }

  function getSizeOptions(quality, outputProfileId = activeOutputProfileId) {
    const profileId = normalizeOutputProfileId(outputProfileId);
    if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
      return [...aspectProfile.sizeOptions];
    }
    return [...(pixelProfile.sizeOptionsByQuality.get(normalizeQuality(quality, null, profileId)) || [pixelAutoOption])];
  }

  function resolveApiDimensions(option, targetLongEdge) {
    const ratio = option.width / option.height;
    let width;
    let height;
    if (option.width >= option.height) {
      width = floorToMultiple(targetLongEdge);
      height = floorToMultiple(width / ratio);
    } else {
      height = floorToMultiple(targetLongEdge);
      width = floorToMultiple(height * ratio);
    }

    while (width * height > API_MAX_PIXELS) {
      if (width >= height) {
        width -= API_EDGE_MULTIPLE;
        height = floorToMultiple(width / ratio);
      } else {
        height -= API_EDGE_MULTIPLE;
        width = floorToMultiple(height * ratio);
      }
    }

    while (width * height < API_MIN_PIXELS) {
      if (width >= height) {
        width += API_EDGE_MULTIPLE;
        height = floorToMultiple(width / ratio);
      } else {
        height += API_EDGE_MULTIPLE;
        width = floorToMultiple(height * ratio);
      }
      if (width > API_MAX_EDGE || height > API_MAX_EDGE) {
        break;
      }
    }

    width = Math.min(API_MAX_EDGE, Math.max(API_EDGE_MULTIPLE, width));
    height = Math.min(API_MAX_EDGE, Math.max(API_EDGE_MULTIPLE, height));
    return `${width}x${height}`;
  }

  function floorToMultiple(value, multiple = API_EDGE_MULTIPLE) {
    return Math.max(multiple, Math.floor(value / multiple) * multiple);
  }

  function formatQuality(value, outputProfileId = activeOutputProfileId) {
    const profile = getProfile(outputProfileId);
    const normalized = normalizeQuality(value, null, outputProfileId);
    return profile.qualityOptions.find((option) => option.value === normalized)?.label || profile.qualityOptions[0].label;
  }

  function formatSize(value, quality = null, outputProfileId = activeOutputProfileId) {
    const profileId = normalizeOutputProfileId(outputProfileId);
    const normalized = normalizeSizeOption(value, defaultSizeForQuality(quality, profileId), quality, profileId);
    if (profileId === OUTPUT_PROFILE_ASPECT_V1) {
      if (normalized === AUTO_OPTION) {
        return "自动";
      }
      const originalPixel = parsePixelSize(value);
      return originalPixel
        ? `${ASPECT_LABELS[normalized]} · ${originalPixel[0]}x${originalPixel[1]}`
        : ASPECT_LABELS[normalized];
    }
    return pixelProfile.sizeByValue.get(normalized)?.label || normalized;
  }

  window.OutputOptions = {
    AUTO_OPTION,
    OUTPUT_PROFILE_ASPECT_V1,
    OUTPUT_PROFILE_PIXEL_V1,
    DEFAULT_OUTPUT_PROFILE_ID,
    DEFAULT_QUALITY: getDefaultQuality(),
    DEFAULT_SIZE_OPTION: getDefaultSizeOption(),
    getActiveOutputProfileId,
    setActiveOutputProfile,
    normalizeOutputProfileId,
    inferOutputProfileId,
    getDefaultQuality,
    getDefaultSizeOption,
    getQualityOptions,
    getSizeOptions,
    normalizeQuality,
    isSupportedQuality,
    defaultSizeForQuality,
    inferQualityFromSize,
    normalizeSizeOption,
    mapSizeToQuality,
    isSupportedSize: isSupportedSizeOption,
    isSupportedSizeOption,
    formatQuality,
    formatSize,
  };
})();
