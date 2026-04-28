from __future__ import annotations

from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import scripts.build_desktop as build_desktop  # noqa: E402


class BuildDesktopVersionTests(unittest.TestCase):
    def test_resolve_windows_build_version_uses_release_tag(self) -> None:
        version_tuple, display_version = build_desktop.resolve_windows_build_version(
            app_version="1.2.3",
            ref_name="v1.2.3-r0013",
            run_number="999",
        )

        self.assertEqual(version_tuple, (1, 2, 3, 1300))
        self.assertEqual(display_version, "1.2.3.1300")

    def test_resolve_windows_build_version_includes_retry_suffix(self) -> None:
        version_tuple, display_version = build_desktop.resolve_windows_build_version(
            app_version="1.2.3",
            ref_name="v1.2.3-r0013-retry.2",
            run_number="999",
        )

        self.assertEqual(version_tuple, (1, 2, 3, 1302))
        self.assertEqual(display_version, "1.2.3.1302")

    def test_resolve_windows_build_version_falls_back_to_run_number(self) -> None:
        version_tuple, display_version = build_desktop.resolve_windows_build_version(
            app_version="1.2.3",
            ref_name="",
            run_number="42",
        )

        self.assertEqual(version_tuple, (1, 2, 3, 42))
        self.assertEqual(display_version, "1.2.3.42")


if __name__ == "__main__":
    unittest.main()
