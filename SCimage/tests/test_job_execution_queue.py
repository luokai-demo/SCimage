from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import threading
import unittest
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = PROJECT_ROOT / "tests"
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import job_store  # noqa: E402
from image_service import GenerationResult  # noqa: E402
from job_control import JobRegistry  # noqa: E402
from job_execution import JobExecutionQueue, JobExecutionRequest  # noqa: E402
from provider_profiles import ProviderProfile  # noqa: E402
from test_helpers import wait_for_job_status  # noqa: E402


class JobExecutionQueueTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_path = Path(self.temp_dir.name)
        with patch.object(job_store, "JOB_RECORDS_PATH", self.temp_path / "missing-job-records.json"):
            self.store = job_store.JobStore(self.temp_path / "jobs.db")
        self.addCleanup(self.store.close)
        self.runners = JobRegistry()

    def test_queue_executes_one_job_at_a_time(self) -> None:
        first_started = threading.Event()
        release_first = threading.Event()
        first_finished = threading.Event()

        def generator(**kwargs):
            if kwargs["job_id"] == "first":
                first_started.set()
                release_first.wait(timeout=2)
                first_finished.set()
            else:
                self.assertTrue(first_finished.is_set())
            return GenerationResult(images=[], errors=[])

        queue = JobExecutionQueue(
            store=self.store,
            runners=self.runners,
            image_generator=generator,
        )
        self.addCleanup(queue.shutdown)
        self.create_job("first")
        self.create_job("second")

        queue.enqueue(self.request("first"))
        queue.enqueue(self.request("second"))

        self.assertTrue(first_started.wait(timeout=2))
        self.assertEqual(self.store.snapshot("second")["status"], "queued")
        self.assertEqual(queue.snapshot(), {
            "running": ["first"],
            "pending": ["second"],
            "running_count": 1,
            "pending_count": 1,
        })

        release_first.set()
        self.wait_for_status("second", "completed")
        self.assertEqual(queue.snapshot()["running_count"], 0)
        self.assertEqual(queue.snapshot()["pending_count"], 0)

    def test_cancel_queued_job_prevents_execution(self) -> None:
        started_jobs: list[str] = []
        release_first = threading.Event()

        def generator(**kwargs):
            started_jobs.append(kwargs["job_id"])
            if kwargs["job_id"] == "first":
                release_first.wait(timeout=2)
            return GenerationResult(images=[], errors=[])

        queue = JobExecutionQueue(
            store=self.store,
            runners=self.runners,
            image_generator=generator,
        )
        self.addCleanup(queue.shutdown)
        self.create_job("first")
        self.create_job("second")

        queue.enqueue(self.request("first"))
        queue.enqueue(self.request("second"))
        self.wait_for_status("first", "running")

        self.store.cancel("second", [])
        self.assertTrue(queue.cancel("second"))
        release_first.set()
        self.wait_for_status("second", "canceled")

        self.assertEqual(started_jobs, ["first"])

    def test_canceled_queued_job_never_enters_running_snapshot(self) -> None:
        started_jobs: list[str] = []
        release_first = threading.Event()

        def generator(**kwargs):
            started_jobs.append(kwargs["job_id"])
            if kwargs["job_id"] == "first":
                release_first.wait(timeout=2)
            return GenerationResult(images=[], errors=[])

        queue = JobExecutionQueue(
            store=self.store,
            runners=self.runners,
            image_generator=generator,
        )
        self.addCleanup(queue.shutdown)
        self.create_job("first")
        self.create_job("second")

        queue.enqueue(self.request("first"))
        queue.enqueue(self.request("second"))
        self.wait_for_status("first", "running")
        self.store.cancel("second", [])
        self.assertTrue(queue.cancel("second"))

        release_first.set()
        self.wait_for_status("second", "canceled")

        self.assertEqual(started_jobs, ["first"])
        self.assertNotIn("second", queue.snapshot()["running"])
        self.assertNotIn("second", queue.snapshot()["pending"])

    def create_job(self, job_id: str) -> None:
        self.store.create(
            prompt=f"{job_id} prompt",
            count=1,
            quality="auto",
            workflow="generate",
            job_id=job_id,
        )

    def request(self, job_id: str) -> JobExecutionRequest:
        return JobExecutionRequest(
            job_id=job_id,
            workflow="generate",
            prompt=f"{job_id} prompt",
            count=1,
            quality="auto",
            size="auto",
            source_images=[],
            provider_profile=ProviderProfile(
                id="profile",
                name="Profile",
                base_url="https://example.com/v1",
                api_key="secret",
                model="image-model",
            ),
        )

    def wait_for_status(self, job_id: str, status: str) -> None:
        wait_for_job_status(self, self.store, job_id, status)


if __name__ == "__main__":
    unittest.main()
