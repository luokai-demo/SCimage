from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
import json
from pathlib import Path
import sqlite3
from threading import Lock
from typing import Dict, List, Optional
from uuid import uuid4

from config import JOB_DATABASE_PATH, LOCAL_STATE_DIR
from database_maintenance import check_database_consistency, maintain_database
from database_migrations import initialize_database
from gallery_repository import list_gallery_groups, list_gallery_images
from job_persistence import JOB_RECORDS_PATH
from job_repository import encode_job_payload, list_jobs_page
from legacy_job_migration import migrate_legacy_job_records
from output_options import DEFAULT_OUTPUT_PROFILE_ID, DEFAULT_SIZE_OPTION
from provider_compat import DEFAULT_COMPAT_PROFILE_ID
from workflows import DEFAULT_WORKFLOW, normalize_workflow


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass
class JobRecord:
    id: str
    prompt: str
    count: int
    quality: str
    size: str = DEFAULT_SIZE_OPTION
    model: str = ""
    compat_profile_id: str = DEFAULT_COMPAT_PROFILE_ID
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID
    workflow: str = DEFAULT_WORKFLOW
    status: str = "queued"
    message: str = "任务已创建，等待生成。"
    created_at: str = field(default_factory=_now)
    run_started_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    images: List[dict] = field(default_factory=list)
    source_images: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None


class JobStore:
    def __init__(self, database_path: Path = JOB_DATABASE_PATH) -> None:
        self._path = Path(database_path)
        self._lock = Lock()
        self._connection = self._connect()
        self._closed = False
        with self._lock:
            self._initialize_schema_unlocked()
            self._migrate_json_records_unlocked()
            self._recover_incomplete_jobs_unlocked()

    def __enter__(self) -> "JobStore":
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.close()

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._connection.close()
            self._closed = True

    def create(
        self,
        prompt: str,
        count: int,
        quality: str,
        size: str = DEFAULT_SIZE_OPTION,
        *,
        model: str = "",
        compat_profile_id: str = DEFAULT_COMPAT_PROFILE_ID,
        output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID,
        workflow: str = DEFAULT_WORKFLOW,
        source_images: Optional[List[Dict[str, str]]] = None,
        job_id: Optional[str] = None,
    ) -> JobRecord:
        created_time = _now()
        job = JobRecord(
            id=job_id or uuid4().hex[:12],
            workflow=normalize_workflow(workflow),
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
            model=str(model or ""),
            compat_profile_id=compat_profile_id,
            output_profile_id=output_profile_id,
            created_at=created_time,
            run_started_at=created_time,
            updated_at=created_time,
            source_images=sorted(source_images or [], key=lambda item: item.get("slot", 0)),
        )
        with self._lock:
            self._upsert_unlocked(job)
        return job

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._get_unlocked(job_id)

    def snapshot(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._get_unlocked(job_id)
            return asdict(job) if job else None

    def list_recent(self, limit: int) -> List[dict]:
        return self.list_page(offset=0, limit=limit)["jobs"]

    def list_all(self) -> List[dict]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT payload FROM jobs ORDER BY updated_at DESC, id DESC"
            ).fetchall()
            return [asdict(_job_from_payload(row["payload"])) for row in rows]

    def list_page(self, *, offset: int = 0, limit: int, cursor: str = "") -> dict:
        with self._lock:
            return list_jobs_page(self._connection, offset=offset, limit=limit, cursor=cursor, decode_job=_job_from_payload)

    def list_gallery_images(
        self,
        *,
        limit: int,
        cursor: str = "",
        sort_asc: bool = False,
        group_by: str = "",
        group_key: str = "",
    ) -> dict:
        with self._lock:
            return list_gallery_images(
                self._connection,
                limit=limit,
                cursor=cursor,
                sort_asc=sort_asc,
                group_by=group_by,
                group_key=group_key,
                decode_job=_job_from_payload,
            )

    def list_gallery_groups(self, *, group_by: str, limit: int, cursor: str = "", sort_asc: bool = False) -> dict:
        normalized_limit = max(1, int(limit or 1))
        with self._lock:
            return list_gallery_groups(self._connection, group_by=group_by, limit=normalized_limit, cursor=cursor, sort_asc=sort_asc)

    def maintain_database(self, *, vacuum: bool = False) -> dict:
        with self._lock:
            return maintain_database(self._connection, vacuum=vacuum)

    def check_database(self, *, check_files: bool = False) -> dict:
        with self._lock:
            return check_database_consistency(self._connection, check_files=check_files)

    def update_status(self, job_id: str, status: str, message: str) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            if job.status in {"canceled", "completed", "partial", "failed"}:
                return
            job.status = status
            job.message = message
            job.updated_at = _now()
            self._upsert_unlocked(job)

    def append_image(self, job_id: str, image: dict, message: Optional[str] = None) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            remaining = [item for item in job.images if item.get("slot") != image.get("slot")]
            remaining.append(image)
            job.images = sorted(remaining, key=lambda item: item.get("slot", 0))
            if job.status == "canceled":
                job.message = f"任务已中断，已保留 {len(job.images)}/{job.count} 张图片。"
            elif message:
                job.message = message
            job.updated_at = _now()
            self._upsert_unlocked(job)

    def complete(self, job_id: str, images: List[dict], warnings: Optional[List[str]] = None) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            if job.status == "canceled":
                merged = {int(item.get("slot", 0)): item for item in job.images}
                for image in images:
                    merged[int(image.get("slot", 0))] = image
                job.images = sorted(merged.values(), key=lambda item: item.get("slot", 0))
                job.warnings = warnings or job.warnings
                if job.images:
                    job.message = f"任务已中断，已保留 {len(job.images)}/{job.count} 张图片。"
                else:
                    job.message = "任务已中断，当前没有可保留的图片。"
                job.updated_at = _now()
                self._upsert_unlocked(job)
                return
            job.images = sorted(images, key=lambda item: item.get("slot", 0))
            job.warnings = warnings or []
            if job.warnings:
                job.status = "partial"
                job.message = f"已生成 {len(job.images)}/{job.count} 张图片，失败 {len(job.warnings)} 张。"
            else:
                job.status = "completed"
                job.message = f"图片已生成完成，共 {len(job.images)} 张。"
            job.updated_at = _now()
            self._upsert_unlocked(job)

    def cancel(self, job_id: str, images: List[dict], warnings: Optional[List[str]] = None) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            merged_images = {int(item.get("slot", 0)): item for item in job.images}
            for image in images:
                merged_images[int(image.get("slot", 0))] = image
            job.status = "canceled"
            job.images = sorted(merged_images.values(), key=lambda item: item.get("slot", 0))
            job.warnings = warnings or job.warnings
            if job.images:
                job.message = f"任务已中断，已保留 {len(job.images)}/{job.count} 张图片。"
            else:
                job.message = "任务已中断，当前没有可保留的图片。"
            job.updated_at = _now()
            self._upsert_unlocked(job)

    def fail(self, job_id: str, error: str) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            if job.status == "canceled":
                if error:
                    job.warnings = [error]
                job.updated_at = _now()
                self._upsert_unlocked(job)
                return
            job.status = "failed"
            job.message = "生成失败。"
            job.error = error
            job.updated_at = _now()
            self._upsert_unlocked(job)

    def retry(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._get_unlocked(job_id)
            if job is None:
                return None

            retry_time = _now()
            job.status = "queued"
            job.message = "任务已重试，等待生成。"
            job.images = []
            job.warnings = []
            job.error = None
            job.run_started_at = retry_time
            job.updated_at = retry_time
            self._upsert_unlocked(job)
            return asdict(job)

    def remove(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            removed = self._get_unlocked(job_id)
            if removed is not None:
                self._connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
                self._connection.commit()
            return removed

    def remove_image(self, job_id: str, slot: int) -> tuple[Optional[dict], Optional[dict], bool]:
        with self._lock:
            job = self._get_unlocked(job_id)
            if job is None:
                return None, None, False

            remaining: List[dict] = []
            removed_image: Optional[dict] = None
            for image in job.images:
                if removed_image is None and int(image.get("slot", 0)) == slot:
                    removed_image = image
                    continue
                remaining.append(image)

            if removed_image is None:
                return asdict(job), None, False

            job.images = sorted(remaining, key=lambda item: item.get("slot", 0))
            deleted_job = len(job.images) == 0
            if deleted_job:
                self._connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
                self._connection.commit()
                return None, removed_image, True

            job.message = f"已删除 1 张图片，当前保留 {len(job.images)} 张。"
            job.updated_at = _now()
            self._upsert_unlocked(job)
            return asdict(job), removed_image, False

    def remove_images(self, selections: list[dict]) -> dict:
        removed: list[dict] = []
        deleted_jobs: set[str] = set()
        missing: list[dict] = []
        with self._lock:
            for selection in selections:
                job_id = str(selection.get("job_id", "")).strip()
                slot = _to_int(selection.get("slot"), default=0)
                job = self._get_unlocked(job_id)
                if job is None or job.status not in {"completed", "partial", "failed", "canceled"}:
                    missing.append({"job_id": job_id, "slot": slot})
                    continue
                remaining = []
                removed_image = None
                for image in job.images:
                    if removed_image is None and _to_int(image.get("slot"), default=0) == slot:
                        removed_image = image
                    else:
                        remaining.append(image)
                if removed_image is None:
                    missing.append({"job_id": job_id, "slot": slot})
                    continue
                removed.append({"job_id": job_id, "image": removed_image})
                if not remaining:
                    self._connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
                    deleted_jobs.add(job_id)
                    continue
                job.images = sorted(remaining, key=lambda item: item.get("slot", 0))
                job.message = f"已批量删除图片，当前保留 {len(job.images)} 张。"
                job.updated_at = _now()
                self._upsert_unlocked(job, commit=False)
            self._connection.commit()
        return {
            "removed": removed,
            "deleted_jobs": sorted(deleted_jobs),
            "missing": missing,
        }

    def _connect(self) -> sqlite3.Connection:
        LOCAL_STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self._path), check_same_thread=False)
        connection.row_factory = sqlite3.Row
        initialize_database(connection)
        return connection

    def _initialize_schema_unlocked(self) -> None:
        initialize_database(self._connection)
        self._rebuild_missing_image_index_unlocked()

    def _migrate_json_records_unlocked(self) -> None:
        migrate_legacy_job_records(
            self._connection,
            json_path=JOB_RECORDS_PATH,
            create_job=lambda payload: JobRecord(**payload),
            upsert_job=lambda job: self._upsert_unlocked(job, commit=False),
        )

    def _recover_incomplete_jobs_unlocked(self) -> None:
        recovery_time = _now()
        rows = self._connection.execute(
            "SELECT payload FROM jobs WHERE status IN ('queued', 'running', 'canceling')"
        ).fetchall()
        for row in rows:
            job = _job_from_payload(row["payload"])
            job.status = "canceled"
            if job.images:
                job.message = f"本地后端已重启，任务已停止，已保留 {len(job.images)}/{job.count} 张图片。"
            else:
                job.message = "本地后端已重启，任务已停止。"
            job.updated_at = recovery_time
            self._upsert_unlocked(job, commit=False)
        if rows:
            self._connection.commit()

    def _get_unlocked(self, job_id: str) -> Optional[JobRecord]:
        row = self._connection.execute("SELECT payload FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            return None
        return _job_from_payload(row["payload"])

    def _require_unlocked(self, job_id: str) -> JobRecord:
        job = self._get_unlocked(job_id)
        if job is None:
            raise KeyError(job_id)
        return job

    def _upsert_unlocked(self, job: JobRecord, *, commit: bool = True) -> None:
        payload = encode_job_payload(job)
        self._connection.execute(
            """
            INSERT INTO jobs (
                id,
                created_at,
                updated_at,
                status,
                prompt,
                workflow,
                quality,
                size,
                compat_profile_id,
                output_profile_id,
                image_count,
                payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                status = excluded.status,
                prompt = excluded.prompt,
                workflow = excluded.workflow,
                quality = excluded.quality,
                size = excluded.size,
                compat_profile_id = excluded.compat_profile_id,
                output_profile_id = excluded.output_profile_id,
                image_count = excluded.image_count,
                payload = excluded.payload
            """,
            (
                job.id,
                job.created_at,
                job.updated_at,
                job.status,
                job.prompt,
                job.workflow,
                job.quality,
                job.size,
                job.compat_profile_id,
                job.output_profile_id,
                len(job.images),
                payload,
            ),
        )
        self._replace_image_index_unlocked(job)
        if commit:
            self._connection.commit()

    def _replace_image_index_unlocked(self, job: JobRecord) -> None:
        self._connection.execute("DELETE FROM job_images WHERE job_id = ?", (job.id,))
        for image in job.images:
            self._connection.execute(
                """
                INSERT INTO job_images (
                    job_id,
                    slot,
                    name,
                    url,
                    preview_url,
                    width,
                    height,
                    placeholder_color,
                    placeholder_accent_color,
                    created_at,
                    updated_at,
                    payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job.id,
                    _to_int(image.get("slot"), default=0),
                    str(image.get("name", "") or ""),
                    str(image.get("url", "") or ""),
                    str(image.get("preview_url", "") or ""),
                    _to_int(image.get("width"), default=0),
                    _to_int(image.get("height"), default=0),
                    str(image.get("placeholder_color", "") or ""),
                    str(image.get("placeholder_accent_color", "") or ""),
                    job.created_at,
                    job.updated_at,
                    json.dumps(image, ensure_ascii=False, separators=(",", ":")),
                ),
            )

    def _rebuild_missing_image_index_unlocked(self) -> None:
        marker = self._connection.execute(
            "SELECT value FROM schema_meta WHERE key = 'image_index_backfilled'"
        ).fetchone()
        if marker and marker["value"] == "1":
            return
        indexed_jobs = {
            row["job_id"]
            for row in self._connection.execute("SELECT DISTINCT job_id FROM job_images").fetchall()
        }
        rows = self._connection.execute("SELECT id, payload FROM jobs").fetchall()
        for row in rows:
            if row["id"] in indexed_jobs:
                continue
            job = _job_from_payload(row["payload"])
            if not job.images:
                continue
            self._connection.execute(
                "UPDATE jobs SET image_count = ? WHERE id = ?",
                (len(job.images), job.id),
            )
            self._replace_image_index_unlocked(job)
        self._connection.execute(
            """
            INSERT INTO schema_meta (key, value)
            VALUES ('image_index_backfilled', '1')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """
        )
        self._connection.commit()


def _job_from_payload(payload: str | dict) -> JobRecord:
    raw_payload = json.loads(payload) if isinstance(payload, str) else dict(payload)
    return JobRecord(**raw_payload)


def _job_to_dict(job: JobRecord) -> dict:
    return asdict(job)


def _to_int(value: object, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
