from __future__ import annotations

import json
import sqlite3
from typing import Callable

from job_models import job_to_dict


def list_jobs_page(
    connection: sqlite3.Connection,
    *,
    offset: int = 0,
    limit: int,
    cursor: str = "",
    decode_job: Callable[[str | dict], object],
) -> dict:
    normalized_offset = max(0, int(offset or 0))
    normalized_limit = max(1, int(limit or 1))
    cursor_created_at, cursor_id = parse_page_cursor(cursor)
    total = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    if cursor_created_at and cursor_id:
        rows = connection.execute(
            """
            SELECT payload, created_at, id FROM jobs
            WHERE created_at < ? OR (created_at = ? AND id < ?)
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (cursor_created_at, cursor_created_at, cursor_id, normalized_limit),
        ).fetchall()
    else:
        rows = connection.execute(
            """
            SELECT payload, created_at, id FROM jobs
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (normalized_limit, normalized_offset),
        ).fetchall()

    jobs = [job_to_dict(decode_job(row["payload"])) for row in rows]
    has_more = len(rows) == normalized_limit if cursor_created_at and cursor_id else normalized_offset + len(jobs) < int(total)
    next_cursor = build_page_cursor(rows[-1]["created_at"], rows[-1]["id"]) if rows and has_more else ""
    return {
        "jobs": jobs,
        "total": int(total),
        "offset": normalized_offset,
        "limit": normalized_limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


def encode_job_payload(job: object) -> str:
    return json.dumps(job_to_dict(job), ensure_ascii=False, separators=(",", ":"))


def build_page_cursor(created_at: object, job_id: object) -> str:
    created_text = str(created_at or "").strip()
    id_text = str(job_id or "").strip()
    if not created_text or not id_text:
        return ""
    return f"{created_text}|{id_text}"


def parse_page_cursor(cursor: object) -> tuple[str, str]:
    normalized = str(cursor or "").strip()
    if "|" not in normalized:
        return "", ""
    created_at, job_id = normalized.rsplit("|", 1)
    return created_at.strip(), job_id.strip()
