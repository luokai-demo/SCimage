from __future__ import annotations

from pathlib import Path
import sys


WEBAPP_DIR = Path(__file__).resolve().parents[1] / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from openai_image_sdk import *  # noqa: F401,F403,E402
