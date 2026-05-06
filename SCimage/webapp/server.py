from __future__ import annotations

import json
import mimetypes
import multiprocessing
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, urlunsplit

from config import (
    GENERATED_DIR,
    HOST,
    PORT,
    STATIC_DIR,
)
from job_control import JobRegistry
from job_execution import JobExecutionQueue
from job_store import JobStore
from provider_profiles import ProviderProfileStore
from request_parsing import CreateJobRequest, parse_create_job_request
from runtime_events import RuntimeEventHub
from runtime_paths import ensure_runtime_data_dirs
from server_event_routes import EventRouteMixin
from server_gallery_routes import GalleryRouteMixin
from server_genealogy_routes import GenealogyRouteMixin
from server_job_routes import JobRouteMixin
from server_maintenance_routes import MaintenanceRouteMixin
from server_provider_routes import ProviderRouteMixin
from server_routes import API_ROUTES
from server_workspace_routes import WorkspaceRouteMixin
from workspace_state_store import WorkspaceStateStore


STORE = JobStore()
RUNNERS = JobRegistry()
PROVIDER_PROFILES = ProviderProfileStore()
WORKSPACE_STATE = WorkspaceStateStore()


class ScimageHttpServer(ThreadingHTTPServer):
    def __init__(
        self,
        server_address,
        handler_class,
        *,
        store: JobStore,
        runners: JobRegistry,
        provider_profiles: ProviderProfileStore,
        workspace_state: WorkspaceStateStore,
        events: RuntimeEventHub | None = None,
        execution_queue: JobExecutionQueue | None = None,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.store = store
        self.runners = runners
        self.provider_profiles = provider_profiles
        self.workspace_state = workspace_state
        self.events = events or RuntimeEventHub()
        self.execution_queue = execution_queue or JobExecutionQueue(
            store=store,
            runners=runners,
            event_publisher=self.events.publish_runtime_update,
        )


def _safe_path(root: Path, requested: str) -> Path | None:
    candidate = (root / requested.lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


class ImageWorkbenchHandler(
    JobRouteMixin,
    EventRouteMixin,
    GalleryRouteMixin,
    GenealogyRouteMixin,
    ProviderRouteMixin,
    MaintenanceRouteMixin,
    WorkspaceRouteMixin,
    BaseHTTPRequestHandler,
):
    server_version = "SCimage/1.0"

    @property
    def app_server(self) -> ScimageHttpServer:
        return self.server  # type: ignore[return-value]

    @property
    def store(self) -> JobStore:
        return self.app_server.store

    @property
    def provider_profiles(self) -> ProviderProfileStore:
        return self.app_server.provider_profiles

    @property
    def workspace_state(self) -> WorkspaceStateStore:
        return self.app_server.workspace_state

    @property
    def execution_queue(self) -> JobExecutionQueue:
        return self.app_server.execution_queue

    @property
    def events(self) -> RuntimeEventHub:
        return self.app_server.events

    def do_GET(self) -> None:
        self._route_request(method="GET", send_body=True)

    def do_HEAD(self) -> None:
        self._route_request(method="GET", send_body=False)

    def do_POST(self) -> None:
        self._route_api_request("POST")

    def do_PUT(self) -> None:
        self._route_api_request("PUT")

    def do_DELETE(self) -> None:
        self._route_api_request("DELETE")

    def log_message(self, format: str, *args) -> None:
        return

    def _route_request(self, *, method: str, send_body: bool) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._serve_file(STATIC_DIR / "index.html", send_body=send_body)
            return
        if parsed.path.startswith("/api/"):
            self._route_api_request(method, send_body=send_body)
            return
        if parsed.path.startswith("/generated/"):
            relative = parsed.path.removeprefix("/generated/")
            safe_path = _safe_path(GENERATED_DIR, relative)
            if safe_path is None:
                self.send_error(HTTPStatus.FORBIDDEN, "Invalid generated file path.")
                return
            self._serve_file(safe_path, send_body=send_body)
            return

        relative = parsed.path.lstrip("/")
        safe_path = _safe_path(STATIC_DIR, relative)
        if safe_path is None:
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid static file path.")
            return
        self._serve_file(safe_path, send_body=send_body)

    def _route_api_request(self, method: str, *, send_body: bool = True) -> None:
        parsed = urlparse(self.path)
        for route in API_ROUTES:
            if route.method != method:
                continue
            match = route.pattern.match(parsed.path)
            if match is None:
                continue
            kwargs = {key: unquote(value) for key, value in match.groupdict().items()}
            handler = getattr(self, route.handler_name)
            handler(parsed, send_body=send_body, **kwargs)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")

    def _read_json_body(self) -> dict | None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            return json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except json.JSONDecodeError:
            self._send_json({"error": "请求体不是合法 JSON。"}, HTTPStatus.BAD_REQUEST)
            return None

    def _read_create_job_request(self) -> CreateJobRequest | None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            return parse_create_job_request(
                content_type=str(self.headers.get("Content-Type", "")),
                raw_body=raw_body,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return None

    def _serve_file(self, path: Path, send_body: bool = True) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found.")
            return

        mime_type, _ = mimetypes.guess_type(path.name)
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def _send_json(self, payload: dict, status: HTTPStatus) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def prepare_runtime_environment() -> list[Path]:
    ensure_runtime_data_dirs()
    return []


def create_server(*, host: str = HOST, port: int = PORT) -> ScimageHttpServer:
    return ScimageHttpServer(
        (host, port),
        ImageWorkbenchHandler,
        store=STORE,
        runners=RUNNERS,
        provider_profiles=PROVIDER_PROFILES,
        workspace_state=WORKSPACE_STATE,
    )


def serve_server(server: ThreadingHTTPServer) -> None:
    server.serve_forever()


def shutdown_server(server: ThreadingHTTPServer) -> None:
    server.shutdown()
    if isinstance(server, ScimageHttpServer):
        server.execution_queue.shutdown()
        server.events.close()
    server.server_close()


def main() -> None:
    multiprocessing.freeze_support()
    removed_dirs = prepare_runtime_environment()
    server = create_server(host=HOST, port=PORT)
    server_url = urlunsplit(("http", f"{HOST}:{PORT}", "", "", ""))
    print(f"SCimage running at {server_url}")
    if removed_dirs:
        print(f"Cleaned {len(removed_dirs)} empty generated directories on startup.")
    try:
        serve_server(server)
    finally:
        server.execution_queue.shutdown()
        server.events.close()
        server.server_close()


if __name__ == "__main__":
    main()
