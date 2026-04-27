from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from runtime_paths import APP_NAME, ensure_runtime_data_dirs, resolve_runtime_paths


class RuntimePathsTests(unittest.TestCase):
    def test_development_mode_uses_project_root_for_data_and_resources(self) -> None:
        module_file = PROJECT_ROOT / "webapp" / "runtime_paths.py"
        paths = resolve_runtime_paths(
            platform_system="Darwin",
            is_frozen=False,
            module_file=module_file,
        )

        self.assertEqual(paths.resource_root, PROJECT_ROOT.resolve())
        self.assertEqual(paths.data_root, PROJECT_ROOT.resolve())
        self.assertEqual(paths.generated_dir, PROJECT_ROOT.resolve() / "generated")
        self.assertEqual(paths.local_state_dir, PROJECT_ROOT.resolve() / ".local")

    def test_windows_frozen_prefers_d_drive(self) -> None:
        paths = resolve_runtime_paths(
            platform_system="Windows",
            is_frozen=True,
            module_file=PROJECT_ROOT / "webapp" / "runtime_paths.py",
            executable_path="/tmp/SCimage.exe",
            resource_root="/tmp/resources",
            windows_d_drive_exists=True,
        )

        self.assertEqual(paths.data_root, Path("D:/") / APP_NAME)
        self.assertEqual(paths.generated_dir, Path("D:/") / APP_NAME / "generated")

    def test_windows_frozen_without_d_drive_falls_back_to_executable_sibling(self) -> None:
        executable_path = "/tmp/SCimage.exe"
        paths = resolve_runtime_paths(
            platform_system="Windows",
            is_frozen=True,
            module_file=PROJECT_ROOT / "webapp" / "runtime_paths.py",
            executable_path=executable_path,
            resource_root="/tmp/resources",
            windows_d_drive_exists=False,
        )

        self.assertEqual(paths.data_root, Path(executable_path).resolve().parent / APP_NAME)

    def test_macos_frozen_uses_documents_directory(self) -> None:
        paths = resolve_runtime_paths(
            platform_system="Darwin",
            is_frozen=True,
            module_file=PROJECT_ROOT / "webapp" / "runtime_paths.py",
            executable_path="/Applications/SCimage.app/Contents/MacOS/SCimage",
            resource_root="/Applications/SCimage.app/Contents/Resources",
            home_dir="/Users/tester",
        )

        self.assertEqual(paths.data_root, Path("/Users/tester/Documents") / APP_NAME)
        self.assertEqual(paths.provider_profiles_path, Path("/Users/tester/Documents") / APP_NAME / ".local/provider-profiles.json")

    def test_ensure_runtime_data_dirs_creates_expected_tree(self) -> None:
        with TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            paths = resolve_runtime_paths(
                platform_system="Darwin",
                is_frozen=True,
                module_file=PROJECT_ROOT / "webapp" / "runtime_paths.py",
                executable_path=temp_root / "SCimage",
                resource_root=temp_root / "resources",
                home_dir=temp_root,
            )

            ensure_runtime_data_dirs(paths)

            self.assertTrue(paths.data_root.exists())
            self.assertTrue(paths.generated_dir.exists())
            self.assertTrue(paths.local_state_dir.exists())


if __name__ == "__main__":
    unittest.main()
