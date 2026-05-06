from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
import json
from pathlib import Path
from typing import TYPE_CHECKING

from config import JOB_RECORDS_PATH, LOCAL_STATE_DIR
from job_record_images import build_images_from_generated_dir, normalize_images, to_positive_int
from job_record_recovery import recover_jobs_from_generated_dir
from output_options import (
    infer_output_profile_id,
    normalize_output_profile_id,
    normalize_quality,
    normalize_size_value,
)
from provider_compat import (
    infer_compat_profile_id,
    normalize_compat_profile_id,
)
from source_images import normalize_source_images
from workflows import DEFAULT_WORKFLOW, IMAGE_TO_IMAGE_WORKFLOW, normalize_workflow

if TYPE_CHECKING:
    from job_models import JobRecord


def load_job_records(path: Path = JOB_RECORDS_PATH, *, recover_generated: bool = False) -> dict[str, dict]:
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

    if recover_generated:
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

    output_profile_id = normalize_output_profile_id(
        job.get("output_profile_id"),
        fallback=infer_output_profile_id(job.get("quality"), job.get("size")),
    )
    normalized_quality = normalize_quality(job.get("quality"), output_profile_id=output_profile_id)
    normalized_workflow = normalize_workflow(
        job.get("workflow"),
        fallback=IMAGE_TO_IMAGE_WORKFLOW if source_images else DEFAULT_WORKFLOW,
    )
    compat_profile_id = normalize_compat_profile_id(
        job.get("compat_profile_id"),
        fallback=infer_compat_profile_id(
            workflow=normalized_workflow,
            output_profile_id=output_profile_id,
        ),
    )
    normalized = {
        "id": job_id,
        "prompt": str(job.get("prompt", "")).strip(),
        "count": to_positive_int(job.get("count"), len(images) or 1),
        "compat_profile_id": compat_profile_id,
        "output_profile_id": output_profile_id,
        "quality": normalized_quality,
        "size": normalize_size_value(
            job.get("size"),
            quality=normalized_quality,
            output_profile_id=output_profile_id,
        ),
        "workflow": normalized_workflow,
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


def _normalize_timestamp(value: object, fallback: str | None = None) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback or datetime.now().isoformat(timespec="seconds")


def _read_payload(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
