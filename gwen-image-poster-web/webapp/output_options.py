from __future__ import annotations

from dataclasses import dataclass
from math import floor


DEFAULT_QUALITY = "low"
DEFAULT_SIZE_OPTION = "9:16"
QUALITY_OPTIONS = ("low", "medium", "high")
QUALITY_LABELS = {
    "low": "标准 1K",
    "medium": "高清 2K",
    "high": "超清 4K",
}
API_EDGE_MULTIPLE = 16
API_MAX_EDGE = 3840
API_MAX_PIXELS = 8_294_400
API_MIN_PIXELS = 655_360
QUALITY_TARGET_LONG_EDGES = {
    "low": 1024,
    "medium": 2048,
    "high": API_MAX_EDGE,
}


@dataclass(frozen=True)
class SizeOption:
    value: str
    label: str
    width_ratio: int
    height_ratio: int


SIZE_OPTIONS = (
    SizeOption("1:1", "1:1 方形", 1, 1),
    SizeOption("16:9", "16:9 横屏", 16, 9),
    SizeOption("9:16", "9:16 竖屏", 9, 16),
    SizeOption("4:3", "4:3 横屏", 4, 3),
    SizeOption("3:4", "3:4 竖屏", 3, 4),
    SizeOption("3:2", "3:2 横屏（相机）", 3, 2),
    SizeOption("2:3", "2:3 竖屏（相机）", 2, 3),
    SizeOption("4:5", "4:5 竖屏（社媒）", 4, 5),
    SizeOption("5:4", "5:4 横屏", 5, 4),
    SizeOption("21:9", "21:9 超宽屏", 21, 9),
)
SIZE_OPTION_MAP = {option.value: option for option in SIZE_OPTIONS}


def normalize_quality(value: object, *, fallback: str = DEFAULT_QUALITY) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in QUALITY_OPTIONS else fallback


def normalize_size_option(value: object, *, fallback: str = DEFAULT_SIZE_OPTION) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in SIZE_OPTION_MAP:
        return normalized
    return fallback


def is_supported_size_option(value: object) -> bool:
    normalized_size = str(value or "").strip().lower()
    return normalized_size in SIZE_OPTION_MAP


def resolve_api_size_value(size: object, quality: object) -> str:
    option = SIZE_OPTION_MAP[normalize_size_option(size)]
    normalized_quality = normalize_quality(quality)
    target_long_edge = QUALITY_TARGET_LONG_EDGES[normalized_quality]
    return _resolve_api_dimensions(option, target_long_edge)


def _resolve_api_dimensions(option: SizeOption, target_long_edge: int) -> str:
    width_ratio = option.width_ratio
    height_ratio = option.height_ratio
    ratio = width_ratio / height_ratio
    if width_ratio >= height_ratio:
        width = _floor_to_multiple(target_long_edge)
        height = _floor_to_multiple(width / ratio)
    else:
        height = _floor_to_multiple(target_long_edge)
        width = _floor_to_multiple(height * ratio)

    while width * height > API_MAX_PIXELS:
        if width >= height:
            width -= API_EDGE_MULTIPLE
            height = _floor_to_multiple(width / ratio)
        else:
            height -= API_EDGE_MULTIPLE
            width = _floor_to_multiple(height * ratio)

    while width * height < API_MIN_PIXELS:
        if width >= height:
            width += API_EDGE_MULTIPLE
            height = _floor_to_multiple(width / ratio)
        else:
            height += API_EDGE_MULTIPLE
            width = _floor_to_multiple(height * ratio)
        if width > API_MAX_EDGE or height > API_MAX_EDGE:
            break

    width = min(API_MAX_EDGE, max(API_EDGE_MULTIPLE, width))
    height = min(API_MAX_EDGE, max(API_EDGE_MULTIPLE, height))
    return f"{width}x{height}"


def _floor_to_multiple(value: float, multiple: int = API_EDGE_MULTIPLE) -> int:
    return max(multiple, int(floor(value / multiple) * multiple))
