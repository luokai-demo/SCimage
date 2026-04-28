from __future__ import annotations

from collections import deque
from pathlib import Path

from runtime_paths import RUNTIME_PATHS, RuntimePaths


LOGO_FILENAME = "logo.png"
WINDOWS_ICON_FILENAME = "SCimage.ico"
TARGET_ICON_CANVAS_SIZE = 1024
WINDOWS_ICON_SIZES = (
    (256, 256),
    (128, 128),
    (64, 64),
    (48, 48),
    (32, 32),
    (16, 16),
)


def logo_source_path(paths: RuntimePaths | None = None) -> Path:
    resolved_paths = paths or RUNTIME_PATHS
    return resolved_paths.static_dir / LOGO_FILENAME


def load_logo_canvas(
    ImageModule,
    *,
    paths: RuntimePaths | None = None,
    source_path: str | Path | None = None,
    target_size: int = TARGET_ICON_CANVAS_SIZE,
):
    resolved_source_path = Path(source_path).resolve() if source_path else logo_source_path(paths)
    if not resolved_source_path.exists():
        raise FileNotFoundError(f"缺少 logo 文件：{resolved_source_path}")

    with ImageModule.open(resolved_source_path) as source_image:
        canvas = source_image.convert("RGBA")

    canvas = clean_corner_background(canvas)
    return normalize_square_canvas(ImageModule, canvas, target_size=target_size)


def normalize_square_canvas(ImageModule, canvas, *, target_size: int = TARGET_ICON_CANVAS_SIZE):
    side = max(canvas.width, canvas.height)
    if canvas.width != canvas.height:
        square_canvas = ImageModule.new("RGBA", (side, side), (0, 0, 0, 0))
        offset = ((side - canvas.width) // 2, (side - canvas.height) // 2)
        square_canvas.paste(canvas, offset, canvas)
        canvas = square_canvas

    if side != target_size:
        canvas = resize_rgba_canvas(ImageModule, canvas, target_size)
    return canvas


def clean_corner_background(canvas, *, threshold: int = 200):
    width, height = canvas.size
    pixels = canvas.load()
    visited: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def is_corner_background(point: tuple[int, int]) -> bool:
        red, green, blue, alpha = pixels[point]
        return alpha > 0 and red >= threshold and green >= threshold and blue >= threshold

    corners = (
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
    )
    for point in corners:
        if is_corner_background(point):
            visited.add(point)
            queue.append(point)

    while queue:
        x, y = queue.popleft()
        if not is_corner_background((x, y)):
            continue

        pixels[x, y] = (0, 0, 0, 0)
        for next_x, next_y in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
            (x - 1, y - 1),
            (x + 1, y - 1),
            (x - 1, y + 1),
            (x + 1, y + 1),
        ):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            next_point = (next_x, next_y)
            if next_point in visited:
                continue
            visited.add(next_point)
            queue.append(next_point)

    return canvas


def resize_rgba_canvas(ImageModule, canvas, size: int | tuple[int, int]):
    from PIL import ImageChops

    target_size = (size, size) if isinstance(size, int) else size
    if canvas.size == target_size:
        return canvas.copy()

    red, green, blue, alpha = canvas.split()
    red = ImageChops.multiply(red, alpha)
    green = ImageChops.multiply(green, alpha)
    blue = ImageChops.multiply(blue, alpha)
    filter_mode = resample_filter(ImageModule)

    red = red.resize(target_size, filter_mode)
    green = green.resize(target_size, filter_mode)
    blue = blue.resize(target_size, filter_mode)
    alpha = alpha.resize(target_size, filter_mode)

    return unpremultiply_alpha(ImageModule.merge("RGBA", (red, green, blue, alpha)))


def unpremultiply_alpha(canvas):
    pixels = canvas.load()
    width, height = canvas.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            pixels[x, y] = (
                min(255, (red * 255 + alpha // 2) // alpha),
                min(255, (green * 255 + alpha // 2) // alpha),
                min(255, (blue * 255 + alpha // 2) // alpha),
                alpha,
            )
    return canvas


def save_windows_icon(ImageModule, canvas, target_path: str | Path) -> Path:
    resolved_target_path = Path(target_path)
    icon_frames = [resize_rgba_canvas(ImageModule, canvas, size) for size in WINDOWS_ICON_SIZES]
    icon_frames[0].save(
        resolved_target_path,
        sizes=list(WINDOWS_ICON_SIZES),
        append_images=icon_frames[1:],
    )
    return resolved_target_path


def resample_filter(ImageModule):
    resampling = getattr(ImageModule, "Resampling", None)
    if resampling is not None:
        return resampling.LANCZOS
    return ImageModule.LANCZOS


def resolve_desktop_window_icon_path(paths: RuntimePaths | None = None) -> Path | None:
    resolved_paths = paths or RUNTIME_PATHS
    logo_path = logo_source_path(resolved_paths)
    if not logo_path.exists():
        return None

    if resolved_paths.platform_system.lower() == "windows":
        return ensure_windows_window_icon(resolved_paths)
    return logo_path


def ensure_windows_window_icon(paths: RuntimePaths | None = None) -> Path | None:
    resolved_paths = paths or RUNTIME_PATHS
    logo_path = logo_source_path(resolved_paths)
    if not logo_path.exists():
        return None

    icon_dir = resolved_paths.local_state_dir / "branding"
    icon_path = icon_dir / WINDOWS_ICON_FILENAME
    try:
        if icon_path.exists() and icon_path.stat().st_mtime_ns >= logo_path.stat().st_mtime_ns:
            return icon_path
    except OSError:
        pass

    try:
        from PIL import Image
    except ImportError:
        return None

    try:
        icon_dir.mkdir(parents=True, exist_ok=True)
        canvas = load_logo_canvas(Image, source_path=logo_path)
        save_windows_icon(Image, canvas, icon_path)
    except OSError:
        return None

    return icon_path if icon_path.exists() else None
