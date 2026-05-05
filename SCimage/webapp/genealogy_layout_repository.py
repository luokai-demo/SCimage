from __future__ import annotations

import sqlite3
from typing import Callable, Union


JobDecoder = Callable[[Union[str, dict]], object]


def list_genealogy_positions(connection: sqlite3.Connection) -> dict[str, dict]:
    rows = connection.execute(
        """
        SELECT node_id, x, y
        FROM genealogy_node_positions
        ORDER BY node_id
        """
    ).fetchall()
    positions: dict[str, dict] = {}
    for row in rows:
        positions[str(row["node_id"])] = {
            "x": int(row["x"]),
            "y": int(row["y"]),
        }
    return positions


def update_genealogy_node_positions(
    connection: sqlite3.Connection,
    *,
    positions: dict,
    updated_at: str,
    decode_job: JobDecoder,
) -> dict[str, dict]:
    if not isinstance(positions, dict):
        raise ValueError("节点位置列表格式错误。")

    normalized_positions: dict[str, dict] = {}
    missing_node_ids: list[str] = []
    for node_id, position in positions.items():
        normalized_node_id = str(node_id or "").strip()
        if not normalized_node_id:
            raise ValueError("族谱节点不能为空。")
        normalized_position = normalize_genealogy_position(position)
        if not genealogy_node_exists(connection, normalized_node_id, decode_job=decode_job):
            missing_node_ids.append(normalized_node_id)
            continue
        normalized_positions[normalized_node_id] = normalized_position

    if missing_node_ids:
        raise KeyError("族谱节点不存在：" + "、".join(missing_node_ids))

    connection.executemany(
        """
        INSERT INTO genealogy_node_positions (node_id, x, y, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
            x = excluded.x,
            y = excluded.y,
            updated_at = excluded.updated_at
        """,
        [
            (
                node_id,
                position["x"],
                position["y"],
                updated_at,
            )
            for node_id, position in normalized_positions.items()
        ],
    )
    return normalized_positions


def remove_genealogy_position_for_node(connection: sqlite3.Connection, node_id: str) -> None:
    if not node_id:
        return
    connection.execute(
        """
        DELETE FROM genealogy_node_positions
        WHERE node_id = ?
        """,
        (node_id,),
    )


def remove_genealogy_positions_for_job(connection: sqlite3.Connection, job_id: str) -> None:
    normalized_job_id = str(job_id or "").strip()
    if not normalized_job_id:
        return
    connection.execute(
        """
        DELETE FROM genealogy_node_positions
        WHERE node_id LIKE ? OR node_id LIKE ?
        """,
        (
            f"{normalized_job_id}:%",
            f"source:{normalized_job_id}:%",
        ),
    )


def genealogy_node_exists(
    connection: sqlite3.Connection,
    node_id: str,
    *,
    decode_job: JobDecoder,
) -> bool:
    if node_id.startswith("source:"):
        return source_genealogy_node_exists(connection, node_id, decode_job=decode_job)
    parsed = parse_image_node_id(node_id)
    if parsed is None:
        return False
    job_id, slot = parsed
    row = connection.execute(
        "SELECT 1 FROM job_images WHERE job_id = ? AND slot = ? LIMIT 1",
        (job_id, slot),
    ).fetchone()
    if row is not None:
        return True
    return generated_genealogy_node_exists(connection, job_id, slot, decode_job=decode_job)


def generated_genealogy_node_exists(
    connection: sqlite3.Connection,
    job_id: str,
    slot: int,
    *,
    decode_job: JobDecoder,
) -> bool:
    row = connection.execute(
        "SELECT payload FROM jobs WHERE id = ? LIMIT 1",
        (job_id,),
    ).fetchone()
    if row is None:
        return False
    job = decode_job(row["payload"])
    return any(to_int(image.get("slot"), default=0) == slot for image in getattr(job, "images", []))


def source_genealogy_node_exists(
    connection: sqlite3.Connection,
    node_id: str,
    *,
    decode_job: JobDecoder,
) -> bool:
    parts = node_id.split(":")
    if len(parts) < 3:
        return False
    source_job_id = ":".join(parts[1:-1])
    source_slot = to_int(parts[-1], default=0)
    if not source_job_id or source_slot <= 0:
        return False
    row = connection.execute(
        "SELECT payload FROM jobs WHERE id = ? LIMIT 1",
        (source_job_id,),
    ).fetchone()
    if row is None:
        return False
    job = decode_job(row["payload"])
    return any(to_int(source.get("slot"), default=0) == source_slot for source in getattr(job, "source_images", []))


def normalize_genealogy_position(position: dict) -> dict:
    if not isinstance(position, dict):
        raise ValueError("节点位置格式错误。")
    try:
        x = round(float(position.get("x")))
        y = round(float(position.get("y")))
    except (TypeError, ValueError) as exc:
        raise ValueError("节点位置必须是数字。") from exc
    if x < 0 or y < 0:
        raise ValueError("节点位置不能为负数。")
    return {"x": x, "y": y}


def image_node_id(job_id: object, slot: object) -> str:
    normalized_job_id = str(job_id or "").strip()
    normalized_slot = to_int(slot, default=0)
    if not normalized_job_id or normalized_slot <= 0:
        return ""
    return f"{normalized_job_id}:{normalized_slot}"


def parse_image_node_id(node_id: object) -> tuple[str, int] | None:
    text = str(node_id or "").strip()
    if not text or ":" not in text:
        return None
    job_id, slot_text = text.rsplit(":", 1)
    slot = to_int(slot_text, default=0)
    if not job_id or slot <= 0:
        return None
    return job_id, slot


def to_int(value: object, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
