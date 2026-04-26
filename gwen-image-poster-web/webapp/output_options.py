from __future__ import annotations

from dataclasses import dataclass
import re


AUTO_OPTION = "auto"
QUALITY_STANDARD = "standard"
QUALITY_HD = "hd"
QUALITY_4K = "4k"

DEFAULT_QUALITY = QUALITY_STANDARD
DEFAULT_SIZE_OPTION = "720x1280"
FIXED_QUALITY_OPTIONS = (QUALITY_STANDARD, QUALITY_HD, QUALITY_4K)
QUALITY_OPTIONS = (AUTO_OPTION, *FIXED_QUALITY_OPTIONS)
QUALITY_LABELS = {
    AUTO_OPTION: "自动",
    QUALITY_STANDARD: "标准 1K",
    QUALITY_HD: "高清 2K",
    QUALITY_4K: "超清 4K",
}
QUALITY_ALIAS_MAP = {
    "auto": AUTO_OPTION,
    "standard": QUALITY_STANDARD,
    "1k": QUALITY_STANDARD,
    "low": QUALITY_STANDARD,
    "hd": QUALITY_HD,
    "2k": QUALITY_HD,
    "medium": QUALITY_HD,
    "4k": QUALITY_4K,
    "high": QUALITY_4K,
    "ultra": QUALITY_4K,
}
PIXEL_SIZE_PATTERN = re.compile(r"^[1-9]\d*x[1-9]\d*$", re.IGNORECASE)
TIER_LONG_EDGE_MAX = {
    QUALITY_STANDARD: 1600,
    QUALITY_HD: 2800,
}

ASPECT_LABELS = {
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
}
PRESET_SIZE_VALUES = {
    QUALITY_STANDARD: (
        ("1:1", "1024x1024"),
        ("16:9", "1280x720"),
        ("9:16", "720x1280"),
        ("3:2", "1248x832"),
        ("2:3", "832x1248"),
        ("4:3", "1152x864"),
        ("3:4", "864x1152"),
        ("5:4", "1120x896"),
        ("4:5", "896x1120"),
        ("21:9", "1456x624"),
    ),
    QUALITY_HD: (
        ("1:1", "2048x2048"),
        ("16:9", "2560x1440"),
        ("9:16", "1440x2560"),
        ("3:2", "2496x1664"),
        ("2:3", "1664x2496"),
        ("4:3", "2304x1728"),
        ("3:4", "1728x2304"),
        ("5:4", "2240x1792"),
        ("4:5", "1792x2240"),
        ("21:9", "3024x1296"),
    ),
    QUALITY_4K: (
        ("1:1", "2880x2880"),
        ("16:9", "3840x2160"),
        ("9:16", "2160x3840"),
        ("3:2", "3504x2336"),
        ("2:3", "2336x3504"),
        ("4:3", "3264x2448"),
        ("3:4", "2448x3264"),
        ("5:4", "3200x2560"),
        ("4:5", "2560x3200"),
        ("21:9", "3696x1584"),
    ),
}


@dataclass(frozen=True)
class SizeOption:
    value: str
    label: str
    aspect: str
    quality: str
    width: int
    height: int


AUTO_SIZE_OPTION = SizeOption(AUTO_OPTION, "自动", AUTO_OPTION, AUTO_OPTION, 0, 0)


def _parse_pixel_size(value: object) -> tuple[int, int] | None:
    normalized = str(value or "").strip().lower()
    if not PIXEL_SIZE_PATTERN.fullmatch(normalized):
        return None
    width_text, height_text = normalized.split("x", 1)
    return int(width_text), int(height_text)


def _build_preset_size_options() -> tuple[SizeOption, ...]:
    options: list[SizeOption] = []
    for quality in FIXED_QUALITY_OPTIONS:
        for aspect, value in PRESET_SIZE_VALUES[quality]:
            width, height = _parse_pixel_size(value) or (0, 0)
            options.append(
                SizeOption(
                    value=value,
                    label=f"{ASPECT_LABELS[aspect]} · {value}",
                    aspect=aspect,
                    quality=quality,
                    width=width,
                    height=height,
                )
            )
    return tuple(options)


PRESET_SIZE_OPTIONS = _build_preset_size_options()
SIZE_OPTIONS = (AUTO_SIZE_OPTION, *PRESET_SIZE_OPTIONS)
SIZE_OPTIONS_BY_QUALITY = {
    AUTO_OPTION: (AUTO_SIZE_OPTION,),
    **{
        quality: (
            AUTO_SIZE_OPTION,
            *tuple(option for option in PRESET_SIZE_OPTIONS if option.quality == quality),
        )
        for quality in FIXED_QUALITY_OPTIONS
    },
}
SIZE_OPTION_MAP = {option.value: option for option in SIZE_OPTIONS}
SIZE_OPTIONS_BY_ASPECT_AND_QUALITY = {
    aspect: {
        quality: next(option for option in SIZE_OPTIONS_BY_QUALITY[quality] if option.aspect == aspect)
        for quality in FIXED_QUALITY_OPTIONS
    }
    for aspect in ASPECT_LABELS
}


def normalize_quality(value: object, *, fallback: str = DEFAULT_QUALITY) -> str:
    normalized = str(value or "").strip().lower()
    mapped = QUALITY_ALIAS_MAP.get(normalized, normalized)
    return mapped if mapped in QUALITY_OPTIONS else fallback


def is_supported_quality(value: object) -> bool:
    return normalize_quality(value, fallback="") in QUALITY_OPTIONS


def _size_lookup_quality(quality: object) -> str:
    normalized_quality = normalize_quality(quality)
    return DEFAULT_QUALITY if normalized_quality == AUTO_OPTION else normalized_quality


def available_size_options(quality: object) -> tuple[SizeOption, ...]:
    return SIZE_OPTIONS_BY_QUALITY[normalize_quality(quality)]


def default_size_for_quality(quality: object) -> str:
    normalized_quality = normalize_quality(quality)
    if normalized_quality == AUTO_OPTION:
        return AUTO_OPTION
    return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY["9:16"][normalized_quality].value


def infer_quality_from_size(value: object, *, fallback: str = DEFAULT_QUALITY) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == AUTO_OPTION:
        return AUTO_OPTION
    pixel_size = _parse_pixel_size(value)
    if pixel_size is None:
        if normalized in ASPECT_LABELS:
            return normalize_quality(fallback)
        return normalize_quality(fallback)

    long_edge = max(pixel_size)
    if long_edge <= TIER_LONG_EDGE_MAX[QUALITY_STANDARD]:
        return QUALITY_STANDARD
    if long_edge <= TIER_LONG_EDGE_MAX[QUALITY_HD]:
        return QUALITY_HD
    return QUALITY_4K


def coerce_size_to_quality(value: object, quality: object, *, fallback: str | None = None) -> str:
    normalized_quality = normalize_quality(quality)
    lookup_quality = _size_lookup_quality(normalized_quality)
    normalized = str(value or "").strip().lower()

    if normalized == AUTO_OPTION:
        return AUTO_OPTION
    if _parse_pixel_size(normalized):
        return normalized
    if normalized in SIZE_OPTION_MAP:
        option = SIZE_OPTION_MAP[normalized]
        if option.value == AUTO_OPTION:
            return AUTO_OPTION
        return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY[option.aspect][lookup_quality].value
    if normalized in ASPECT_LABELS:
        return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY[normalized][lookup_quality].value
    if fallback:
        fallback_normalized = str(fallback).strip().lower()
        if fallback_normalized == AUTO_OPTION:
            return AUTO_OPTION
        if _parse_pixel_size(fallback_normalized):
            return fallback_normalized
    return default_size_for_quality(normalized_quality)


def map_size_to_quality(value: object, quality: object, *, fallback: str | None = None) -> str:
    normalized_quality = normalize_quality(quality)
    lookup_quality = _size_lookup_quality(normalized_quality)
    normalized = str(value or "").strip().lower()
    if normalized == AUTO_OPTION:
        return AUTO_OPTION
    if normalized in SIZE_OPTION_MAP:
        option = SIZE_OPTION_MAP[normalized]
        if option.value == AUTO_OPTION:
            return AUTO_OPTION
        return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY[option.aspect][lookup_quality].value
    if normalized in ASPECT_LABELS:
        return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY[normalized][lookup_quality].value
    if _parse_pixel_size(normalized):
        return normalized
    return coerce_size_to_quality(normalized, normalized_quality, fallback=fallback)


def normalize_size_value(
    value: object,
    *,
    fallback: str = DEFAULT_SIZE_OPTION,
    quality: object = DEFAULT_QUALITY,
) -> str:
    normalized = str(value or "").strip().lower()
    lookup_quality = _size_lookup_quality(quality)
    if normalized == AUTO_OPTION:
        return AUTO_OPTION
    if _parse_pixel_size(normalized):
        return normalized
    if normalized in ASPECT_LABELS:
        return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY[normalized][lookup_quality].value
    fallback_normalized = str(fallback or "").strip().lower()
    if fallback_normalized == AUTO_OPTION:
        return AUTO_OPTION
    if _parse_pixel_size(fallback_normalized):
        return fallback_normalized
    if fallback_normalized in ASPECT_LABELS:
        return SIZE_OPTIONS_BY_ASPECT_AND_QUALITY[fallback_normalized][lookup_quality].value
    return default_size_for_quality(quality)


def is_supported_size_value(value: object) -> bool:
    normalized = str(value or "").strip().lower()
    return bool(_parse_pixel_size(normalized) or normalized in ASPECT_LABELS or normalized in SIZE_OPTION_MAP)


def normalize_size_option(
    value: object,
    *,
    fallback: str = DEFAULT_SIZE_OPTION,
    quality: object = DEFAULT_QUALITY,
) -> str:
    return normalize_size_value(value, fallback=fallback, quality=quality)


def is_supported_size_option(value: object) -> bool:
    return is_supported_size_value(value)


def resolve_api_size_value(size: object, quality: object) -> str:
    effective_quality = infer_quality_from_size(size, fallback=quality)
    return normalize_size_value(size, fallback=default_size_for_quality(effective_quality), quality=effective_quality)


def quality_label(value: object) -> str:
    return QUALITY_LABELS[normalize_quality(value)]


def size_label(value: object, *, quality: object = DEFAULT_QUALITY) -> str:
    normalized = normalize_size_value(value, quality=quality)
    option = SIZE_OPTION_MAP.get(normalized)
    if option:
        return option.label
    return normalized
