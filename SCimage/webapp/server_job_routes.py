from __future__ import annotations

from http import HTTPStatus
from urllib.parse import parse_qs

from api_gallery import remove_image_assets
from api_jobs import (
    cancel_job_payload,
    create_job_payload,
    delete_job_payload,
    get_job_status_payload,
    retry_job_payload,
)
from api_pagination import build_jobs_page_payload
from config import MAX_IMAGE_COUNT
from job_execution import TERMINAL_JOB_STATUSES


class JobRouteMixin:
    def _route_get_jobs(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_jobs_page_payload(self.store, parse_qs(parsed.query)), HTTPStatus.OK)

    def _route_get_queue(self, parsed, *, send_body: bool) -> None:
        self._send_json(self.execution_queue.snapshot(), HTTPStatus.OK)

    def _route_get_job_status(self, parsed, *, send_body: bool, job_id: str) -> None:
        result = get_job_status_payload(self.store, job_id)
        self._send_json(result.payload, result.status)

    def _route_create_job(self, parsed, *, send_body: bool) -> None:
        request = self._read_create_job_request()
        if request is None:
            return
        result = create_job_payload(
            store=self.store,
            provider_profiles=self.provider_profiles,
            execution_queue=self.execution_queue,
            request=request,
            max_image_count=MAX_IMAGE_COUNT,
        )
        self._send_json(result.payload, result.status)

    def _route_retry_job(self, parsed, *, send_body: bool, job_id: str) -> None:
        result = retry_job_payload(
            store=self.store,
            provider_profiles=self.provider_profiles,
            execution_queue=self.execution_queue,
            job_id=job_id,
        )
        self._send_json(result.payload, result.status)

    def _route_cancel_job(self, parsed, *, send_body: bool, job_id: str) -> None:
        result = cancel_job_payload(store=self.store, execution_queue=self.execution_queue, job_id=job_id)
        self._send_json(result.payload, result.status)

    def _route_delete_job(self, parsed, *, send_body: bool, job_id: str) -> None:
        result = delete_job_payload(self.store, job_id)
        self._send_json(result.payload, result.status)

    def _route_delete_job_image(self, parsed, *, send_body: bool, job_id: str, slot: str) -> None:
        snapshot = self.store.snapshot(job_id)
        if not snapshot:
            self._send_json({"error": "任务不存在。"}, HTTPStatus.NOT_FOUND)
            return
        if snapshot["status"] not in TERMINAL_JOB_STATUSES:
            self._send_json({"error": "运行中的任务不能删除单张图片，请先中断任务。"}, HTTPStatus.CONFLICT)
            return

        next_snapshot, removed_image, deleted_job = self.store.remove_image(job_id, int(slot))
        if removed_image is None:
            self._send_json({"error": "图片不存在。"}, HTTPStatus.NOT_FOUND)
            return

        remove_image_assets(job_id, removed_image, deleted_job=deleted_job)
        self.events.publish_runtime_update("job-image-deleted")
        self._send_json(
            {
                "ok": True,
                "deleted_job": deleted_job,
                "job": next_snapshot,
                "removed_image": removed_image,
            },
            HTTPStatus.OK,
        )
