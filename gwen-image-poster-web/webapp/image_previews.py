from __future__ import annotations

from pathlib import Path

from generated_assets import PREVIEW_ASSET_DIR, job_preview_dir

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - Pillow is bundled for the desktop app.
    Image = None
    ImageOps = None

    class UnidentifiedImageError(Exception):
        pass


PREVIEW_MAX_EDGE_PX = 96
PREVIEW_QUALITY = 34
PREVIEW_METHOD = 4
PREVIEW_EXTENSION = ".webp"
PLACEHOLDER_LIFT = 0.28
PLACEHOLDER_ACCENT_LIFT = 0.46


def build_image_preview_fields(job_id: str, source_path: Path, slot: int) -> dict:
    if Image is None or ImageOps is None:
        return {}

    source_path = Path(source_path)
    if _is_preview_asset(job_id, source_path) or not source_path.exists() or not source_path.is_file():
        return {}

    try:
        with Image.open(source_path) as opened_image:
            image = ImageOps.exif_transpose(opened_image)
            source_width, source_height = image.size
            preview_image = _build_preview_image(image)
            preview_path = _preview_path(job_id, slot)
            _write_preview_if_needed(source_path, preview_path, preview_image)
    except (OSError, UnidentifiedImageError, ValueError):
        return {}

    preview_width, preview_height = preview_image.size
    return {
        "width": source_width,
        "height": source_height,
        "placeholder": _build_placeholder(preview_image),
        "preview": {
            "name": preview_path.name,
            "path": str(preview_path),
            "url": f"/generated/{job_id}/{PREVIEW_ASSET_DIR}/{preview_path.name}",
            "width": preview_width,
            "height": preview_height,
        },
    }


def _build_preview_image(image: "Image.Image") -> "Image.Image":
    preview_image = image.copy()
    preview_image.thumbnail((PREVIEW_MAX_EDGE_PX, PREVIEW_MAX_EDGE_PX), Image.Resampling.LANCZOS)
    if preview_image.mode in {"RGB", "RGBA"}:
        return preview_image
    target_mode = "RGBA" if "A" in preview_image.getbands() else "RGB"
    return preview_image.convert(target_mode)


def _build_placeholder(preview_image: "Image.Image") -> dict[str, str]:
    sample = preview_image.convert("RGBA").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    red, green, blue, alpha = sample
    if alpha < 255:
        opacity = alpha / 255
        red = round((red * opacity) + (255 * (1 - opacity)))
        green = round((green * opacity) + (255 * (1 - opacity)))
        blue = round((blue * opacity) + (255 * (1 - opacity)))
    return {
        "color": _lift_hex_color(red, green, blue, PLACEHOLDER_LIFT),
        "accent_color": _lift_hex_color(red, green, blue, PLACEHOLDER_ACCENT_LIFT),
    }


def _lift_hex_color(red: int, green: int, blue: int, amount: float) -> str:
    channels = (
        _lift_channel(red, amount),
        _lift_channel(green, amount),
        _lift_channel(blue, amount),
    )
    return "#" + "".join(f"{channel:02x}" for channel in channels)


def _lift_channel(value: int, amount: float) -> int:
    return round(max(0, min(255, value + ((255 - value) * amount))))


def _write_preview_if_needed(source_path: Path, preview_path: Path, preview_image: "Image.Image") -> None:
    if preview_path.exists() and preview_path.stat().st_mtime >= source_path.stat().st_mtime:
        return
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview_image.save(
        preview_path,
        "WEBP",
        quality=PREVIEW_QUALITY,
        method=PREVIEW_METHOD,
    )


def _preview_path(job_id: str, slot: int) -> Path:
    normalized_slot = max(1, int(slot or 1))
    return job_preview_dir(job_id) / f"preview-{normalized_slot}{PREVIEW_EXTENSION}"


def _is_preview_asset(job_id: str, source_path: Path) -> bool:
    try:
        source_path.resolve().relative_to(job_preview_dir(job_id).resolve())
    except ValueError:
        return False
    return True
