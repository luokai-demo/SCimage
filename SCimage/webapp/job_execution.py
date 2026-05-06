from __future__ import annotations

from dataclasses import dataclass
from queue import Empty, Queue
from threading import Event, Lock, Thread
from typing import Callable, Protocol

from generated_assets import cleanup_empty_job_output_dir
from image_service import GenerationResult, generate_images
from job_control import JobRegistry, JobRunner
from job_models import JobRecord
from job_store import JobStore
from provider_profiles import ProviderProfile


TERMINAL_JOB_STATUSES = {"completed", "partial", "failed", "canceled"}


@dataclass(frozen=True)
class JobExecutionRequest:
    job_id: str
    workflow: str
    prompt: str
    count: int
    quality: str
    size: str
    source_images: list[dict]
    provider_profile: ProviderProfile


class ImageGenerator(Protocol):
    def __call__(
        self,
        *,
        job_id: str,
        workflow: str,
        prompt: str,
        count: int,
        quality: str,
        size: str,
        source_images: list[dict],
        provider_profile: ProviderProfile,
        status_callback: Callable[[str], None],
        image_callback: Callable[[dict, int, int], None],
        cancel_event: Event,
        runner: JobRunner,
    ) -> GenerationResult:
        ...


class JobExecutionQueue:
    def __init__(
        self,
        *,
        store: JobStore,
        runners: JobRegistry,
        image_generator: ImageGenerator = generate_images,
        event_publisher: Callable[[str], None] | None = None,
    ) -> None:
        self._store = store
        self._runners = runners
        self._image_generator = image_generator
        self._event_publisher = event_publisher
        self._queue: Queue[JobExecutionRequest | None] = Queue()
        self._worker = Thread(target=self._run_loop, name="scimage-job-executor", daemon=True)
        self._stopped = Event()
        self._state_lock = Lock()
        self._running_job_id: str | None = None
        self._pending_job_ids: list[str] = []
        self._worker.start()

    def enqueue(self, request: JobExecutionRequest) -> None:
        runner = self._runners.create(request.job_id)
        if runner.cancel_event.is_set():
            self._store.cancel(request.job_id, [])
            return
        with self._state_lock:
            self._pending_job_ids.append(request.job_id)
        self._queue.put(request)
        self._publish_update("job-queued")

    def cancel(self, job_id: str) -> bool:
        canceled = self._runners.request_cancel(job_id)
        if canceled:
            with self._state_lock:
                self._pending_job_ids = [pending_id for pending_id in self._pending_job_ids if pending_id != job_id]
            self._publish_update("job-cancel-requested")
        return canceled

    def is_running(self, job_id: str) -> bool:
        return self._runners.get(job_id) is not None

    def snapshot(self) -> dict:
        with self._state_lock:
            running = [self._running_job_id] if self._running_job_id else []
            pending = list(self._pending_job_ids)
        return {
            "running": running,
            "pending": pending,
            "running_count": len(running),
            "pending_count": len(pending),
        }

    def shutdown(self) -> None:
        self._stopped.set()
        self._runners.request_cancel_all()
        self._queue.put(None)
        self._worker.join(timeout=3)

    def _run_loop(self) -> None:
        while not self._stopped.is_set():
            try:
                request = self._queue.get(timeout=0.2)
            except Empty:
                continue
            if request is None:
                self._queue.task_done()
                break
            try:
                self._execute(request)
            finally:
                self._queue.task_done()

    def _execute(self, request: JobExecutionRequest) -> None:
        runner = self._runners.get(request.job_id)
        if runner is None:
            self._store.cancel(request.job_id, [])
            self._remove_pending(request.job_id)
            self._publish_update("job-canceled")
            return

        if runner.cancel_event.is_set():
            self._cancel_without_execution(request.job_id)
            return

        self._mark_running(request.job_id)

        try:
            def report(message: str) -> None:
                self._store.update_status(request.job_id, "running", message)
                self._publish_update("job-status")

            def report_image(image: dict, completed_count: int, total_count: int) -> None:
                self._store.append_image(
                    request.job_id,
                    image,
                    message=f"接口已返回，已保存 {completed_count}/{total_count} 张图片。",
                )
                self._publish_update("job-image")

            report(f"任务已进入执行队列，准备生成 {request.count} 张图片。")
            try:
                result = self._image_generator(
                    job_id=request.job_id,
                    workflow=request.workflow,
                    prompt=request.prompt,
                    count=request.count,
                    quality=request.quality,
                    size=request.size,
                    source_images=request.source_images,
                    provider_profile=request.provider_profile,
                    status_callback=report,
                    image_callback=report_image,
                    cancel_event=runner.cancel_event,
                    runner=runner,
                )
            except Exception as exc:
                if runner.cancel_event.is_set():
                    snapshot = self._store.snapshot(request.job_id) or {}
                    self._store.cancel(
                        request.job_id,
                        snapshot.get("images", []),
                        warnings=[str(exc)] if str(exc) else [],
                    )
                else:
                    self._store.fail(request.job_id, str(exc))
                self._publish_update("job-finished")
            else:
                self._finalize(request.job_id, result)
                self._publish_update("job-finished")
        finally:
            self._clear_running(request.job_id)
            cleanup_empty_job_output_dir(request.job_id)
            self._runners.finish(request.job_id)

    def _finalize(self, job_id: str, result: GenerationResult) -> None:
        if result.cancelled:
            self._store.cancel(job_id, result.images, warnings=result.errors)
        else:
            self._store.complete(job_id, result.images, warnings=result.errors)

    def _cancel_without_execution(self, job_id: str) -> None:
        snapshot = self._store.snapshot(job_id) or {}
        self._store.cancel(job_id, snapshot.get("images", []))
        self._remove_pending(job_id)
        cleanup_empty_job_output_dir(job_id)
        self._runners.finish(job_id)
        self._publish_update("job-canceled")

    def _remove_pending(self, job_id: str) -> None:
        with self._state_lock:
            self._pending_job_ids = [pending_id for pending_id in self._pending_job_ids if pending_id != job_id]

    def _mark_running(self, job_id: str) -> None:
        with self._state_lock:
            self._pending_job_ids = [pending_id for pending_id in self._pending_job_ids if pending_id != job_id]
            self._running_job_id = job_id

    def _clear_running(self, job_id: str) -> None:
        with self._state_lock:
            if self._running_job_id == job_id:
                self._running_job_id = None

    def _publish_update(self, reason: str) -> None:
        if self._event_publisher is None:
            return
        self._event_publisher(reason)
