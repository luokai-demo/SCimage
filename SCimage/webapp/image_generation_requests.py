from __future__ import annotations

from pathlib import Path

from image_generation_runtime import ImageGenerationRequest
from provider_profiles import ProviderProfile


def build_generation_request(
    *,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    output_paths: tuple[Path, ...],
    source_image_paths: list[Path],
    provider_profile: ProviderProfile,
) -> ImageGenerationRequest:
    return ImageGenerationRequest(
        workflow=workflow,
        prompt=prompt,
        api_key=provider_profile.api_key,
        base_url=provider_profile.base_url,
        model=provider_profile.model,
        compat_profile_id=provider_profile.compat_profile_id,
        output_profile_id=provider_profile.compat_profile().output_profile_id,
        quality=quality,
        size=size,
        count=count,
        output_paths=output_paths,
        source_image_paths=tuple(source_image_paths),
    )
