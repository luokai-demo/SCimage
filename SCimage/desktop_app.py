from __future__ import annotations

import multiprocessing
from pathlib import Path
import sys


WEBAPP_DIR = Path(__file__).resolve().parent / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from desktop_shell import run_desktop_app  # noqa: E402


def main() -> int:
    multiprocessing.freeze_support()
    return run_desktop_app()


if __name__ == "__main__":
    raise SystemExit(main())
