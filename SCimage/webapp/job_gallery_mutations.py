from __future__ import annotations

from dataclasses import dataclass
import sqlite3
from typing import Callable, Optional

from genealogy_layout_repository import (
    image_node_id,
    remove_genealogy_position_for_node,
    remove_genealogy_positions_for_job,
)
from job_models import JobRecord, job_to_dict, to_int
from job_status_transitions import sort_images_by_slot


REMOVABLE_IMAGE_JOB_STATUSES = {"completed", "partial", "failed", "canceled"}


@dataclass(frozen=True)
class ImageRemovalResult:
    job: Optional[JobRecord]
    removed_image: Optional[dict]
    deleted_job: bool

    def as_store_tuple(self) -> tuple[Optional[dict], Optional[dict], bool]:
        return job_to_dict(self.job) if self.job else None, self.removed_image, self.deleted_job


def remove_job_image(
    connection: sqlite3.Connection,
    *,
    job: Optional[JobRecord],
    job_id: str,
    slot: int,
    updated_at: str,
    upsert_job: Callable[[JobRecord], None],
) -> ImageRemovalResult:
    if job is None:
        return ImageRemovalResult(job=None, removed_image=None, deleted_job=False)

    remaining, removed_image = detach_image_by_slot(job.images, slot)
    if removed_image is None:
        return ImageRemovalResult(job=job, removed_image=None, deleted_job=False)

    if not remaining:
        delete_job_and_genealogy(connection, job_id=job_id, slot=slot)
        return ImageRemovalResult(job=None, removed_image=removed_image, deleted_job=True)

    remove_genealogy_position_for_node(connection, image_node_id(job_id, slot))
    job.images = sort_images_by_slot(remaining)
    job.message = f"已删除 1 张图片，当前保留 {len(job.images)} 张。"
    job.updated_at = updated_at
    upsert_job(job)
    return ImageRemovalResult(job=job, removed_image=removed_image, deleted_job=False)


def remove_selected_job_images(
    connection: sqlite3.Connection,
    *,
    selections: list[dict],
    get_job: Callable[[str], Optional[JobRecord]],
    updated_at: str,
    upsert_job: Callable[[JobRecord], None],
) -> dict:
    removed: list[dict] = []
    deleted_jobs: set[str] = set()
    missing: list[dict] = []
    for selection in selections:
        job_id = str(selection.get("job_id", "")).strip()
        slot = to_int(selection.get("slot"), default=0)
        job = get_job(job_id)
        if job is None or job.status not in REMOVABLE_IMAGE_JOB_STATUSES:
            missing.append({"job_id": job_id, "slot": slot})
            continue

        remaining, removed_image = detach_image_by_slot(job.images, slot)
        if removed_image is None:
            missing.append({"job_id": job_id, "slot": slot})
            continue

        removed.append({"job_id": job_id, "image": removed_image})
        if not remaining:
            delete_job_and_genealogy(connection, job_id=job_id, slot=slot)
            deleted_jobs.add(job_id)
            continue

        remove_genealogy_position_for_node(connection, image_node_id(job_id, slot))
        job.images = sort_images_by_slot(remaining)
        job.message = f"已批量删除图片，当前保留 {len(job.images)} 张。"
        job.updated_at = updated_at
        upsert_job(job)

    return {
        "removed": removed,
        "deleted_jobs": sorted(deleted_jobs),
        "missing": missing,
    }


def detach_image_by_slot(images: list[dict], slot: int) -> tuple[list[dict], Optional[dict]]:
    remaining: list[dict] = []
    removed_image: Optional[dict] = None
    for image in images:
        if removed_image is None and to_int(image.get("slot"), default=0) == slot:
            removed_image = image
        else:
            remaining.append(image)
    return remaining, removed_image


def delete_job_and_genealogy(connection: sqlite3.Connection, *, job_id: str, slot: int) -> None:
    connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    remove_genealogy_position_for_node(connection, image_node_id(job_id, slot))
    remove_genealogy_positions_for_job(connection, job_id)
