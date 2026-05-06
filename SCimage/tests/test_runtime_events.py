from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from runtime_events import RuntimeEventHub, format_sse_event


class RuntimeEventHubTests(unittest.TestCase):
    def test_slow_subscription_keeps_bounded_latest_events(self) -> None:
        hub = RuntimeEventHub(max_pending_per_subscriber=2)
        subscription = hub.subscribe()
        self.addCleanup(subscription.close)

        hub.publish_runtime_update("first")
        hub.publish_runtime_update("second")
        hub.publish_runtime_update("third")

        events = []
        listener = subscription.listen(heartbeat_interval=0.01)
        for _ in range(2):
            events.append(next(listener))

        self.assertEqual([event.payload["reason"] for event in events], ["second", "third"])

    def test_sse_event_uses_named_event_and_json_payload(self) -> None:
        hub = RuntimeEventHub()
        subscription = hub.subscribe()
        self.addCleanup(subscription.close)

        hub.publish_runtime_update("unit-test")
        event = next(subscription.listen(heartbeat_interval=0.01))

        encoded = format_sse_event(event)
        self.assertIn(b"event: runtime-update", encoded)
        self.assertIn(b'"reason":"unit-test"', encoded)

    def test_subscription_close_drops_pending_events_before_sentinel(self) -> None:
        hub = RuntimeEventHub(max_pending_per_subscriber=1)
        subscription = hub.subscribe()

        hub.publish_runtime_update("queued")
        subscription.close()

        self.assertEqual(list(subscription.listen(heartbeat_interval=0.01)), [])


if __name__ == "__main__":
    unittest.main()
