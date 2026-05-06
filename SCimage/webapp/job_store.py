from __future__ import annotations

from pathlib import Path
import sqlite3
from threading import Lock
from typing import List, Optional
from uuid import uuid4

from config import JOB_DATABASE_PATH, LOCAL_STATE_DIR
from database_maintenance import check_database_consistency, maintain_database
from database_migrations import initialize_database
from gallery_repository import list_gallery_groups, list_gallery_images
from genealogy_layout_repository import (
    list_genealogy_positions,
    remove_genealogy_positions_for_job,
    update_genealogy_node_positions,
)
from job_gallery_mutations import remove_job_image, remove_selected_job_images
from job_image_index import rebuild_missing_job_image_index, replace_job_image_index
from job_models import JobRecord, job_from_payload, job_to_dict, now_iso_seconds
from job_persistence import JOB_RECORDS_PATH
from job_repository import encode_job_payload, list_jobs_page
from job_status_transitions import (
    append_job_image,
    cancel_job,
    complete_job,
    fail_job,
    retry_job,
    set_job_status,
)
from legacy_job_migration import migrate_legacy_job_records
from output_options import DEFAULT_OUTPUT_PROFILE_ID, DEFAULT_SIZE_OPTION
from provider_compat import DEFAULT_COMPAT_PROFILE_ID
from workflows import DEFAULT_WORKFLOW, normalize_workflow


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
        source_images: Optional[list[dict[str, str]]] = None,
        job_id: Optional[str] = None,
    ) -> JobRecord:
        created_time = now_iso_seconds()
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
            return job_to_dict(job) if job else None

    def list_recent(self, limit: int) -> List[dict]:
        return self.list_page(offset=0, limit=limit)["jobs"]

    def list_all(self) -> List[dict]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT payload FROM jobs ORDER BY updated_at DESC, id DESC"
            ).fetchall()
            return [job_to_dict(job_from_payload(row["payload"])) for row in rows]

    def list_page(self, *, offset: int = 0, limit: int, cursor: str = "") -> dict:
        with self._lock:
            return list_jobs_page(self._connection, offset=offset, limit=limit, cursor=cursor, decode_job=job_from_payload)

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
                decode_job=job_from_payload,
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
            if set_job_status(job, status=status, message=message, updated_at=now_iso_seconds()):
                self._upsert_unlocked(job)

    def append_image(self, job_id: str, image: dict, message: Optional[str] = None) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            append_job_image(job, image=image, message=message, updated_at=now_iso_seconds())
            self._upsert_unlocked(job)

    def complete(self, job_id: str, images: List[dict], warnings: Optional[List[str]] = None) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            complete_job(job, images=images, warnings=warnings, updated_at=now_iso_seconds())
            self._upsert_unlocked(job)

    def cancel(self, job_id: str, images: List[dict], warnings: Optional[List[str]] = None) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            cancel_job(job, images=images, warnings=warnings, updated_at=now_iso_seconds())
            self._upsert_unlocked(job)

    def fail(self, job_id: str, error: str) -> None:
        with self._lock:
            job = self._require_unlocked(job_id)
            fail_job(job, error=error, updated_at=now_iso_seconds())
            self._upsert_unlocked(job)

    def retry(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._get_unlocked(job_id)
            if job is None:
                return None

            retry_job(job, retry_time=now_iso_seconds())
            self._upsert_unlocked(job)
            return job_to_dict(job)

    def remove(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            removed = self._get_unlocked(job_id)
            if removed is not None:
                self._connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
                remove_genealogy_positions_for_job(self._connection, job_id)
                self._connection.commit()
            return removed

    def remove_image(self, job_id: str, slot: int) -> tuple[Optional[dict], Optional[dict], bool]:
        with self._lock:
            result = remove_job_image(
                self._connection,
                job=self._get_unlocked(job_id),
                job_id=job_id,
                slot=slot,
                updated_at=now_iso_seconds(),
                upsert_job=lambda job: self._upsert_unlocked(job, commit=False),
            )
            self._connection.commit()
            return result.as_store_tuple()

    def list_genealogy_positions(self) -> dict[str, dict]:
        with self._lock:
            return list_genealogy_positions(self._connection)

    def update_genealogy_node_positions(self, positions: dict) -> dict[str, dict]:
        with self._lock:
            normalized_positions = update_genealogy_node_positions(
                self._connection,
                positions=positions,
                updated_at=now_iso_seconds(),
                decode_job=job_from_payload,
            )
            self._connection.commit()
            return normalized_positions

    def remove_images(self, selections: list[dict]) -> dict:
        with self._lock:
            result = remove_selected_job_images(
                self._connection,
                selections=selections,
                get_job=self._get_unlocked,
                updated_at=now_iso_seconds(),
                upsert_job=lambda job: self._upsert_unlocked(job, commit=False),
            )
            self._connection.commit()
        return result

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
        recovery_time = now_iso_seconds()
        rows = self._connection.execute(
            "SELECT payload FROM jobs WHERE status IN ('queued', 'running', 'canceling')"
        ).fetchall()
        for row in rows:
            job = job_from_payload(row["payload"])
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
        return job_from_payload(row["payload"])

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
        replace_job_image_index(self._connection, job)

    def _rebuild_missing_image_index_unlocked(self) -> None:
        rebuild_missing_job_image_index(self._connection, decode_job=job_from_payload)
