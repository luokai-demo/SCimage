from __future__ import annotations

import threading
import unittest


def wait_for_job_status(
    test_case: unittest.TestCase,
    store,
    job_id: str,
    status: str,
    *,
    attempts: int = 40,
    interval: float = 0.05,
) -> None:
    delay = threading.Event()
    for _ in range(attempts):
        snapshot = store.snapshot(job_id)
        if snapshot and snapshot["status"] == status:
            return
        delay.wait(interval)
    test_case.fail(f"{job_id} did not reach {status}: {store.snapshot(job_id)}")
