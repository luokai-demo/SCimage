from __future__ import annotations

from dataclasses import dataclass
from math import floor
import re


AUTO_OPTION = "auto"
OUTPUT_PROFILE_ASPECT_V1 = "aspect_v1"
OUTPUT_PROFILE_PIXEL_V1 = "pixel_v1"
DEFAULT_OUTPUT_PROFILE_ID = OUTPUT_PROFILE_PIXEL_V1

QUALITY_LOW = "low"
QUALITY_MEDIUM = "medium"
QUALITY_HIGH = "high"
QUALITY_STANDARD = "standard"
QUALITY_HD = "hd"
QUALITY_4K = "4k"

DEFAULT_QUALITY = QUALITY_STANDARD
DEFAULT_SIZE_OPTION = "720x1280"

API_EDGE_MULTIPLE = 16
API_MAX_EDGE = 3840
API_MAX_PIXELS = 8_294_400
API_MIN_PIXELS = 655_360

PIXEL_SIZE_PATTERN = re.compile(r"^[1-9]\d*x[1-9]\d*$", re.IGNORECASE)

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

QUALITY_LABELS_BY_PROFILE = {
    OUTPUT_PROFILE_ASPECT_V1: {
        AUTO_OPTION: "自动",
        QUALITY_LOW: "标准 1K",
        QUALITY_MEDIUM: "高清 2K",
        QUALITY_HIGH: "超清 4K",
    },
    OUTPUT_PROFILE_PIXEL_V1: {
        AUTO_OPTION: "自动",
        QUALITY_STANDARD: "标准 1K",
        QUALITY_HD: "高清 2K",
        QUALITY_4K: "超清 4K",
    },
}

QUALITY_ALIASES_BY_PROFILE = {
    OUTPUT_PROFILE_ASPECT_V1: {
        "auto": AUTO_OPTION,
        "1k": QUALITY_LOW,
        "2k": QUALITY_MEDIUM,
        "4k": QUALITY_HIGH,
        "low": QUALITY_LOW,
        "medium": QUALITY_MEDIUM,
        "high": QUALITY_HIGH,
        "standard": QUALITY_LOW,
        "hd": QUALITY_MEDIUM,
        "ultra": QUALITY_HIGH,
    },
    OUTPUT_PROFILE_PIXEL_V1: {
        "auto": AUTO_OPTION,
        "1k": QUALITY_STANDARD,
        "2k": QUALITY_HD,
        "4k": QUALITY_4K,
        "low": QUALITY_STANDARD,
        "medium": QUALITY_HD,
        "high": QUALITY_4K,
        "standard": QUALITY_STANDARD,
        "hd": QUALITY_HD,
        "ultra": QUALITY_4K,
    },
}

QUALITY_OPTIONS_BY_PROFILE = {
    profile_id: tuple(labels.keys())
    for profile_id, labels in QUALITY_LABELS_BY_PROFILE.items()
}

QUALITY_TARGET_LONG_EDGES = {
    QUALITY_LOW: 1024,
    QUALITY_MEDIUM: 2048,
    QUALITY_HIGH: API_MAX_EDGE,
}

OPENAI_SDK_IMAGE_QUALITY_MAP = {
    AUTO_OPTION: AUTO_OPTION,
    QUALITY_LOW: QUALITY_LOW,
    QUALITY_MEDIUM: QUALITY_MEDIUM,
    QUALITY_HIGH: QUALITY_HIGH,
    QUALITY_STANDARD: QUALITY_LOW,
    QUALITY_HD: QUALITY_MEDIUM,
    QUALITY_4K: QUALITY_HIGH,
}

PIXEL_TIER_LONG_EDGE_MAX = {
    QUALITY_STANDARD: 1600,
    QUALITY_HD: 2800,
}

PRESET_PIXEL_SIZE_VALUES = {
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
    width: int
    height: int


ASPECT_SIZE_OPTIONS = tuple(
    SizeOption(
        value=aspect,
        label=label,
        aspect=aspect,
        width=int(aspect.split(":", 1)[0]),
        height=int(aspect.split(":", 1)[1]),
    )
    for aspect, label in ASPECT_LABELS.items()
)
ASPECT_AUTO_SIZE_OPTION = SizeOption(AUTO_OPTION, "自动", AUTO_OPTION, 0, 0)
ASPECT_SIZE_OPTIONS_WITH_AUTO = (ASPECT_AUTO_SIZE_OPTION, *ASPECT_SIZE_OPTIONS)

PIXEL_AUTO_SIZE_OPTION = SizeOption(AUTO_OPTION, "自动", AUTO_OPTION, 0, 0)


def _parse_pixel_size(value: object) -> tuple[int, int] | None:
    normalized = str(value or "").strip().lower()
    if not PIXEL_SIZE_PATTERN.fullmatch(normalized):
        return None
    width_text, height_text = normalized.split("x", 1)
    return int(width_text), int(height_text)


def _build_pixel_size_options() -> tuple[SizeOption, ...]:
    options: list[SizeOption] = []
    for quality, entries in PRESET_PIXEL_SIZE_VALUES.items():
        for aspect, value in entries:
            width, height = _parse_pixel_size(value) or (0, 0)
            options.append(
                SizeOption(
                    value=value,
                    label=f"{ASPECT_LABELS[aspect]} · {value}",
                    aspect=aspect,
                    width=width,
                    height=height,
                )
            )
    return tuple(options)


PIXEL_SIZE_OPTIONS = _build_pixel_size_options()
PIXEL_FIXED_QUALITY_OPTIONS = (QUALITY_STANDARD, QUALITY_HD, QUALITY_4K)
PIXEL_SIZE_OPTIONS_BY_QUALITY = {
    AUTO_OPTION: (PIXEL_AUTO_SIZE_OPTION,),
    **{
        quality: (
            PIXEL_AUTO_SIZE_OPTION,
            *tuple(option for option in PIXEL_SIZE_OPTIONS if option.value in {value for _, value in PRESET_PIXEL_SIZE_VALUES[quality]}),
        )
        for quality in PIXEL_FIXED_QUALITY_OPTIONS
    },
}
PIXEL_SIZE_OPTION_MAP = {option.value: option for option in (PIXEL_AUTO_SIZE_OPTION, *PIXEL_SIZE_OPTIONS)}
PIXEL_SIZE_BY_ASPECT_AND_QUALITY = {
    aspect: {
        quality: next(option for option in PIXEL_SIZE_OPTIONS_BY_QUALITY[quality] if option.aspect == aspect)
        for quality in PIXEL_FIXED_QUALITY_OPTIONS
    }
    for aspect in ASPECT_LABELS
}


def normalize_output_profile_id(value: object, *, fallback: str = DEFAULT_OUTPUT_PROFILE_ID) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in QUALITY_OPTIONS_BY_PROFILE:
        return normalized
    return fallback


def infer_output_profile_id(
    quality: object,
    size: object,
    *,
    fallback: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_quality = str(quality or "").strip().lower()
    if normalized_quality in {QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH}:
        return OUTPUT_PROFILE_ASPECT_V1
    if normalized_quality in {QUALITY_STANDARD, QUALITY_HD, QUALITY_4K}:
        return OUTPUT_PROFILE_PIXEL_V1

    normalized_size = str(size or "").strip().lower()
    if normalized_size in ASPECT_LABELS:
        return OUTPUT_PROFILE_ASPECT_V1
    if _parse_pixel_size(normalized_size):
        return OUTPUT_PROFILE_PIXEL_V1
    return fallback


def normalize_quality(
    value: object,
    *,
    fallback: str | None = None,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = str(value or "").strip().lower()
    mapped = QUALITY_ALIASES_BY_PROFILE[normalized_profile_id].get(normalized, normalized)
    default_value = str(fallback).strip().lower() if fallback is not None else _default_quality(normalized_profile_id)
    if default_value not in QUALITY_OPTIONS_BY_PROFILE[normalized_profile_id]:
        default_value = _default_quality(normalized_profile_id)
    return mapped if mapped in QUALITY_OPTIONS_BY_PROFILE[normalized_profile_id] else default_value


def is_supported_quality(value: object, *, output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID) -> bool:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = normalize_quality(value, fallback="", output_profile_id=normalized_profile_id)
    return normalized in QUALITY_OPTIONS_BY_PROFILE[normalized_profile_id]


def available_quality_options(*, output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID) -> tuple[str, ...]:
    return QUALITY_OPTIONS_BY_PROFILE[normalize_output_profile_id(output_profile_id)]


def quality_label(value: object, *, output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = normalize_quality(value, output_profile_id=normalized_profile_id)
    return QUALITY_LABELS_BY_PROFILE[normalized_profile_id][normalized]


def _default_quality(output_profile_id: str) -> str:
    if normalize_output_profile_id(output_profile_id) == OUTPUT_PROFILE_ASPECT_V1:
        return QUALITY_LOW
    return QUALITY_STANDARD


QUALITY_OPTIONS = available_quality_options()
QUALITY_LABELS = QUALITY_LABELS_BY_PROFILE[DEFAULT_OUTPUT_PROFILE_ID]


def default_size_for_quality(
    quality: object,
    *,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized_quality = normalize_quality(quality, output_profile_id=normalized_profile_id)
    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return AUTO_OPTION if normalized_quality == AUTO_OPTION else "9:16"
    if normalized_quality == AUTO_OPTION:
        return AUTO_OPTION
    return PIXEL_SIZE_BY_ASPECT_AND_QUALITY["9:16"][normalized_quality].value


def _infer_aspect_from_size(value: object) -> str | None:
    normalized = str(value or "").strip().lower()
    if normalized in ASPECT_LABELS:
        return normalized
    pixel_size = _parse_pixel_size(normalized)
    if pixel_size is None:
        return None
    width, height = pixel_size
    ratio = width / height
    best_aspect = None
    best_delta = None
    for aspect in ASPECT_LABELS:
        aspect_width, aspect_height = map(int, aspect.split(":", 1))
        aspect_ratio = aspect_width / aspect_height
        delta = abs(aspect_ratio - ratio)
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best_aspect = aspect
    return best_aspect


def infer_quality_from_size(
    value: object,
    *,
    fallback: str = DEFAULT_QUALITY,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = str(value or "").strip().lower()
    if normalized == AUTO_OPTION:
        return AUTO_OPTION

    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return normalize_quality(fallback, output_profile_id=normalized_profile_id)

    pixel_size = _parse_pixel_size(value)
    if pixel_size is None:
        if normalized in ASPECT_LABELS:
            return normalize_quality(fallback, output_profile_id=normalized_profile_id)
        return normalize_quality(fallback, output_profile_id=normalized_profile_id)

    long_edge = max(pixel_size)
    if long_edge <= PIXEL_TIER_LONG_EDGE_MAX[QUALITY_STANDARD]:
        return QUALITY_STANDARD
    if long_edge <= PIXEL_TIER_LONG_EDGE_MAX[QUALITY_HD]:
        return QUALITY_HD
    return QUALITY_4K


def available_size_options(
    quality: object,
    *,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> tuple[SizeOption, ...]:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return ASPECT_SIZE_OPTIONS_WITH_AUTO
    return PIXEL_SIZE_OPTIONS_BY_QUALITY[normalize_quality(quality, output_profile_id=normalized_profile_id)]


def normalize_size_value(
    value: object,
    *,
    fallback: str = DEFAULT_SIZE_OPTION,
    quality: object = DEFAULT_QUALITY,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = str(value or "").strip().lower()
    if normalized == AUTO_OPTION:
        return AUTO_OPTION

    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        aspect = _infer_aspect_from_size(normalized)
        if aspect:
            return aspect
        fallback_aspect = _infer_aspect_from_size(fallback)
        if fallback_aspect:
            return fallback_aspect
        return default_size_for_quality(quality, output_profile_id=normalized_profile_id)

    lookup_quality = _size_lookup_quality(quality, output_profile_id=normalized_profile_id)
    if _parse_pixel_size(normalized):
        return normalized
    if normalized in PIXEL_SIZE_OPTION_MAP:
        option = PIXEL_SIZE_OPTION_MAP[normalized]
        if option.value == AUTO_OPTION:
            return AUTO_OPTION
        return PIXEL_SIZE_BY_ASPECT_AND_QUALITY[option.aspect][lookup_quality].value
    if normalized in ASPECT_LABELS:
        return PIXEL_SIZE_BY_ASPECT_AND_QUALITY[normalized][lookup_quality].value

    fallback_normalized = str(fallback or "").strip().lower()
    if fallback_normalized == AUTO_OPTION:
        return AUTO_OPTION
    if _parse_pixel_size(fallback_normalized):
        return fallback_normalized
    if fallback_normalized in ASPECT_LABELS:
        return PIXEL_SIZE_BY_ASPECT_AND_QUALITY[fallback_normalized][lookup_quality].value
    return default_size_for_quality(quality, output_profile_id=normalized_profile_id)


def normalize_size_option(
    value: object,
    *,
    fallback: str = DEFAULT_SIZE_OPTION,
    quality: object = DEFAULT_QUALITY,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    return normalize_size_value(
        value,
        fallback=fallback,
        quality=quality,
        output_profile_id=output_profile_id,
    )


def is_supported_size_value(value: object, *, output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID) -> bool:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = str(value or "").strip().lower()
    if normalized == AUTO_OPTION:
        return True
    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return bool(_infer_aspect_from_size(normalized))
    return bool(_parse_pixel_size(normalized) or normalized in ASPECT_LABELS or normalized in PIXEL_SIZE_OPTION_MAP)


def is_supported_size_option(value: object, *, output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID) -> bool:
    return is_supported_size_value(value, output_profile_id=output_profile_id)


def resolve_api_size_value(
    size: object,
    quality: object,
    *,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized_quality = normalize_quality(quality, output_profile_id=normalized_profile_id)
    normalized_size = normalize_size_value(size, quality=normalized_quality, output_profile_id=normalized_profile_id)
    if normalized_size == AUTO_OPTION:
        return AUTO_OPTION

    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        option = next(item for item in ASPECT_SIZE_OPTIONS if item.value == normalized_size)
        target_quality = normalized_quality if normalized_quality != AUTO_OPTION else QUALITY_LOW
        return _resolve_api_dimensions(option, QUALITY_TARGET_LONG_EDGES[target_quality])

    effective_quality = infer_quality_from_size(
        normalized_size,
        fallback=normalized_quality,
        output_profile_id=normalized_profile_id,
    )
    return normalize_size_value(
        normalized_size,
        fallback=default_size_for_quality(effective_quality, output_profile_id=normalized_profile_id),
        quality=effective_quality,
        output_profile_id=normalized_profile_id,
    )


def resolve_openai_sdk_quality(
    quality: object,
    *,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized_quality = normalize_quality(quality, output_profile_id=normalized_profile_id)
    return OPENAI_SDK_IMAGE_QUALITY_MAP.get(normalized_quality, QUALITY_LOW)


def resolve_openai_sdk_size_value(
    size: object,
    quality: object,
    *,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized_quality = normalize_quality(quality, output_profile_id=normalized_profile_id)
    normalized_size = normalize_size_value(size, quality=normalized_quality, output_profile_id=normalized_profile_id)
    if normalized_size == AUTO_OPTION:
        return AUTO_OPTION

    aspect = _infer_aspect_from_size(normalized_size)
    if not aspect:
        return AUTO_OPTION
    if aspect == "1:1":
        return "1024x1024"

    width_text, height_text = aspect.split(":", 1)
    return "1536x1024" if int(width_text) > int(height_text) else "1024x1536"


def size_label(
    value: object,
    *,
    quality: object = DEFAULT_QUALITY,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
) -> str:
    normalized_profile_id = normalize_output_profile_id(output_profile_id)
    normalized = normalize_size_value(
        value,
        fallback=default_size_for_quality(quality, output_profile_id=normalized_profile_id),
        quality=quality,
        output_profile_id=normalized_profile_id,
    )

    if normalized_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        if normalized == AUTO_OPTION:
            return "自动"
        original_pixel = _parse_pixel_size(value)
        if original_pixel:
            return f"{ASPECT_LABELS.get(normalized, normalized)} · {original_pixel[0]}x{original_pixel[1]}"
        return ASPECT_LABELS.get(normalized, normalized)

    option = PIXEL_SIZE_OPTION_MAP.get(normalized)
    if option:
        return option.label
    return normalized


def _size_lookup_quality(quality: object, *, output_profile_id: str) -> str:
    normalized_quality = normalize_quality(quality, output_profile_id=output_profile_id)
    return _default_quality(output_profile_id) if normalized_quality == AUTO_OPTION else normalized_quality


def _resolve_api_dimensions(option: SizeOption, target_long_edge: int) -> str:
    width_ratio = option.width
    height_ratio = option.height
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
