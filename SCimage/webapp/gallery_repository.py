from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from typing import Callable


def list_gallery_images(
    connection: sqlite3.Connection,
    *,
    limit: int,
    cursor: str = "",
    sort_asc: bool = False,
    group_by: str = "",
    group_key: str = "",
    decode_job: Callable[[str | dict], object],
) -> dict:
    normalized_limit = max(1, int(limit or 1))
    cursor_updated_at, cursor_job_id, cursor_slot = parse_gallery_cursor(cursor)
    order = "ASC" if sort_asc else "DESC"
    comparison = ">" if sort_asc else "<"
    filters = []
    params: list[object] = []
    normalized_group_by = str(group_by or "").strip().lower()
    normalized_group_key = str(group_key or "").strip()
    if normalized_group_by in {"task", "tasks"} and normalized_group_key:
        filters.append("jobs.id = ?")
        params.append(normalized_group_key)
    elif normalized_group_by in {"prompt", "prompts"} and normalized_group_key:
        filters.append("jobs.prompt = ?")
        params.append(normalized_group_key)

    if cursor_updated_at and cursor_job_id and cursor_slot:
        filters.append(
            f"""(
                job_images.updated_at {comparison} ?
                OR (
                    job_images.updated_at = ?
                    AND (
                        job_images.job_id {comparison} ?
                        OR (job_images.job_id = ? AND job_images.slot {comparison} ?)
                    )
                )
            )"""
        )
        params.extend([cursor_updated_at, cursor_updated_at, cursor_job_id, cursor_job_id, cursor_slot])

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    count_params = params[: len(params) - 5] if cursor_updated_at and cursor_job_id and cursor_slot else params
    count_where = ""
    if normalized_group_by in {"task", "tasks"} and normalized_group_key:
        count_where = "WHERE jobs.id = ?"
    elif normalized_group_by in {"prompt", "prompts"} and normalized_group_key:
        count_where = "WHERE jobs.prompt = ?"
    total = connection.execute(
        f"""
        SELECT COUNT(*)
        FROM job_images
        JOIN jobs ON jobs.id = job_images.job_id
        {count_where}
        """,
        tuple(count_params),
    ).fetchone()[0]

    rows = connection.execute(
        f"""
        SELECT
            jobs.payload AS job_payload,
            job_images.payload AS image_payload,
            job_images.updated_at AS image_updated_at,
            job_images.job_id AS image_job_id,
            job_images.slot AS image_slot
        FROM job_images
        JOIN jobs ON jobs.id = job_images.job_id
        {where_clause}
        ORDER BY job_images.updated_at {order}, job_images.job_id {order}, job_images.slot {order}
        LIMIT ?
        """,
        (*params, normalized_limit),
    ).fetchall()

    items = [_gallery_item_from_row(row, decode_job) for row in rows]
    has_more = len(rows) == normalized_limit
    next_cursor = build_gallery_cursor(
        rows[-1]["image_updated_at"],
        rows[-1]["image_job_id"],
        rows[-1]["image_slot"],
    ) if rows and has_more else ""
    return {
        "items": items,
        "total": int(total),
        "limit": normalized_limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


def list_gallery_groups(
    connection: sqlite3.Connection,
    *,
    group_by: str,
    limit: int,
    cursor: str = "",
    sort_asc: bool = False,
) -> dict:
    normalized_limit = max(1, int(limit or 1))
    normalized_group_by = "prompt" if group_by == "prompt" else "task"
    order = "ASC" if sort_asc else "DESC"
    comparison = ">" if sort_asc else "<"
    cursor_updated_at, cursor_key = parse_group_cursor(cursor)
    key_expression = "jobs.prompt" if normalized_group_by == "prompt" else "jobs.id"
    title_expression = "jobs.prompt"
    base_query = f"""
        SELECT
            {key_expression} AS group_key,
            {title_expression} AS title,
            MAX(job_images.updated_at) AS latest_updated_at,
            COUNT(DISTINCT jobs.id) AS job_count,
            COUNT(job_images.slot) AS image_count
        FROM job_images
        JOIN jobs ON jobs.id = job_images.job_id
        GROUP BY group_key
    """
    params: tuple = ()
    if cursor_updated_at and cursor_key:
        base_query = f"""
            SELECT * FROM ({base_query})
            WHERE latest_updated_at {comparison} ?
                OR (latest_updated_at = ? AND group_key {comparison} ?)
        """
        params = (cursor_updated_at, cursor_updated_at, cursor_key)
    query = f"{base_query} ORDER BY latest_updated_at {order}, group_key {order} LIMIT ?"
    total = connection.execute(
        f"SELECT COUNT(*) FROM (SELECT {key_expression} FROM job_images JOIN jobs ON jobs.id = job_images.job_id GROUP BY {key_expression})"
    ).fetchone()[0]
    rows = connection.execute(query, (*params, normalized_limit)).fetchall()
    groups = [_gallery_group_from_row(row, normalized_group_by) for row in rows]
    has_more = len(rows) == normalized_limit
    next_cursor = build_group_cursor(rows[-1]["latest_updated_at"], rows[-1]["group_key"]) if rows and has_more else ""
    return {
        "groups": groups,
        "group_by": normalized_group_by,
        "total": int(total),
        "limit": normalized_limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


def build_gallery_cursor(updated_at: object, job_id: object, slot: object) -> str:
    updated_text = str(updated_at or "").strip()
    id_text = str(job_id or "").strip()
    slot_text = str(slot or "").strip()
    if not updated_text or not id_text or not slot_text:
        return ""
    return f"{updated_text}|{id_text}|{slot_text}"


def parse_gallery_cursor(cursor: object) -> tuple[str, str, int]:
    normalized = str(cursor or "").strip()
    parts = normalized.rsplit("|", 2)
    if len(parts) != 3:
        return "", "", 0
    return parts[0].strip(), parts[1].strip(), _to_int(parts[2], default=0)


def build_group_cursor(updated_at: object, group_key: object) -> str:
    updated_text = str(updated_at or "").strip()
    key_text = str(group_key or "").strip()
    if not updated_text or not key_text:
        return ""
    return f"{updated_text}|{key_text}"


def parse_group_cursor(cursor: object) -> tuple[str, str]:
    normalized = str(cursor or "").strip()
    if "|" not in normalized:
        return "", ""
    updated_at, key = normalized.rsplit("|", 1)
    return updated_at.strip(), key.strip()


def _gallery_item_from_row(row: sqlite3.Row, decode_job: Callable[[str | dict], object]) -> dict:
    job = asdict(decode_job(row["job_payload"]))
    image = json.loads(row["image_payload"])
    all_images = job.get("images") if isinstance(job.get("images"), list) else []
    return {
        "job": {
            **job,
            "images": [image],
            "image_count": len(all_images) or 1,
        },
        "image": image,
    }


def _gallery_group_from_row(row: sqlite3.Row, group_by: str) -> dict:
    title = str(row["title"] or "").strip() or "未提供提示词"
    return {
        "key": str(row["group_key"] or "").strip() or title,
        "type": group_by,
        "title": title,
        "prompt": title,
        "latest_updated_at": str(row["latest_updated_at"] or ""),
        "job_count": int(row["job_count"] or 0),
        "image_count": int(row["image_count"] or 0),
    }


def _to_int(value: object, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
