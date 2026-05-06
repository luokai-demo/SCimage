from __future__ import annotations

import re
from dataclasses import dataclass


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

DEFAULT_QUALITY = AUTO_OPTION
DEFAULT_SIZE_OPTION = AUTO_OPTION

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


def parse_pixel_size(value: object) -> tuple[int, int] | None:
    normalized = str(value or "").strip().lower()
    if not PIXEL_SIZE_PATTERN.fullmatch(normalized):
        return None
    width_text, height_text = normalized.split("x", 1)
    return int(width_text), int(height_text)


def build_pixel_size_options() -> tuple[SizeOption, ...]:
    options: list[SizeOption] = []
    for quality, entries in PRESET_PIXEL_SIZE_VALUES.items():
        for aspect, value in entries:
            width, height = parse_pixel_size(value) or (0, 0)
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
PIXEL_SIZE_OPTIONS = build_pixel_size_options()
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
