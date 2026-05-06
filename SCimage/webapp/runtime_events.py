from __future__ import annotations

import json
from dataclasses import dataclass
from queue import Empty, Full, Queue
from threading import Lock
from time import time
from typing import Iterator


@dataclass(frozen=True)
class RuntimeEvent:
    name: str
    payload: dict


class RuntimeEventSubscription:
    def __init__(self, hub: "RuntimeEventHub", *, max_pending: int) -> None:
        self._hub = hub
        self._queue: Queue[RuntimeEvent | None] = Queue(maxsize=max_pending)
        self._closed = False

    def push(self, event: RuntimeEvent | None) -> None:
        if event is None:
            self._drop_pending_events()
            self._queue.put(None)
            return
        try:
            self._queue.put_nowait(event)
        except Full:
            self._drop_oldest_event()
            self._queue.put_nowait(event)

    def listen(self, *, heartbeat_interval: float = 15.0) -> Iterator[RuntimeEvent | None]:
        while not self._closed:
            try:
                event = self._queue.get(timeout=heartbeat_interval)
            except Empty:
                yield None
                continue
            if event is None:
                break
            yield event

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._hub.unsubscribe(self)
        self.push(None)

    def _drop_oldest_event(self) -> None:
        try:
            self._queue.get_nowait()
        except Empty:
            return

    def _drop_pending_events(self) -> None:
        while True:
            try:
                self._queue.get_nowait()
            except Empty:
                return


class RuntimeEventHub:
    def __init__(self, *, max_pending_per_subscriber: int = 64) -> None:
        self._subscribers: set[RuntimeEventSubscription] = set()
        self._lock = Lock()
        self._closed = False
        self._max_pending_per_subscriber = max(1, max_pending_per_subscriber)

    def subscribe(self) -> RuntimeEventSubscription:
        subscription = RuntimeEventSubscription(self, max_pending=self._max_pending_per_subscriber)
        with self._lock:
            if self._closed:
                subscription.push(None)
                return subscription
            self._subscribers.add(subscription)
        return subscription

    def unsubscribe(self, subscription: RuntimeEventSubscription) -> None:
        with self._lock:
            self._subscribers.discard(subscription)

    def publish_runtime_update(self, reason: str = "runtime-update") -> None:
        self.publish("runtime-update", {"reason": reason, "sent_at": time()})

    def publish(self, name: str, payload: dict) -> None:
        event = RuntimeEvent(name=name, payload=payload)
        with self._lock:
            subscribers = list(self._subscribers)
        for subscription in subscribers:
            subscription.push(event)

    def close(self) -> None:
        with self._lock:
            self._closed = True
            subscribers = list(self._subscribers)
            self._subscribers.clear()
        for subscription in subscribers:
            subscription.push(None)


def format_sse_event(event: RuntimeEvent) -> bytes:
    payload = json.dumps(event.payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.name}\ndata: {payload}\n\n".encode("utf-8")
