from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Dict, List

from generated_assets import recreate_job_output_dir
from image_records import build_generated_image_record
from image_script import (
    ImageScriptRequest,
    JobCanceled,
    build_image_script_command,
    normalize_script_error,
    resolve_output_paths,
    run_image_script,
)
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


def _build_script_env(provider_profile: ProviderProfile) -> dict[str, str]:
    script_env = os.environ.copy()
    script_env["IMAGE_API_BASE_URL"] = provider_profile.base_url
    script_env["IMAGE_API_KEY"] = provider_profile.api_key
    script_env["IMAGE_API_MODEL"] = provider_profile.model
    script_env["IMAGE_API_COMPAT_PROFILE"] = provider_profile.compat_profile_id
    script_env["IMAGE_API_OUTPUT_PROFILE"] = provider_profile.compat_profile().output_profile_id
    return script_env


def _build_script_request(
    *,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    output_dir: Path,
    provider_profile: ProviderProfile,
    source_image_paths: list[Path],
) -> ImageScriptRequest:
    compat_profile = provider_profile.compat_profile()
    return ImageScriptRequest(
        workflow=workflow,
        prompt=prompt,
        count=count,
        quality=quality,
        size=size,
        output_dir=output_dir,
        base_url=provider_profile.base_url,
        model=provider_profile.model,
        compat_profile_id=compat_profile.id,
        output_profile_id=compat_profile.output_profile_id,
        source_image_paths=source_image_paths,
    )


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
    request = _build_script_request(
        workflow=workflow,
        prompt=prompt,
        count=count,
        quality=quality,
        size=size,
        output_dir=output_dir,
        provider_profile=provider_profile,
        source_image_paths=source_image_paths,
    )
    command = build_image_script_command(request)

    if status_callback:
        status_callback(f"正在调用图像接口，一次请求生成 {count} 张图片，模型 {provider_profile.model}。")

    try:
        result = run_image_script(
            command,
            status_callback=status_callback,
            cancel_event=cancel_event,
            env=_build_script_env(provider_profile),
            runner=runner,
        )
    except JobCanceled:
        return GenerationResult(images=[], errors=[], cancelled=True)

    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        raw_message = stderr or stdout or "脚本执行失败。"
        raise RuntimeError(normalize_script_error(raw_message))

    output_paths = resolve_output_paths(result, output_dir)
    images = _images_from_paths(job_id, output_paths, count)
    errors: list[str] = []

    for completed_count, image in enumerate(images, start=1):
        if image_callback:
            image_callback(image, completed_count, count)

    if len(images) < count:
        errors.append(f"上游接口只返回 {len(images)}/{count} 张图片。")
    if not images:
        raise RuntimeError(errors[0] if errors else "脚本执行完成，但没有发现生成图片。")

    return GenerationResult(images=images, errors=errors)
