from __future__ import annotations

import json
import sqlite3
from typing import Callable

from job_models import JobRecord, job_to_dict, to_int


IMAGE_INDEX_BACKFILL_KEY = "image_index_backfilled_without_previews"


def replace_job_image_index(connection: sqlite3.Connection, job: JobRecord) -> None:
    connection.execute("DELETE FROM job_images WHERE job_id = ?", (job.id,))
    for image in job_to_dict(job)["images"]:
        connection.execute(
            """
            INSERT INTO job_images (
                job_id,
                slot,
                name,
                url,
                width,
                height,
                created_at,
                updated_at,
                payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.id,
                to_int(image.get("slot"), default=0),
                str(image.get("name", "") or ""),
                str(image.get("url", "") or ""),
                to_int(image.get("width"), default=0),
                to_int(image.get("height"), default=0),
                job.created_at,
                job.updated_at,
                json.dumps(image, ensure_ascii=False, separators=(",", ":")),
            ),
        )


def rebuild_missing_job_image_index(
    connection: sqlite3.Connection,
    *,
    decode_job: Callable[[str | dict], JobRecord],
) -> None:
    marker = connection.execute(
        "SELECT value FROM schema_meta WHERE key = ?",
        (IMAGE_INDEX_BACKFILL_KEY,),
    ).fetchone()
    if marker and marker["value"] == "1":
        return

    indexed_jobs = {
        row["job_id"]
        for row in connection.execute("SELECT DISTINCT job_id FROM job_images").fetchall()
    }
    rows = connection.execute("SELECT id, payload FROM jobs").fetchall()
    for row in rows:
        if row["id"] in indexed_jobs:
            continue
        job = decode_job(row["payload"])
        if not job.images:
            continue
        connection.execute(
            "UPDATE jobs SET image_count = ? WHERE id = ?",
            (len(job.images), job.id),
        )
        replace_job_image_index(connection, job)

    connection.execute(
        """
        INSERT INTO schema_meta (key, value)
        VALUES (?, '1')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (IMAGE_INDEX_BACKFILL_KEY,),
    )
    connection.commit()
