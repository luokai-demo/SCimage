from __future__ import annotations

from dataclasses import dataclass

from output_options import (
    DEFAULT_OUTPUT_PROFILE_ID,
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    normalize_output_profile_id,
    normalize_quality,
    normalize_size_value,
    resolve_api_size_value,
    resolve_openai_sdk_quality,
    resolve_openai_sdk_size_value,
)
from provider_compat import get_compat_profile, normalize_compat_profile_id


@dataclass(frozen=True)
class ResolvedImageGenerationParams:
    compat_profile: object
    output_profile_id: str
    quality: str
    size: str
    api_size: str
    sdk_quality: str
    sdk_size: str


def resolve_image_generation_params(
    *,
    compat_profile_id: str,
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
    quality: str = DEFAULT_QUALITY,
    size: str = DEFAULT_SIZE_OPTION,
) -> ResolvedImageGenerationParams:
    compat_profile = get_compat_profile(normalize_compat_profile_id(compat_profile_id))
    normalized_output_profile_id = normalize_output_profile_id(
        output_profile_id,
        fallback=compat_profile.output_profile_id,
    )
    normalized_quality = normalize_quality(
        quality,
        fallback=DEFAULT_QUALITY,
        output_profile_id=normalized_output_profile_id,
    )
    normalized_size = normalize_size_value(
        size,
        fallback=DEFAULT_SIZE_OPTION,
        quality=normalized_quality,
        output_profile_id=normalized_output_profile_id,
    )
    return ResolvedImageGenerationParams(
        compat_profile=compat_profile,
        output_profile_id=normalized_output_profile_id,
        quality=normalized_quality,
        size=normalized_size,
        api_size=resolve_api_size_value(
            normalized_size,
            normalized_quality,
            output_profile_id=normalized_output_profile_id,
        ),
        sdk_quality=resolve_openai_sdk_quality(
            normalized_quality,
            output_profile_id=normalized_output_profile_id,
        ),
        sdk_size=resolve_openai_sdk_size_value(
            normalized_size,
            normalized_quality,
            output_profile_id=normalized_output_profile_id,
        ),
    )
