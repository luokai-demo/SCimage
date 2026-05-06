from __future__ import annotations

from datetime import datetime
from pathlib import Path

from config import GENERATED_DIR
from job_record_images import build_images_from_generated_dir
from output_options import DEFAULT_OUTPUT_PROFILE_ID, DEFAULT_QUALITY, DEFAULT_SIZE_OPTION
from provider_compat import DEFAULT_COMPAT_PROFILE_ID
from source_images import build_source_images_from_job_dir
from workflows import DEFAULT_WORKFLOW, IMAGE_TO_IMAGE_WORKFLOW


def recover_jobs_from_generated_dir(existing_jobs: dict[str, dict]) -> dict[str, dict]:
    recovered: dict[str, dict] = {}
    if not GENERATED_DIR.exists():
        return recovered

    for directory in sorted(child for child in GENERATED_DIR.iterdir() if child.is_dir()):
        job_id = directory.name
        if job_id in existing_jobs:
            continue

        images = build_images_from_generated_dir(directory)
        if not images:
            continue

        source_images = build_source_images_from_job_dir(directory)
        created_at, updated_at = infer_directory_timestamps(directory)
        recovered[job_id] = {
            "id": job_id,
            "prompt": f"历史图片 {job_id}",
            "count": len(images),
            "compat_profile_id": DEFAULT_COMPAT_PROFILE_ID,
            "output_profile_id": DEFAULT_OUTPUT_PROFILE_ID,
            "quality": DEFAULT_QUALITY,
            "size": DEFAULT_SIZE_OPTION,
            "workflow": IMAGE_TO_IMAGE_WORKFLOW if source_images else DEFAULT_WORKFLOW,
            "status": "completed",
            "message": "已从本地目录恢复历史图片。",
            "created_at": created_at,
            "run_started_at": created_at,
            "updated_at": updated_at,
            "images": images,
            "source_images": source_images,
            "warnings": [],
            "error": None,
        }
    return recovered


def infer_directory_timestamps(directory: Path) -> tuple[str, str]:
    file_times = [file_path.stat().st_mtime for file_path in directory.iterdir() if file_path.is_file()]
    if not file_times:
        timestamp = datetime.now().isoformat(timespec="seconds")
        return timestamp, timestamp

    created_at = datetime.fromtimestamp(min(file_times)).isoformat(timespec="seconds")
    updated_at = datetime.fromtimestamp(max(file_times)).isoformat(timespec="seconds")
    return created_at, updated_at
