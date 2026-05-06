from __future__ import annotations

from math import floor

from output_profiles import (
    API_EDGE_MULTIPLE,
    API_MAX_EDGE,
    API_MAX_PIXELS,
    API_MIN_PIXELS,
    ASPECT_LABELS,
    ASPECT_SIZE_OPTIONS,
    ASPECT_SIZE_OPTIONS_WITH_AUTO,
    AUTO_OPTION,
    DEFAULT_OUTPUT_PROFILE_ID,
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    OPENAI_SDK_IMAGE_QUALITY_MAP,
    OUTPUT_PROFILE_ASPECT_V1,
    PIXEL_SIZE_BY_ASPECT_AND_QUALITY,
    PIXEL_SIZE_OPTION_MAP,
    PIXEL_SIZE_OPTIONS_BY_QUALITY,
    PIXEL_TIER_LONG_EDGE_MAX,
    QUALITY_4K,
    QUALITY_HD,
    QUALITY_LOW,
    QUALITY_STANDARD,
    QUALITY_TARGET_LONG_EDGES,
    SizeOption,
    parse_pixel_size,
)
from output_quality import default_quality, normalize_output_profile_id, normalize_quality


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

    pixel_size = parse_pixel_size(value)
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
        aspect = infer_aspect_from_size(normalized)
        if aspect:
            return aspect
        fallback_aspect = infer_aspect_from_size(fallback)
        if fallback_aspect:
            return fallback_aspect
        return default_size_for_quality(quality, output_profile_id=normalized_profile_id)

    lookup_quality = size_lookup_quality(quality, output_profile_id=normalized_profile_id)
    if parse_pixel_size(normalized):
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
    if parse_pixel_size(fallback_normalized):
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
        return bool(infer_aspect_from_size(normalized))
    return bool(parse_pixel_size(normalized) or normalized in ASPECT_LABELS or normalized in PIXEL_SIZE_OPTION_MAP)


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
        return resolve_api_dimensions(option, QUALITY_TARGET_LONG_EDGES[target_quality])

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

    aspect = infer_aspect_from_size(normalized_size)
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
        original_pixel = parse_pixel_size(value)
        if original_pixel:
            return f"{ASPECT_LABELS.get(normalized, normalized)} · {original_pixel[0]}x{original_pixel[1]}"
        return ASPECT_LABELS.get(normalized, normalized)

    option = PIXEL_SIZE_OPTION_MAP.get(normalized)
    if option:
        return option.label
    return normalized


def infer_aspect_from_size(value: object) -> str | None:
    normalized = str(value or "").strip().lower()
    if normalized in ASPECT_LABELS:
        return normalized
    pixel_size = parse_pixel_size(normalized)
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


def size_lookup_quality(quality: object, *, output_profile_id: str) -> str:
    normalized_quality = normalize_quality(quality, output_profile_id=output_profile_id)
    return default_quality(output_profile_id) if normalized_quality == AUTO_OPTION else normalized_quality


def resolve_api_dimensions(option: SizeOption, target_long_edge: int) -> str:
    width_ratio = option.width
    height_ratio = option.height
    ratio = width_ratio / height_ratio
    if width_ratio >= height_ratio:
        width = floor_to_multiple(target_long_edge)
        height = floor_to_multiple(width / ratio)
    else:
        height = floor_to_multiple(target_long_edge)
        width = floor_to_multiple(height * ratio)

    while width * height > API_MAX_PIXELS:
        if width >= height:
            width -= API_EDGE_MULTIPLE
            height = floor_to_multiple(width / ratio)
        else:
            height -= API_EDGE_MULTIPLE
            width = floor_to_multiple(height * ratio)

    while width * height < API_MIN_PIXELS:
        if width >= height:
            width += API_EDGE_MULTIPLE
            height = floor_to_multiple(width / ratio)
        else:
            height += API_EDGE_MULTIPLE
            width = floor_to_multiple(height * ratio)
        if width > API_MAX_EDGE or height > API_MAX_EDGE:
            break

    width = min(API_MAX_EDGE, max(API_EDGE_MULTIPLE, width))
    height = min(API_MAX_EDGE, max(API_EDGE_MULTIPLE, height))
    return f"{width}x{height}"


def floor_to_multiple(value: float, multiple: int = API_EDGE_MULTIPLE) -> int:
    return max(multiple, int(floor(value / multiple) * multiple))
