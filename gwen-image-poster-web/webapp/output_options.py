from __future__ import annotations

from dataclasses import dataclass
import re


DEFAULT_QUALITY = "low"
DEFAULT_SIZE_OPTION = "9:16"
QUALITY_OPTIONS = ("low", "medium", "high")
QUALITY_LABELS = {
    "low": "标准 1K",
    "medium": "高清 2K",
    "high": "超清 4K",
}
_PIXEL_SIZE_PATTERN = re.compile(r"^[1-9]\d*x[1-9]\d*$", re.IGNORECASE)


@dataclass(frozen=True)
class SizeOption:
    value: str
    label: str


SIZE_OPTIONS = (
    SizeOption("1:1", "1:1 方形"),
    SizeOption("16:9", "16:9 横屏"),
    SizeOption("9:16", "9:16 竖屏"),
    SizeOption("4:3", "4:3 横屏"),
    SizeOption("3:4", "3:4 竖屏"),
    SizeOption("3:2", "3:2 横屏（相机）"),
    SizeOption("2:3", "2:3 竖屏（相机）"),
    SizeOption("4:5", "4:5 竖屏（社媒）"),
    SizeOption("5:4", "5:4 横屏"),
    SizeOption("21:9", "21:9 超宽屏"),
)
SIZE_OPTION_MAP = {option.value: option for option in SIZE_OPTIONS}


def normalize_quality(value: object, *, fallback: str = DEFAULT_QUALITY) -> str:
    normalized = str(value or "").strip().lower()
    aliases = {
        "standard": "low",
        "standard_1k": "low",
        "1k": "low",
        "hd": "medium",
        "hd_2k": "medium",
        "2k": "medium",
        "ultra": "high",
        "ultra_4k": "high",
        "4k": "high",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in QUALITY_OPTIONS else fallback


def is_supported_quality(value: object) -> bool:
    return str(value or "").strip().lower() in QUALITY_OPTIONS


def is_pixel_size(value: object) -> bool:
    return bool(_PIXEL_SIZE_PATTERN.fullmatch(str(value or "").strip()))


def normalize_size_option(value: object, *, fallback: str = DEFAULT_SIZE_OPTION) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in SIZE_OPTION_MAP:
        return normalized
    return fallback


def is_supported_size_option(value: object) -> bool:
    normalized_size = str(value or "").strip().lower()
    return normalized_size in SIZE_OPTION_MAP


def normalize_size_value(value: object, *, fallback: str = DEFAULT_SIZE_OPTION) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in SIZE_OPTION_MAP or is_pixel_size(normalized):
        return normalized
    return fallback


def is_supported_size_value(value: object) -> bool:
    normalized_size = str(value or "").strip().lower()
    return normalized_size in SIZE_OPTION_MAP or is_pixel_size(normalized_size)


def quality_label(value: object) -> str:
    return QUALITY_LABELS.get(normalize_quality(value), QUALITY_LABELS[DEFAULT_QUALITY])


def size_label(value: object) -> str:
    normalized = str(value or "").strip().lower()
    option = SIZE_OPTION_MAP.get(normalized)
    if option:
        return option.label
    if is_pixel_size(normalized):
        return normalized
    return SIZE_OPTION_MAP[DEFAULT_SIZE_OPTION].label
