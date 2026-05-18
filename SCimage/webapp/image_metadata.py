from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - Pillow is bundled for the desktop app.
    Image = None
    ImageOps = None

    class UnidentifiedImageError(Exception):
        pass


def build_image_metadata_fields(source_path: Path) -> dict:
    if Image is None or ImageOps is None:
        return {}

    source_path = Path(source_path)
    if not source_path.exists() or not source_path.is_file():
        return {}

    try:
        with Image.open(source_path) as opened_image:
            image = ImageOps.exif_transpose(opened_image)
            width, height = image.size
    except (OSError, UnidentifiedImageError, ValueError):
        return {}

    return {
        "width": width,
        "height": height,
    }
