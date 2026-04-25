from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
import json
from pathlib import Path
from typing import TYPE_CHECKING

from config import GENERATED_DIR, JOB_RECORDS_PATH, LOCAL_STATE_DIR
from output_options import DEFAULT_QUALITY, DEFAULT_SIZE_OPTION, normalize_quality, normalize_size_value
from source_images import build_source_images_from_job_dir, normalize_source_images
from workflows import DEFAULT_WORKFLOW, IMAGE_TO_IMAGE_WORKFLOW, normalize_workflow

if TYPE_CHECKING:
    from job_store import JobRecord


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def load_job_records(path: Path = JOB_RECORDS_PATH) -> dict[str, dict]:
    payload = _read_payload(path)
    raw_jobs = payload.get("jobs", {})
    if not isinstance(raw_jobs, dict):
        return {}

    normalized: dict[str, dict] = {}
    for job_id, raw_job in raw_jobs.items():
        if not isinstance(raw_job, dict):
            continue
        normalized_job = normalize_job_record(str(job_id), raw_job)
        if normalized_job is None:
            continue
        normalized[str(job_id)] = normalized_job

    recovered = recover_jobs_from_generated_dir(normalized)
    normalized.update(recovered)
    return normalized


def save_job_records(jobs: dict[str, "JobRecord"], path: Path = JOB_RECORDS_PATH) -> None:
    LOCAL_STATE_DIR.mkdir(parents=True, exist_ok=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "jobs": {job_id: asdict(job) for job_id, job in jobs.items()},
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_job_record(job_id: str, raw_job: dict) -> dict | None:
    job = dict(raw_job)
    if not job_id:
        return None

    images = normalize_images(job_id, job.get("images", []))
    source_images = normalize_source_images(job_id, job.get("source_images", []))
    created_at = _normalize_timestamp(job.get("created_at"))
    run_started_at = _normalize_timestamp(job.get("run_started_at"), fallback=created_at)
    updated_at = _normalize_timestamp(job.get("updated_at"), fallback=created_at)
    warnings = job.get("warnings", [])
    if not isinstance(warnings, list):
        warnings = []

    raw_error = str(job.get("error", "")).strip()
    normalized_error = raw_error if raw_error and raw_error.lower() not in {"none", "null"} else None

    normalized_quality = normalize_quality(job.get("quality"))
    normalized = {
        "id": job_id,
        "prompt": str(job.get("prompt", "")).strip(),
        "count": _to_int(job.get("count"), default=len(images) or 1),
        "quality": normalized_quality,
        "size": normalize_size_value(job.get("size"), quality=normalized_quality),
        "workflow": normalize_workflow(
            job.get("workflow"),
            fallback=IMAGE_TO_IMAGE_WORKFLOW if source_images else DEFAULT_WORKFLOW,
        ),
        "status": str(job.get("status", "completed") or "completed"),
        "message": str(job.get("message", "") or "").strip(),
        "created_at": created_at,
        "run_started_at": run_started_at,
        "updated_at": updated_at,
        "images": images,
        "source_images": source_images,
        "warnings": [str(item) for item in warnings if item is not None],
        "error": normalized_error,
    }

    if not normalized["prompt"]:
        normalized["prompt"] = f"历史图片 {job_id}"
    if not normalized["message"]:
        normalized["message"] = "已从本地目录恢复历史图片。"
    if normalized["count"] < len(images):
        normalized["count"] = len(images)
    return normalized


def normalize_images(job_id: str, raw_images: list) -> list[dict]:
    if not isinstance(raw_images, list):
        raw_images = []

    normalized: list[dict] = []
    seen_slots: set[int] = set()
    for fallback_slot, raw_image in enumerate(raw_images, start=1):
        image = _normalize_image_entry(job_id, raw_image, fallback_slot)
        if image is None:
            continue
        slot = image["slot"]
        if slot in seen_slots:
            image["slot"] = _next_available_slot(seen_slots, slot)
        seen_slots.add(image["slot"])
        normalized.append(image)

    normalized.sort(key=lambda item: item.get("slot", 0))
    return normalized


def recover_jobs_from_generated_dir(existing_jobs: dict[str, dict]) -> dict[str, dict]:
    recovered: dict[str, dict] = {}
    if not GENERATED_DIR.exists():
        return recovered

    for directory in sorted(child for child in GENERATED_DIR.iterdir() if child.is_dir()):
        images = build_images_from_generated_dir(directory)
        if not images:
            continue

        job_id = directory.name
        source_images = build_source_images_from_job_dir(directory)
        existing = existing_jobs.get(job_id)
        if existing:
            existing_images = normalize_images(job_id, existing.get("images", []))
            image_names = {image["name"] for image in existing_images}
            for image in images:
                if image["name"] not in image_names:
                    existing_images.append(image)
            existing_images.sort(key=lambda item: item.get("slot", 0))
            existing["images"] = existing_images
            existing_source_images = normalize_source_images(job_id, existing.get("source_images", []))
            existing_source_names = {image["name"] for image in existing_source_images}
            for source_image in source_images:
                if source_image["name"] not in existing_source_names:
                    existing_source_images.append(source_image)
            existing_source_images.sort(key=lambda item: item.get("slot", 0))
            existing["source_images"] = existing_source_images
            if existing_source_images and normalize_workflow(existing.get("workflow")) == DEFAULT_WORKFLOW:
                existing["workflow"] = IMAGE_TO_IMAGE_WORKFLOW
            if existing.get("count", 0) < len(existing_images):
                existing["count"] = len(existing_images)
            if not existing.get("message"):
                existing["message"] = "已从本地目录恢复历史图片。"
            continue

        created_at, updated_at = _infer_directory_timestamps(directory)
        recovered[job_id] = {
            "id": job_id,
            "prompt": f"历史图片 {job_id}",
            "count": len(images),
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


def build_images_from_generated_dir(directory: Path) -> list[dict]:
    images: list[dict] = []
    seen_slots: set[int] = set()
    for fallback_slot, file_path in enumerate(sorted(directory.iterdir()), start=1):
        if not file_path.is_file() or file_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        slot = _parse_slot(file_path.stem, fallback_slot)
        if slot in seen_slots:
            slot = _next_available_slot(seen_slots, slot)
        seen_slots.add(slot)
        images.append(
            {
                "slot": slot,
                "name": file_path.name,
                "path": str(file_path),
                "url": f"/generated/{directory.name}/{file_path.name}",
            }
        )
    images.sort(key=lambda item: item.get("slot", 0))
    return images


def _normalize_image_entry(job_id: str, raw_image: object, fallback_slot: int) -> dict | None:
    if not isinstance(raw_image, dict):
        return None

    file_name = str(raw_image.get("name", "")).strip()
    raw_path = str(raw_image.get("path", "")).strip()
    candidate_paths: list[Path] = []
    if raw_path:
        candidate_paths.append(Path(raw_path))
    if file_name:
        candidate_paths.append(GENERATED_DIR / job_id / file_name)
    if not file_name and raw_path:
        file_name = Path(raw_path).name
        candidate_paths.append(GENERATED_DIR / job_id / file_name)

    existing_path = next((path for path in candidate_paths if path.exists() and path.is_file()), None)
    if existing_path is None or not file_name:
        return None

    return {
        "slot": _to_int(raw_image.get("slot"), fallback_slot),
        "name": file_name,
        "path": str(existing_path),
        "url": f"/generated/{job_id}/{file_name}",
    }


def _infer_directory_timestamps(directory: Path) -> tuple[str, str]:
    file_times = [file_path.stat().st_mtime for file_path in directory.iterdir() if file_path.is_file()]
    if not file_times:
        timestamp = datetime.now().isoformat(timespec="seconds")
        return timestamp, timestamp

    created_at = datetime.fromtimestamp(min(file_times)).isoformat(timespec="seconds")
    updated_at = datetime.fromtimestamp(max(file_times)).isoformat(timespec="seconds")
    return created_at, updated_at


def _parse_slot(stem: str, fallback_slot: int) -> int:
    parts = stem.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return max(1, int(parts[1]))
    return fallback_slot


def _to_int(value: object, default: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return default
    return normalized if normalized > 0 else default


def _normalize_timestamp(value: object, fallback: str | None = None) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback or datetime.now().isoformat(timespec="seconds")


def _next_available_slot(seen_slots: set[int], initial_slot: int) -> int:
    slot = max(1, initial_slot)
    while slot in seen_slots:
        slot += 1
    return slot


def _read_payload(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
