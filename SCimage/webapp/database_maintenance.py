from __future__ import annotations

import sqlite3
from pathlib import Path

from config import GENERATED_DIR


def maintain_database(connection: sqlite3.Connection, *, vacuum: bool = False) -> dict:
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    connection.execute("ANALYZE")
    if vacuum:
        connection.execute("VACUUM")
    page_count = connection.execute("PRAGMA page_count").fetchone()[0]
    freelist_count = connection.execute("PRAGMA freelist_count").fetchone()[0]
    job_count = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    image_count = connection.execute("SELECT COUNT(*) FROM job_images").fetchone()[0]
    return {
        "ok": True,
        "vacuum": bool(vacuum),
        "page_count": int(page_count),
        "freelist_count": int(freelist_count),
        "job_count": int(job_count),
        "image_count": int(image_count),
    }


def check_database_consistency(connection: sqlite3.Connection, *, check_files: bool = False) -> dict:
    orphan_images = connection.execute(
        """
        SELECT COUNT(*)
        FROM job_images
        LEFT JOIN jobs ON jobs.id = job_images.job_id
        WHERE jobs.id IS NULL
        """
    ).fetchone()[0]
    mismatched_image_counts = connection.execute(
        """
        SELECT COUNT(*)
        FROM jobs
        LEFT JOIN (
            SELECT job_id, COUNT(*) AS indexed_count
            FROM job_images
            GROUP BY job_id
        ) indexed ON indexed.job_id = jobs.id
        WHERE jobs.image_count != COALESCE(indexed.indexed_count, 0)
        """
    ).fetchone()[0]
    missing_files = 0
    if check_files:
        rows = connection.execute("SELECT job_id, name FROM job_images").fetchall()
        for row in rows:
            if not _indexed_image_path(str(row["job_id"]), str(row["name"])).exists():
                missing_files += 1

    return {
        "ok": orphan_images == 0 and mismatched_image_counts == 0 and missing_files == 0,
        "orphan_images": int(orphan_images),
        "mismatched_image_counts": int(mismatched_image_counts),
        "missing_files": int(missing_files),
        "checked_files": bool(check_files),
    }


def _indexed_image_path(job_id: str, name: str) -> Path:
    return (GENERATED_DIR / job_id / name).resolve()
