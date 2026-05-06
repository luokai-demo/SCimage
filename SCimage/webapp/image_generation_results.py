from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

from image_records import build_generated_image_record


@dataclass(frozen=True)
class GenerationResult:
    images: List[dict]
    errors: List[str]
    cancelled: bool = False


def build_image_payload(job_id: str, file_path: Path, slot: int) -> dict:
    return build_generated_image_record(job_id, file_path, slot)


def images_from_paths(job_id: str, paths: list[Path], expected_count: int) -> list[dict]:
    return [
        build_image_payload(job_id=job_id, file_path=file_path, slot=slot)
        for slot, file_path in enumerate(paths[:expected_count], start=1)
    ]


def sort_images_by_slot(images_by_slot: dict[int, dict]) -> list[dict]:
    return [images_by_slot[slot] for slot in sorted(images_by_slot)]
