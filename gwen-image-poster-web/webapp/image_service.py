from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Dict, List

from generated_assets import recreate_job_output_dir
from image_generation_runtime import (
    ImageGenerationRequest,
    execute_image_generation,
    normalize_generation_error,
)
from image_records import build_generated_image_record
from provider_profiles import ProviderProfile
from source_images import resolve_source_image_paths
from workflows import requires_source_images

if TYPE_CHECKING:
    from job_control import JobRunner


@dataclass(frozen=True)
class GenerationResult:
    images: List[dict]
    errors: List[str]
    cancelled: bool = False


def _build_image_payload(job_id: str, file_path: Path, slot: int) -> dict:
    return build_generated_image_record(job_id, file_path, slot)


def _images_from_paths(job_id: str, paths: list[Path], expected_count: int) -> list[dict]:
    return [
        _build_image_payload(job_id=job_id, file_path=file_path, slot=slot)
        for slot, file_path in enumerate(paths[:expected_count], start=1)
    ]


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
    request = ImageGenerationRequest(
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

    if status_callback:
        status_callback(f"正在调用图像接口，一次请求生成 {count} 张图片，模型 {provider_profile.model}。")

    try:
        response = execute_image_generation(
            request,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    except Exception as exc:
        if cancel_event and cancel_event.is_set():
            return GenerationResult(images=[], errors=[], cancelled=True)
        raise RuntimeError(normalize_generation_error(str(exc))) from exc

    if cancel_event and cancel_event.is_set():
        return GenerationResult(images=[], errors=[], cancelled=True)

    images = _images_from_paths(job_id, list(response.saved_paths), count)
    errors: list[str] = []

    for completed_count, image in enumerate(images, start=1):
        if image_callback:
            image_callback(image, completed_count, count)

    if len(images) < count:
        errors.append(f"上游接口只返回 {len(images)}/{count} 张图片。")
    if not images:
        raise RuntimeError(errors[0] if errors else "脚本执行完成，但没有发现生成图片。")

    return GenerationResult(images=images, errors=errors)
