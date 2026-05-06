from __future__ import annotations

from typing import Optional

from job_models import JobRecord, to_int


TERMINAL_JOB_STATUSES = {"canceled", "completed", "partial", "failed"}


def set_job_status(job: JobRecord, *, status: str, message: str, updated_at: str) -> bool:
    if job.status in TERMINAL_JOB_STATUSES:
        return False
    job.status = status
    job.message = message
    job.updated_at = updated_at
    return True


def append_job_image(job: JobRecord, *, image: dict, message: Optional[str], updated_at: str) -> None:
    remaining = [item for item in job.images if item.get("slot") != image.get("slot")]
    remaining.append(image)
    job.images = sort_images_by_slot(remaining)
    if job.status == "canceled":
        job.message = _canceled_message(job)
    elif message:
        job.message = message
    job.updated_at = updated_at


def complete_job(job: JobRecord, *, images: list[dict], warnings: Optional[list[str]], updated_at: str) -> None:
    if job.status == "canceled":
        job.images = merge_images_by_slot(job.images, images)
        job.warnings = warnings or job.warnings
        job.message = _canceled_message(job) if job.images else "任务已中断，当前没有可保留的图片。"
        job.updated_at = updated_at
        return

    job.images = sort_images_by_slot(images)
    job.warnings = warnings or []
    if job.warnings:
        job.status = "partial"
        job.message = f"已生成 {len(job.images)}/{job.count} 张图片，失败 {len(job.warnings)} 张。"
    else:
        job.status = "completed"
        job.message = f"图片已生成完成，共 {len(job.images)} 张。"
    job.updated_at = updated_at


def cancel_job(job: JobRecord, *, images: list[dict], warnings: Optional[list[str]], updated_at: str) -> None:
    job.status = "canceled"
    job.images = merge_images_by_slot(job.images, images)
    job.warnings = warnings or job.warnings
    job.message = _canceled_message(job) if job.images else "任务已中断，当前没有可保留的图片。"
    job.updated_at = updated_at


def fail_job(job: JobRecord, *, error: str, updated_at: str) -> None:
    if job.status == "canceled":
        if error:
            job.warnings = [error]
        job.updated_at = updated_at
        return
    job.status = "failed"
    job.message = "生成失败。"
    job.error = error
    job.updated_at = updated_at


def retry_job(job: JobRecord, *, retry_time: str) -> None:
    job.status = "queued"
    job.message = "任务已重试，等待生成。"
    job.images = []
    job.warnings = []
    job.error = None
    job.run_started_at = retry_time
    job.updated_at = retry_time


def merge_images_by_slot(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged = {to_int(item.get("slot"), default=0): item for item in existing}
    for image in incoming:
        merged[to_int(image.get("slot"), default=0)] = image
    return sort_images_by_slot(list(merged.values()))


def sort_images_by_slot(images: list[dict]) -> list[dict]:
    return sorted(images, key=lambda item: to_int(item.get("slot"), default=0))


def _canceled_message(job: JobRecord) -> str:
    return f"任务已中断，已保留 {len(job.images)}/{job.count} 张图片。"
