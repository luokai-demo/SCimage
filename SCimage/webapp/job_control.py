from __future__ import annotations

from dataclasses import dataclass, field
from threading import Event, Lock
import threading
import os
import signal
import subprocess
from typing import Dict, Optional, Set


def build_subprocess_spawn_kwargs() -> dict[str, object]:
    if os.name == "nt":
        return {
            "creationflags": getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        }
    return {
        "start_new_session": True,
    }


def resolve_process_group_id(process_id: int) -> int | None:
    if os.name == "nt":
        return None
    try:
        return os.getpgid(process_id)
    except OSError:
        return None


def terminate_process_tree(process_id: int, process_group_id: int | None = None) -> None:
    if process_id <= 0:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(process_id)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return

    if process_group_id:
        try:
            os.killpg(process_group_id, signal.SIGTERM)
            return
        except ProcessLookupError:
            return
        except OSError:
            pass

    try:
        os.kill(process_id, signal.SIGTERM)
    except ProcessLookupError:
        return
    except OSError:
        pass


@dataclass
class JobRunner:
    job_id: str
    cancel_event: Event = field(default_factory=Event)
    terminate_event: Event = field(default_factory=Event)
    process_group_ids: Set[int] = field(default_factory=set)
    process_ids: Set[int] = field(default_factory=set)
    lock: Lock = field(default_factory=Lock)

    def register_process(self, process_id: int, process_group_id: int | None = None) -> None:
        with self.lock:
            self.process_ids.add(process_id)
            if process_group_id:
                self.process_group_ids.add(process_group_id)
            should_terminate = self.cancel_event.is_set()
        if should_terminate:
            terminate_process_tree(process_id, process_group_id or resolve_process_group_id(process_id))

    def unregister_process(self, process_id: int, process_group_id: int | None = None) -> None:
        with self.lock:
            self.process_ids.discard(process_id)
            if process_group_id:
                self.process_group_ids.discard(process_group_id)

    def request_cancel(self) -> None:
        self.cancel_event.set()
        if self.terminate_event.is_set():
            return
        self.terminate_event.set()
        threading.Thread(
            target=self.terminate_active_processes,
            name=f"scimage-cancel-{self.job_id}",
            daemon=True,
        ).start()

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
            terminate_process_tree(process_id, resolve_process_group_id(process_id))


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
