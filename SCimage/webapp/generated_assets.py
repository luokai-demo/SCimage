from __future__ import annotations

import shutil
from pathlib import Path

from config import GENERATED_DIR

OUTPUT_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
OBSOLETE_PREVIEW_ASSET_DIR = "previews"


def job_output_dir(job_id: str) -> Path:
    return GENERATED_DIR / job_id


def recreate_job_output_dir(job_id: str) -> Path:
    output_dir = job_output_dir(job_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    for child in list(output_dir.iterdir()):
        if child.is_file() and child.suffix.lower() in OUTPUT_IMAGE_EXTENSIONS:
            child.unlink()
    remove_obsolete_preview_dir(job_id)
    return output_dir


def remove_job_output_dir(job_id: str) -> bool:
    output_dir = job_output_dir(job_id)
    if not output_dir.exists():
        return False
    shutil.rmtree(output_dir)
    return True


def remove_job_image_file(job_id: str, image_name: str) -> bool:
    if not image_name:
        return False
    output_dir = job_output_dir(job_id).resolve()
    image_path = (output_dir / image_name).resolve()
    try:
        image_path.relative_to(output_dir)
    except ValueError:
        return False
    if not image_path.exists() or not image_path.is_file():
        return False
    image_path.unlink()
    return True


def cleanup_empty_job_output_dir(job_id: str) -> bool:
    output_dir = job_output_dir(job_id)
    if not output_dir.exists() or not output_dir.is_dir():
        return False
    remove_obsolete_preview_dir(job_id)
    for child in list(output_dir.iterdir()):
        if child.is_dir():
            _cleanup_empty_tree(child)
    try:
        next(output_dir.iterdir())
    except StopIteration:
        output_dir.rmdir()
        return True
    return False


def cleanup_empty_generated_dirs() -> list[Path]:
    if not GENERATED_DIR.exists():
        return []

    removed_dirs: list[Path] = []
    for child in sorted(GENERATED_DIR.iterdir()):
        removed_dirs.extend(_cleanup_empty_tree(child))
    return removed_dirs


def remove_obsolete_preview_dir(job_id: str) -> bool:
    preview_dir = job_output_dir(job_id) / OBSOLETE_PREVIEW_ASSET_DIR
    if not preview_dir.exists():
        return False
    if preview_dir.is_dir():
        shutil.rmtree(preview_dir)
        return True
    preview_dir.unlink()
    return True


def remove_obsolete_preview_dirs() -> list[Path]:
    if not GENERATED_DIR.exists():
        return []
    removed: list[Path] = []
    for preview_dir in GENERATED_DIR.glob(f"*/{OBSOLETE_PREVIEW_ASSET_DIR}"):
        if preview_dir.is_dir():
            shutil.rmtree(preview_dir)
            removed.append(preview_dir)
        elif preview_dir.exists():
            preview_dir.unlink()
            removed.append(preview_dir)
    return removed


def _cleanup_empty_tree(path: Path) -> list[Path]:
    if not path.exists() or not path.is_dir():
        return []

    removed_dirs: list[Path] = []
    for child in list(path.iterdir()):
        if child.is_dir():
            removed_dirs.extend(_cleanup_empty_tree(child))

    try:
        next(path.iterdir())
    except StopIteration:
        path.rmdir()
        removed_dirs.append(path)

    return removed_dirs
