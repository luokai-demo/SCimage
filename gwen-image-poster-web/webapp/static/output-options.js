"use strict";

(() => {
  const DEFAULT_QUALITY = "low";
  const DEFAULT_SIZE_OPTION = "9:16";
  const QUALITY_OPTIONS = [
    { value: "low", label: "标准 1K" },
    { value: "medium", label: "高清 2K" },
    { value: "high", label: "超清 4K" },
  ];
  const SIZE_OPTIONS = [
    { value: "1:1", label: "1:1 方形" },
    { value: "16:9", label: "16:9 横屏" },
    { value: "9:16", label: "9:16 竖屏" },
    { value: "4:3", label: "4:3 横屏" },
    { value: "3:4", label: "3:4 竖屏" },
    { value: "3:2", label: "3:2 横屏（相机）" },
    { value: "2:3", label: "2:3 竖屏（相机）" },
    { value: "4:5", label: "4:5 竖屏（社媒）" },
    { value: "5:4", label: "5:4 横屏" },
    { value: "21:9", label: "21:9 超宽屏" },
  ];

  const qualityByValue = new Map(QUALITY_OPTIONS.map((option) => [option.value, option]));
  const sizeByValue = new Map(SIZE_OPTIONS.map((option) => [option.value, option]));

  function normalizeQuality(value, fallback = DEFAULT_QUALITY) {
    const normalized = String(value || "").trim().toLowerCase();
    return qualityByValue.has(normalized) ? normalized : fallback;
  }

  function isSupportedQuality(value) {
    return qualityByValue.has(String(value || "").trim().toLowerCase());
  }

  function normalizeSizeOption(value, fallback = DEFAULT_SIZE_OPTION) {
    const normalized = String(value || "").trim().toLowerCase();
    if (sizeByValue.has(normalized)) {
      return normalized;
    }
    return fallback;
  }

  function isSupportedSize(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return sizeByValue.has(normalized);
  }

  function formatQuality(value) {
    return qualityByValue.get(normalizeQuality(value))?.label || qualityByValue.get(DEFAULT_QUALITY).label;
  }

  function formatSize(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (sizeByValue.has(normalized)) {
      return sizeByValue.get(normalized).label;
    }
    return sizeByValue.get(DEFAULT_SIZE_OPTION).label;
  }

  window.OutputOptions = {
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    QUALITY_OPTIONS,
    SIZE_OPTIONS,
    normalizeQuality,
    isSupportedQuality,
    normalizeSizeOption,
    isSupportedSize,
    formatQuality,
    formatSize,
  };
})();
