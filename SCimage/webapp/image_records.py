from __future__ import annotations

from pathlib import Path

from generated_assets import OUTPUT_IMAGE_EXTENSIONS
from image_previews import build_image_preview_fields


def is_output_image_file(file_path: Path) -> bool:
    return file_path.is_file() and file_path.suffix.lower() in OUTPUT_IMAGE_EXTENSIONS


def build_generated_image_record(job_id: str, file_path: Path, slot: int) -> dict:
    payload = {
        "slot": slot,
        "name": file_path.name,
        "path": str(file_path),
        "url": f"/generated/{job_id}/{file_path.name}",
    }
    payload.update(build_image_preview_fields(job_id, file_path, slot))
    return payload
