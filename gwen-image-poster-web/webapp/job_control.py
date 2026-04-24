from __future__ import annotations

from dataclasses import dataclass, field
from threading import Event, Lock
import os
import signal
from typing import Dict, Optional, Set


@dataclass
class JobRunner:
    job_id: str
    cancel_event: Event = field(default_factory=Event)
    process_group_ids: Set[int] = field(default_factory=set)
    process_ids: Set[int] = field(default_factory=set)
    lock: Lock = field(default_factory=Lock)

    def register_process(self, process_id: int, process_group_id: int | None = None) -> None:
        with self.lock:
            self.process_ids.add(process_id)
            if process_group_id:
                self.process_group_ids.add(process_group_id)

    def unregister_process(self, process_id: int, process_group_id: int | None = None) -> None:
        with self.lock:
            self.process_ids.discard(process_id)
            if process_group_id:
                self.process_group_ids.discard(process_group_id)

    def request_cancel(self) -> None:
        self.cancel_event.set()
        self.terminate_active_processes()

    def terminate_active_processes(self) -> None:
        with self.lock:
            group_ids = list(self.process_group_ids)
            process_ids = list(self.process_ids)

        for group_id in group_ids:
            try:
                os.killpg(group_id, signal.SIGTERM)
            except ProcessLookupError:
                continue
            except OSError:
                continue

        for process_id in process_ids:
            try:
                os.kill(process_id, signal.SIGTERM)
            except ProcessLookupError:
                continue
            except OSError:
                continue


class JobRegistry:
    def __init__(self) -> None:
        self._runners: Dict[str, JobRunner] = {}
        self._lock = Lock()

    def create(self, job_id: str) -> JobRunner:
        runner = JobRunner(job_id=job_id)
        with self._lock:
            self._runners[job_id] = runner
        return runner

    def get(self, job_id: str) -> Optional[JobRunner]:
        with self._lock:
            return self._runners.get(job_id)

    def request_cancel(self, job_id: str) -> bool:
        with self._lock:
            runner = self._runners.get(job_id)
            if not runner:
                return False
        runner.request_cancel()
        return True

    def finish(self, job_id: str) -> None:
        with self._lock:
            self._runners.pop(job_id, None)
