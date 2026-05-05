from __future__ import annotations

from config import GENERATED_DIR
from generated_assets import cleanup_empty_generated_dirs


def cleanup_empty_generated_dirs_payload() -> dict:
    removed_dirs = cleanup_empty_generated_dirs()
    return {
        "ok": True,
        "removed_count": len(removed_dirs),
        "removed_dirs": [str(path.relative_to(GENERATED_DIR.parent)) for path in removed_dirs],
    }
