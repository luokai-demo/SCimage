from __future__ import annotations

from pathlib import Path
import sys
import threading
import unittest
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from server import create_server, serve_server, shutdown_server


class ServerLifecycleTests(unittest.TestCase):
    def test_server_can_start_serve_requests_and_shutdown(self) -> None:
        server = create_server(host="127.0.0.1", port=0)
        thread = threading.Thread(target=serve_server, args=(server,), daemon=True)
        thread.start()

        try:
            port = server.server_address[1]
            with urlopen(f"http://127.0.0.1:{port}/api/jobs", timeout=2) as response:
                self.assertEqual(response.status, 200)
        finally:
            shutdown_server(server)
            thread.join(timeout=3)

        self.assertFalse(thread.is_alive())

    def test_events_endpoint_streams_runtime_updates(self) -> None:
        server = create_server(host="127.0.0.1", port=0)
        thread = threading.Thread(target=serve_server, args=(server,), daemon=True)
        thread.start()

        try:
            port = server.server_address[1]
            request = Request(f"http://127.0.0.1:{port}/api/events", headers={"Accept": "text/event-stream"})
            with urlopen(request, timeout=3) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get_content_type(), "text/event-stream")
                self.assertIn(b"connected", response.readline() + response.readline())
                server.events.publish_runtime_update("test-event")
                lines = []
                for _ in range(4):
                    lines.append(response.readline())
                    if any(b"test-event" in line for line in lines):
                        break
                body = b"".join(lines)
                self.assertIn(b"event: runtime-update", body)
                self.assertIn(b"test-event", body)
        finally:
            shutdown_server(server)
            thread.join(timeout=3)

        self.assertFalse(thread.is_alive())


if __name__ == "__main__":
    unittest.main()
