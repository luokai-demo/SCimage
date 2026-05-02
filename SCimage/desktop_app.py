from __future__ import annotations

import multiprocessing
from pathlib import Path
import sys


WEBAPP_DIR = Path(__file__).resolve().parent / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))


def main() -> int:
    multiprocessing.freeze_support()
    if "--sdk-worker" in sys.argv:
        from openai_image_sdk import _run_worker_from_stdin

        return _run_worker_from_stdin()

    from desktop_shell import run_desktop_app

    return run_desktop_app()


if __name__ == "__main__":
    raise SystemExit(main())
