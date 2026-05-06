from __future__ import annotations

from threading import Event
from typing import TYPE_CHECKING, Callable, Dict, List

from generated_assets import recreate_job_output_dir
from image_count_strategies import (
    generate_images_with_parallel_single_requests,
    generate_images_with_upstream_count,
)
from image_generation_results import GenerationResult, build_image_payload as _build_image_payload
from provider_profiles import ProviderProfile
from source_images import resolve_source_image_paths
from workflows import requires_source_images

if TYPE_CHECKING:
    from job_control import JobRunner


def generate_images(
    job_id: str,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    source_images: List[Dict[str, str]],
    provider_profile: ProviderProfile,
    status_callback: Callable[[str], None] | None = None,
    image_callback: Callable[[dict, int, int], None] | None = None,
    cancel_event: Event | None = None,
    runner: "JobRunner" | None = None,
) -> GenerationResult:
    if cancel_event and cancel_event.is_set():
        return GenerationResult(images=[], errors=[], cancelled=True)

    source_image_paths = resolve_source_image_paths(source_images) if requires_source_images(workflow) else []
    output_dir = recreate_job_output_dir(job_id)
    output_paths = tuple(output_dir / f"image-{index}.png" for index in range(1, count + 1))
    if provider_profile.supports_count_parameter or count == 1:
        return generate_images_with_upstream_count(
            job_id=job_id,
            workflow=workflow,
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
            source_image_paths=source_image_paths,
            output_paths=output_paths,
            provider_profile=provider_profile,
            status_callback=status_callback,
            image_callback=image_callback,
            cancel_event=cancel_event,
            runner=runner,
        )

    return generate_images_with_parallel_single_requests(
        job_id=job_id,
        workflow=workflow,
        prompt=prompt,
        count=count,
        quality=quality,
        size=size,
        source_image_paths=source_image_paths,
        output_paths=output_paths,
        provider_profile=provider_profile,
        status_callback=status_callback,
        image_callback=image_callback,
        cancel_event=cancel_event,
        runner=runner,
    )
