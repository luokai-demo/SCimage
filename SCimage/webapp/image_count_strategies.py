from __future__ import annotations

from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable

from image_generation_requests import build_generation_request
from image_generation_results import (
    GenerationResult,
    build_image_payload,
    images_from_paths,
    sort_images_by_slot,
)
from image_generation_runtime import execute_image_generation, normalize_generation_error
from provider_profiles import ProviderProfile

if TYPE_CHECKING:
    from job_control import JobRunner


def generate_images_with_upstream_count(
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
    request = build_generation_request(
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

    images = images_from_paths(job_id, list(response.saved_paths), count)
    errors: list[str] = []

    for completed_count, image in enumerate(images, start=1):
        if image_callback:
            image_callback(image, completed_count, count)

    if len(images) < count:
        errors.append(f"上游接口只返回 {len(images)}/{count} 张图片。")
    if not images:
        raise RuntimeError(errors[0] if errors else "脚本执行完成，但没有发现生成图片。")

    return GenerationResult(images=images, errors=errors)


def generate_images_with_parallel_single_requests(
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
            build_generation_request(
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

    executor = ThreadPoolExecutor(max_workers=count, thread_name_prefix="scimage-count-fanout")
    cancelled = False
    try:
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
        pending_futures = set(future_to_slot)
        while pending_futures:
            if cancel_event and cancel_event.is_set():
                cancelled = True
                for pending_future in pending_futures:
                    pending_future.cancel()
                return GenerationResult(
                    images=sort_images_by_slot(images_by_slot),
                    errors=errors,
                    cancelled=True,
                )

            done_futures, pending_futures = wait(pending_futures, timeout=0.2, return_when=FIRST_COMPLETED)
            if not done_futures:
                continue

            for future in done_futures:
                slot = future_to_slot[future]
                if cancel_event and cancel_event.is_set():
                    cancelled = True
                    for pending_future in pending_futures:
                        pending_future.cancel()
                    return GenerationResult(
                        images=sort_images_by_slot(images_by_slot),
                        errors=errors,
                        cancelled=True,
                    )

                try:
                    response = future.result()
                except Exception as exc:
                    if cancel_event and cancel_event.is_set():
                        cancelled = True
                        return GenerationResult(
                            images=sort_images_by_slot(images_by_slot),
                            errors=errors,
                            cancelled=True,
                        )
                    errors.append(f"第 {slot} 张图片生成失败：{normalize_generation_error(str(exc))}")
                    continue

                saved_paths = list(response.saved_paths)
                if not saved_paths:
                    errors.append(f"第 {slot} 张图片未返回结果。")
                    continue

                image = build_image_payload(job_id=job_id, file_path=saved_paths[0], slot=slot)
                images_by_slot[slot] = image
                completed_count += 1
                if image_callback:
                    image_callback(image, completed_count, count)
    finally:
        executor.shutdown(wait=not cancelled, cancel_futures=cancelled)

    if cancel_event and cancel_event.is_set():
        return GenerationResult(
            images=sort_images_by_slot(images_by_slot),
            errors=errors,
            cancelled=True,
        )

    images = sort_images_by_slot(images_by_slot)
    if not images:
        raise RuntimeError(errors[0] if errors else "脚本执行完成，但没有发现生成图片。")
    return GenerationResult(images=images, errors=errors)
