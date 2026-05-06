from __future__ import annotations

from output_profiles import (
    ASPECT_LABELS,
    AUTO_OPTION,
    DEFAULT_OUTPUT_PROFILE_ID,
    OUTPUT_PROFILE_ASPECT_V1,
    OUTPUT_PROFILE_PIXEL_V1,
    QUALITY_4K,
    QUALITY_ALIASES_BY_PROFILE,
    QUALITY_HD,
    QUALITY_HIGH,
    QUALITY_LABELS_BY_PROFILE,
    QUALITY_LOW,
    QUALITY_MEDIUM,
    QUALITY_OPTIONS_BY_PROFILE,
    QUALITY_STANDARD,
    parse_pixel_size,
)


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
    if parse_pixel_size(normalized_size):
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
    default_value = str(fallback).strip().lower() if fallback is not None else default_quality(normalized_profile_id)
    if default_value not in QUALITY_OPTIONS_BY_PROFILE[normalized_profile_id]:
        default_value = default_quality(normalized_profile_id)
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


def default_quality(output_profile_id: str) -> str:
    if normalize_output_profile_id(output_profile_id) == OUTPUT_PROFILE_ASPECT_V1:
        return QUALITY_LOW
    return QUALITY_STANDARD


QUALITY_OPTIONS = available_quality_options()
QUALITY_LABELS = QUALITY_LABELS_BY_PROFILE[DEFAULT_OUTPUT_PROFILE_ID]
