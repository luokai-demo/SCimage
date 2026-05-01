from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Callable

from job_persistence import load_job_records


def migrate_legacy_job_records(
    connection: sqlite3.Connection,
    *,
    json_path: Path,
    create_job: Callable[[dict], object],
    upsert_job: Callable[[object], None],
) -> None:
    if not json_path.exists() or not _is_valid_json_file(json_path):
        return
    records = load_job_records(json_path)
    with connection:
        for payload in records.values():
            upsert_job(create_job(payload))
    try:
        json_path.unlink()
    except OSError:
        return


def _is_valid_json_file(path: Path) -> bool:
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return True
