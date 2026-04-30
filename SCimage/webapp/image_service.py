from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
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
    if provider_profile.supports_count_parameter or count == 1:
        return _generate_images_with_upstream_count(
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

    return _generate_images_with_parallel_single_requests(
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


def _build_generation_request(
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


def _generate_images_with_upstream_count(
    *,
    job_id: str,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    source_image_paths: list[Path],
    output_paths: tuple[Path, ...],
    provider_profile: ProviderProfile,
    status_callback: Callable[[str], None] | None = None,
    image_callback: Callable[[dict, int, int], None] | None = None,
    cancel_event: Event | None = None,
    runner: "JobRunner" | None = None,
) -> GenerationResult:
    request = _build_generation_request(
        workflow=workflow,
        prompt=prompt,
        count=count,
        quality=quality,
        size=size,
        output_paths=output_paths,
        source_image_paths=source_image_paths,
        provider_profile=provider_profile,
    )

    if status_callback:
        status_callback(f"正在调用图像接口，直接传递生成张数 {count}，模型 {provider_profile.model}。")

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


def _generate_images_with_parallel_single_requests(
    *,
    job_id: str,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    source_image_paths: list[Path],
    output_paths: tuple[Path, ...],
    provider_profile: ProviderProfile,
    status_callback: Callable[[str], None] | None = None,
    image_callback: Callable[[dict, int, int], None] | None = None,
    cancel_event: Event | None = None,
    runner: "JobRunner" | None = None,
) -> GenerationResult:
    if status_callback:
        status_callback(
            f"当前上游未开启“支持传递生成张数”，已改为并发发起 {count} 个单张请求，模型 {provider_profile.model}。"
        )

    images_by_slot: dict[int, dict] = {}
    errors: list[str] = []
    completed_count = 0
    requests = [
        (
            slot,
            _build_generation_request(
                workflow=workflow,
                prompt=prompt,
                count=1,
                quality=quality,
                size=size,
                output_paths=(output_paths[slot - 1],),
                source_image_paths=source_image_paths,
                provider_profile=provider_profile,
            ),
        )
        for slot in range(1, count + 1)
    ]

    with ThreadPoolExecutor(max_workers=count, thread_name_prefix="scimage-count-fanout") as executor:
        future_to_slot = {
            executor.submit(
                execute_image_generation,
                request,
                status_callback=None,
                cancel_event=cancel_event,
                runner=runner,
            ): slot
            for slot, request in requests
        }
        for future in as_completed(future_to_slot):
            slot = future_to_slot[future]
            if cancel_event and cancel_event.is_set():
                for pending_future in future_to_slot:
                    pending_future.cancel()
                break

            try:
                response = future.result()
            except Exception as exc:
                if cancel_event and cancel_event.is_set():
                    return GenerationResult(
                        images=_sort_images_by_slot(images_by_slot),
                        errors=errors,
                        cancelled=True,
                    )
                errors.append(f"第 {slot} 张图片生成失败：{normalize_generation_error(str(exc))}")
                continue

            saved_paths = list(response.saved_paths)
            if not saved_paths:
                errors.append(f"第 {slot} 张图片未返回结果。")
                continue

            image = _build_image_payload(job_id=job_id, file_path=saved_paths[0], slot=slot)
            images_by_slot[slot] = image
            completed_count += 1
            if image_callback:
                image_callback(image, completed_count, count)

    if cancel_event and cancel_event.is_set():
        return GenerationResult(
            images=_sort_images_by_slot(images_by_slot),
            errors=errors,
            cancelled=True,
        )

    images = _sort_images_by_slot(images_by_slot)
    if not images:
        raise RuntimeError(errors[0] if errors else "脚本执行完成，但没有发现生成图片。")
    return GenerationResult(images=images, errors=errors)


def _sort_images_by_slot(images_by_slot: dict[int, dict]) -> list[dict]:
    return [images_by_slot[slot] for slot in sorted(images_by_slot)]
