from __future__ import annotations

from http import HTTPStatus

from runtime_events import format_sse_event


class EventRouteMixin:
    def _route_get_events(self, parsed, *, send_body: bool) -> None:
        if not send_body:
            self._send_json({"ok": True}, HTTPStatus.OK)
            return
        self._serve_events()

    def _serve_events(self) -> None:
        subscription = self.events.subscribe()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            for event in subscription.listen():
                chunk = b": heartbeat\n\n" if event is None else format_sse_event(event)
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            return
        finally:
            subscription.close()
