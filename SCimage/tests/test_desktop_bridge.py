from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import desktop_bridge  # noqa: E402


class DesktopBridgePathTests(unittest.TestCase):
    def test_resolve_generated_path_accepts_same_origin_generated_url(self) -> None:
        with TemporaryDirectory() as temp_dir:
            generated_root = Path(temp_dir).resolve()
            original_root = desktop_bridge.GENERATED_DIR
            desktop_bridge.GENERATED_DIR = generated_root
            try:
                path = desktop_bridge.resolve_generated_path(
                    "http://127.0.0.1:8765/generated/job-1/image-1.png",
                    base_url="http://127.0.0.1:8765",
                )
            finally:
                desktop_bridge.GENERATED_DIR = original_root

        self.assertEqual(path, generated_root / "job-1" / "image-1.png")

    def test_resolve_generated_path_rejects_other_origin(self) -> None:
        path = desktop_bridge.resolve_generated_path(
            "https://example.com/generated/job-1/image-1.png",
            base_url="http://127.0.0.1:8765",
        )
        self.assertIsNone(path)

    def test_resolve_generated_path_rejects_path_traversal(self) -> None:
        with TemporaryDirectory() as temp_dir:
            generated_root = Path(temp_dir).resolve()
            original_root = desktop_bridge.GENERATED_DIR
            desktop_bridge.GENERATED_DIR = generated_root
            try:
                path = desktop_bridge.resolve_generated_path(
                    "/generated/../secret.txt",
                    base_url="http://127.0.0.1:8765",
                )
            finally:
                desktop_bridge.GENERATED_DIR = original_root

        self.assertIsNone(path)


if __name__ == "__main__":
    unittest.main()
