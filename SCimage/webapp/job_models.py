from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
import json
from typing import Dict, List, Optional

from output_options import DEFAULT_OUTPUT_PROFILE_ID, DEFAULT_SIZE_OPTION
from provider_compat import DEFAULT_COMPAT_PROFILE_ID
from workflows import DEFAULT_WORKFLOW


def now_iso_seconds() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass
class JobRecord:
    id: str
    prompt: str
    count: int
    quality: str
    size: str = DEFAULT_SIZE_OPTION
    model: str = ""
    compat_profile_id: str = DEFAULT_COMPAT_PROFILE_ID
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID
    workflow: str = DEFAULT_WORKFLOW
    status: str = "queued"
    message: str = "任务已创建，等待生成。"
    created_at: str = field(default_factory=now_iso_seconds)
    run_started_at: str = field(default_factory=now_iso_seconds)
    updated_at: str = field(default_factory=now_iso_seconds)
    images: List[dict] = field(default_factory=list)
    source_images: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None


def job_from_payload(payload: str | dict) -> JobRecord:
    raw_payload = json.loads(payload) if isinstance(payload, str) else dict(payload)
    raw_images = raw_payload.get("images", [])
    if not isinstance(raw_images, list):
        raw_images = []
    raw_payload["images"] = [_without_low_res_image_fields(image) for image in raw_images if isinstance(image, dict)]
    return JobRecord(**raw_payload)


def job_to_dict(job: JobRecord) -> dict:
    payload = asdict(job)
    payload["images"] = [_without_low_res_image_fields(image) for image in payload.get("images", []) if isinstance(image, dict)]
    return payload


def _without_low_res_image_fields(image: dict) -> dict:
    normalized = dict(image)
    normalized.pop("preview", None)
    normalized.pop("preview_url", None)
    normalized.pop("placeholder", None)
    normalized.pop("placeholder_color", None)
    normalized.pop("placeholder_accent_color", None)
    return normalized


def to_int(value: object, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
