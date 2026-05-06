from __future__ import annotations

import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYTHON_TESTS = [
    "tests/test_api_routes.py",
    "tests/test_batch_gallery_actions.py",
    "tests/test_brand_assets.py",
    "tests/test_build_desktop.py",
    "tests/test_desktop_bridge.py",
    "tests/test_genealogy.py",
    "tests/test_image_service.py",
    "tests/test_job_pagination.py",
    "tests/test_multi_api_compat.py",
    "tests/test_provider_model_catalog.py",
    "tests/test_runtime_paths.py",
    "tests/test_server_lifecycle.py",
    "tests/test_workspace_state_store.py",
]
PY_COMPILE_TARGETS = [
    "scripts",
    "webapp",
]


def main() -> int:
    compile_result = subprocess.run(
        [
            sys.executable,
            "-m",
            "compileall",
            "-q",
            *PY_COMPILE_TARGETS,
        ],
        cwd=PROJECT_ROOT,
    )
    if compile_result.returncode:
        return compile_result.returncode

    return subprocess.run(
        [
            sys.executable,
            "-m",
            "unittest",
            *PYTHON_TESTS,
        ],
        cwd=PROJECT_ROOT,
    ).returncode


if __name__ == "__main__":
    raise SystemExit(main())
