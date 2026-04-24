from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from threading import Lock
from typing import Dict, List, Optional
from uuid import uuid4

from job_persistence import load_job_records, save_job_records


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass
class JobRecord:
    id: str
    prompt: str
    count: int
    quality: str
    size: str = "auto"
    status: str = "queued"
    message: str = "任务已创建，等待生成。"
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    images: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: Dict[str, JobRecord] = {
            job_id: JobRecord(**payload)
            for job_id, payload in load_job_records().items()
        }
        self._lock = Lock()
        self._recover_incomplete_jobs()
        if self._jobs:
            save_job_records(self._jobs)

    def create(self, prompt: str, count: int, quality: str, size: str = "auto") -> JobRecord:
        job = JobRecord(
            id=uuid4().hex[:12],
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
        )
        with self._lock:
            self._jobs[job.id] = job
            self._persist_unlocked()
        return job

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def snapshot(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._jobs.get(job_id)
            return asdict(job) if job else None

    def list_recent(self, limit: int) -> List[dict]:
        with self._lock:
            jobs = sorted(self._jobs.values(), key=lambda job: job.created_at, reverse=True)
            return [asdict(job) for job in jobs[:limit]]

    def update_status(self, job_id: str, status: str, message: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = status
            job.message = message
            job.updated_at = _now()
            self._persist_unlocked()

    def append_image(self, job_id: str, image: Dict[str, str], message: Optional[str] = None) -> None:
        with self._lock:
            job = self._jobs[job_id]
            remaining = [item for item in job.images if item.get("slot") != image.get("slot")]
            remaining.append(image)
            job.images = sorted(remaining, key=lambda item: item.get("slot", 0))
            if message:
                job.message = message
            job.updated_at = _now()
            self._persist_unlocked()

    def complete(self, job_id: str, images: List[Dict[str, str]], warnings: Optional[List[str]] = None) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.images = sorted(images, key=lambda item: item.get("slot", 0))
            job.warnings = warnings or []
            if job.warnings:
                job.status = "partial"
                job.message = f"已生成 {len(job.images)}/{job.count} 张图片，失败 {len(job.warnings)} 张。"
            else:
                job.status = "completed"
                job.message = f"图片已生成完成，共 {len(job.images)} 张。"
            job.updated_at = _now()
            self._persist_unlocked()

    def cancel(self, job_id: str, images: List[Dict[str, str]], warnings: Optional[List[str]] = None) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "canceled"
            job.images = sorted(images, key=lambda item: item.get("slot", 0))
            job.warnings = warnings or []
            if job.images:
                job.message = f"任务已中断，已保留 {len(job.images)}/{job.count} 张图片。"
            else:
                job.message = "任务已中断，当前没有可保留的图片。"
            job.updated_at = _now()
            self._persist_unlocked()

    def fail(self, job_id: str, error: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "failed"
            job.message = "生成失败。"
            job.error = error
            job.updated_at = _now()
            self._persist_unlocked()

    def retry(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None

            retry_time = _now()
            job.status = "queued"
            job.message = "任务已重试，等待生成。"
            job.images = []
            job.warnings = []
            job.error = None
            job.created_at = retry_time
            job.updated_at = retry_time
            self._persist_unlocked()
            return asdict(job)

    def remove(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            removed = self._jobs.pop(job_id, None)
            self._persist_unlocked()
            return removed

    def remove_image(self, job_id: str, slot: int) -> tuple[Optional[dict], Optional[Dict[str, str]], bool]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None, None, False

            remaining: List[Dict[str, str]] = []
            removed_image: Optional[Dict[str, str]] = None
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
                self._jobs.pop(job_id, None)
                self._persist_unlocked()
                return None, removed_image, True

            job.message = f"已删除 1 张图片，当前保留 {len(job.images)} 张。"
            job.updated_at = _now()
            self._persist_unlocked()
            return asdict(job), removed_image, False

    def _persist_unlocked(self) -> None:
        save_job_records(self._jobs)

    def _recover_incomplete_jobs(self) -> None:
        recoverable_statuses = {"queued", "running", "canceling"}
        recovery_time = _now()
        for job in self._jobs.values():
            if job.status not in recoverable_statuses:
                continue
            job.status = "canceled"
            if job.images:
                job.message = f"本地后端已重启，任务已停止，已保留 {len(job.images)}/{job.count} 张图片。"
            else:
                job.message = "本地后端已重启，任务已停止。"
            job.updated_at = recovery_time
