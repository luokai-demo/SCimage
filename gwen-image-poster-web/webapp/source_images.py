from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from config import MAX_SOURCE_IMAGE_BYTES, MAX_SOURCE_IMAGE_COUNT
from generated_assets import job_output_dir


ALLOWED_SOURCE_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}

CONTENT_TYPE_TO_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@dataclass(frozen=True)
class SourceImageFile:
    filename: str
    content_type: str
    data: bytes


def job_source_dir(job_id: str) -> Path:
    return job_output_dir(job_id) / "source-images"


def save_source_images(job_id: str, uploads: Iterable[SourceImageFile]) -> list[dict]:
    normalized_uploads = _normalize_uploads(uploads)
    source_dir = job_source_dir(job_id)

    if source_dir.exists():
        shutil.rmtree(source_dir)

    source_dir.mkdir(parents=True, exist_ok=True)
    saved_images: list[dict] = []
    try:
        for index, upload in enumerate(normalized_uploads, start=1):
            target_path = source_dir / f"source-{index}{_resolve_extension(upload.filename, upload.content_type)}"
            target_path.write_bytes(upload.data)
            saved_images.append(_build_source_image_payload(job_id, target_path, index))
    except Exception:
        shutil.rmtree(source_dir, ignore_errors=True)
        raise

    return saved_images


def normalize_source_images(job_id: str, raw_images: object) -> list[dict]:
    if not isinstance(raw_images, list):
        raw_images = []

    normalized: list[dict] = []
    seen_slots: set[int] = set()
    for fallback_slot, raw_image in enumerate(raw_images, start=1):
        image = _normalize_source_image_entry(job_id, raw_image, fallback_slot)
        if image is None:
            continue
        slot = int(image.get("slot", fallback_slot))
        if slot in seen_slots:
            slot = _next_available_slot(seen_slots, slot)
            image["slot"] = slot
        seen_slots.add(slot)
        normalized.append(image)

    normalized.sort(key=lambda item: item.get("slot", 0))
    return normalized


def build_source_images_from_job_dir(directory: Path) -> list[dict]:
    source_dir = directory / "source-images"
    if not source_dir.exists() or not source_dir.is_dir():
        return []

    images: list[dict] = []
    seen_slots: set[int] = set()
    for fallback_slot, file_path in enumerate(sorted(source_dir.iterdir()), start=1):
        if not file_path.is_file() or file_path.suffix.lower() not in ALLOWED_SOURCE_IMAGE_EXTENSIONS:
            continue
        slot = _parse_slot(file_path.stem, fallback_slot)
        if slot in seen_slots:
            slot = _next_available_slot(seen_slots, slot)
        seen_slots.add(slot)
        images.append(_build_source_image_payload(directory.name, file_path, slot))

    images.sort(key=lambda item: item.get("slot", 0))
    return images


def resolve_source_image_paths(source_images: Iterable[dict]) -> list[Path]:
    resolved_paths: list[Path] = []
    for index, image in enumerate(sorted(source_images, key=lambda item: int(item.get("slot", 0))), start=1):
        raw_path = str(image.get("path", "")).strip()
        if not raw_path:
            raise RuntimeError(f"第 {index} 张参考图缺少文件路径。")
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            raise RuntimeError(f"第 {index} 张参考图文件不存在，请重新上传后再试。")
        resolved_paths.append(path)
    return resolved_paths


def _normalize_uploads(uploads: Iterable[SourceImageFile]) -> list[SourceImageFile]:
    normalized_uploads: list[SourceImageFile] = []
    for index, upload in enumerate(uploads, start=1):
        if len(normalized_uploads) >= MAX_SOURCE_IMAGE_COUNT:
            raise ValueError(f"参考图最多支持 {MAX_SOURCE_IMAGE_COUNT} 张。")

        filename = str(upload.filename or "").strip()
        content_type = str(upload.content_type or "").strip().lower()
        data = bytes(upload.data or b"")

        if not filename:
            raise ValueError(f"第 {index} 张参考图缺少文件名。")
        if not data:
            raise ValueError(f"第 {index} 张参考图为空文件。")
        if len(data) > MAX_SOURCE_IMAGE_BYTES:
            size_mb = MAX_SOURCE_IMAGE_BYTES // (1024 * 1024)
            raise ValueError(f"第 {index} 张参考图超过 {size_mb}MB 限制。")

        _resolve_extension(filename, content_type)
        normalized_uploads.append(
            SourceImageFile(
                filename=filename,
                content_type=content_type,
                data=data,
            )
        )

    return normalized_uploads


def _resolve_extension(filename: str, content_type: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in ALLOWED_SOURCE_IMAGE_EXTENSIONS:
        return suffix

    mapped_suffix = CONTENT_TYPE_TO_EXTENSION.get(content_type.lower())
    if mapped_suffix in ALLOWED_SOURCE_IMAGE_EXTENSIONS:
        return mapped_suffix

    allowed = "、".join(sorted(ALLOWED_SOURCE_IMAGE_EXTENSIONS))
    raise ValueError(f"仅支持这些参考图格式：{allowed}。")


def _build_source_image_payload(job_id: str, file_path: Path, slot: int) -> dict:
    return {
        "slot": slot,
        "name": file_path.name,
        "path": str(file_path),
        "url": f"/generated/{job_id}/source-images/{file_path.name}",
    }


def _normalize_source_image_entry(job_id: str, raw_image: object, fallback_slot: int) -> dict | None:
    if not isinstance(raw_image, dict):
        return None

    file_name = str(raw_image.get("name", "")).strip()
    raw_path = str(raw_image.get("path", "")).strip()
    candidate_paths: list[Path] = []

    if raw_path:
        candidate_paths.append(Path(raw_path))
    if file_name:
        candidate_paths.append(job_source_dir(job_id) / file_name)
    if not file_name and raw_path:
        file_name = Path(raw_path).name
        candidate_paths.append(job_source_dir(job_id) / file_name)

    existing_path = next((path for path in candidate_paths if path.exists() and path.is_file()), None)
    if existing_path is None or not file_name:
        return None

    return {
        "slot": _to_positive_int(raw_image.get("slot"), fallback_slot),
        "name": file_name,
        "path": str(existing_path),
        "url": f"/generated/{job_id}/source-images/{file_name}",
    }


def _parse_slot(stem: str, fallback_slot: int) -> int:
    parts = stem.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return max(1, int(parts[1]))
    return fallback_slot


def _next_available_slot(seen_slots: set[int], initial_slot: int) -> int:
    slot = max(1, initial_slot)
    while slot in seen_slots:
        slot += 1
    return slot


def _to_positive_int(value: object, fallback: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return fallback
    return normalized if normalized > 0 else fallback
