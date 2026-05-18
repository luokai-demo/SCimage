from __future__ import annotations

from pathlib import Path

from config import GENERATED_DIR
from image_records import build_generated_image_record, is_output_image_file


def normalize_images(job_id: str, raw_images: list) -> list[dict]:
    if not isinstance(raw_images, list):
        raw_images = []

    normalized: list[dict] = []
    seen_slots: set[int] = set()
    for fallback_slot, raw_image in enumerate(raw_images, start=1):
        image = normalize_image_entry(job_id, raw_image, fallback_slot)
        if image is None:
            continue
        slot = image["slot"]
        if slot in seen_slots:
            image["slot"] = next_available_slot(seen_slots, slot)
        seen_slots.add(image["slot"])
        normalized.append(image)

    normalized.sort(key=lambda item: item.get("slot", 0))
    return normalized


def build_images_from_generated_dir(directory: Path) -> list[dict]:
    images: list[dict] = []
    seen_slots: set[int] = set()
    for fallback_slot, file_path in enumerate(sorted(directory.iterdir()), start=1):
        if not is_output_image_file(file_path):
            continue
        slot = parse_slot(file_path.stem, fallback_slot)
        if slot in seen_slots:
            slot = next_available_slot(seen_slots, slot)
        seen_slots.add(slot)
        images.append(build_generated_image_record(directory.name, file_path, slot))
    images.sort(key=lambda item: item.get("slot", 0))
    return images


def normalize_image_entry(job_id: str, raw_image: object, fallback_slot: int) -> dict | None:
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

    cached_record = build_cached_image_record(
        job_id=job_id,
        file_path=existing_path,
        slot=to_positive_int(raw_image.get("slot"), fallback_slot),
        raw_image=raw_image,
    )
    if cached_record is not None:
        return cached_record

    return build_generated_image_record(
        job_id,
        existing_path,
        to_positive_int(raw_image.get("slot"), fallback_slot),
    )


def build_cached_image_record(*, job_id: str, file_path: Path, slot: int, raw_image: dict) -> dict | None:
    width = to_positive_int(raw_image.get("width"), 0)
    height = to_positive_int(raw_image.get("height"), 0)
    if width <= 0 or height <= 0:
        return None

    return {
        "slot": slot,
        "name": file_path.name,
        "path": str(file_path),
        "url": f"/generated/{job_id}/{file_path.name}",
        "width": width,
        "height": height,
    }


def parse_slot(stem: str, fallback_slot: int) -> int:
    parts = stem.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return max(1, int(parts[1]))
    return fallback_slot


def next_available_slot(seen_slots: set[int], initial_slot: int) -> int:
    slot = max(1, initial_slot)
    while slot in seen_slots:
        slot += 1
    return slot


def to_positive_int(value: object, default: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return default
    return normalized if normalized > 0 else default
