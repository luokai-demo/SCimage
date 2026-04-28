from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import brand_assets  # noqa: E402
from runtime_paths import resolve_runtime_paths  # noqa: E402

try:
    from PIL import Image
except ImportError:  # pragma: no cover - depends on local env
    Image = None


@unittest.skipIf(Image is None, "Pillow 未安装")
class BrandAssetsTests(unittest.TestCase):
    def test_clean_corner_background_removes_connected_white_corners_only(self) -> None:
        canvas = Image.new("RGBA", (5, 5), (255, 255, 255, 255))
        for y in range(1, 4):
            for x in range(1, 4):
                canvas.putpixel((x, y), (20, 20, 20, 255))
        canvas.putpixel((2, 2), (255, 255, 255, 255))

        cleaned = brand_assets.clean_corner_background(canvas, threshold=244)

        self.assertEqual(cleaned.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(cleaned.getpixel((1, 1)), (20, 20, 20, 255))
        self.assertEqual(cleaned.getpixel((2, 2)), (255, 255, 255, 255))

    def test_resolve_desktop_window_icon_path_returns_png_on_macos(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            logo_path = root / "webapp" / "static" / "logo.png"
            logo_path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGBA", (8, 8), (20, 20, 20, 255)).save(logo_path)
            paths = resolve_runtime_paths(
                platform_system="Darwin",
                is_frozen=True,
                resource_root=root,
                executable_path=root / "SCimage.app" / "Contents" / "MacOS" / "SCimage",
                home_dir=root,
            )

            icon_path = brand_assets.resolve_desktop_window_icon_path(paths)

        self.assertEqual(icon_path, logo_path.resolve())

    def test_resize_rgba_canvas_preserves_transparent_corner_without_white_halo(self) -> None:
        canvas = Image.new("RGBA", (64, 64), (255, 255, 255, 255))
        for y in range(8, 56):
            for x in range(8, 56):
                canvas.putpixel((x, y), (24, 24, 24, 255))
        cleaned = brand_assets.clean_corner_background(canvas, threshold=244)

        resized = brand_assets.resize_rgba_canvas(Image, cleaned, 16)

        self.assertEqual(resized.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertLess(resized.getpixel((1, 1))[0], 80)

    def test_ensure_windows_window_icon_generates_ico(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            logo_path = root / "webapp" / "static" / "logo.png"
            logo_path.parent.mkdir(parents=True, exist_ok=True)
            logo = Image.new("RGBA", (32, 32), (255, 255, 255, 255))
            for y in range(4, 28):
                for x in range(4, 28):
                    logo.putpixel((x, y), (20, 20, 20, 255))
            logo.save(logo_path)
            paths = resolve_runtime_paths(
                platform_system="Windows",
                is_frozen=True,
                resource_root=root,
                executable_path=root / "SCimage.exe",
                windows_d_drive_exists=False,
            )

            icon_path = brand_assets.ensure_windows_window_icon(paths)

            self.assertIsNotNone(icon_path)
            assert icon_path is not None
            self.assertTrue(icon_path.exists())
            self.assertEqual(icon_path.suffix.lower(), ".ico")


if __name__ == "__main__":
    unittest.main()
