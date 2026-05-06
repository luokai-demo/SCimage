from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"

if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import job_store  # noqa: E402
from provider_profiles import ProviderProfileStore  # noqa: E402
import server as server_module  # noqa: E402
from server import create_server, serve_server, shutdown_server  # noqa: E402
from workspace_state_store import WorkspaceStateStore  # noqa: E402


class ApiRouteIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_path = Path(self.temp_dir.name)
        self.original_store = server_module.STORE
        self.original_profiles = server_module.PROVIDER_PROFILES
        self.original_workspace_state = server_module.WORKSPACE_STATE

        with patch.object(job_store, "JOB_RECORDS_PATH", self.temp_path / "missing-job-records.json"):
            self.store = job_store.JobStore(self.temp_path / "jobs.db")
        self.addCleanup(self.store.close)
        server_module.STORE = self.store
        server_module.PROVIDER_PROFILES = ProviderProfileStore(self.temp_path / "provider-profiles.json")
        server_module.WORKSPACE_STATE = WorkspaceStateStore(self.temp_path / "workspace-state.json")
        self.addCleanup(self.restore_server_globals)

        self.server = create_server(host="127.0.0.1", port=0)
        self.thread = threading.Thread(target=serve_server, args=(self.server,), daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def restore_server_globals(self) -> None:
        server_module.STORE = self.original_store
        server_module.PROVIDER_PROFILES = self.original_profiles
        server_module.WORKSPACE_STATE = self.original_workspace_state

    def stop_server(self) -> None:
        shutdown_server(self.server)
        self.thread.join(timeout=3)

    def test_jobs_gallery_genealogy_and_position_routes(self) -> None:
        root = self.store.create(
            prompt="接口根图",
            count=1,
            quality="auto",
            workflow="generate",
            job_id="api-root",
        )
        self.store.append_image(
            root.id,
            {"slot": 1, "name": "root.png", "url": "/generated/api-root/root.png"},
        )
        child = self.store.create(
            prompt="接口子图",
            count=1,
            quality="auto",
            workflow="image-to-image",
            job_id="api-child",
            source_images=[
                {
                    "slot": 1,
                    "name": "source.png",
                    "url": "/generated/api-child/source-images/source.png",
                    "origin": {
                        "job_id": "api-root",
                        "slot": 1,
                        "url": "/generated/api-root/root.png",
                    },
                }
            ],
        )
        self.store.append_image(
            child.id,
            {"slot": 1, "name": "child.png", "url": "/generated/api-child/child.png"},
        )

        jobs = self.request_json("GET", "/api/jobs")
        gallery = self.request_json("GET", "/api/gallery/images")
        graph = self.request_json("GET", "/api/genealogy/graph")
        positions = self.request_json(
            "POST",
            "/api/genealogy/nodes/positions",
            {"positions": {"api-child:1": {"x": 248.8, "y": 144.2}}},
        )
        graph_after_save = self.request_json("GET", "/api/genealogy/graph")

        self.assertEqual(jobs["total"], 2)
        self.assertEqual(gallery["total"], 2)
        self.assertIn(
            {"from": "api-root:1", "to": "api-child:1", "job_id": "api-child"},
            graph["edges"],
        )
        self.assertEqual(positions["positions"]["api-child:1"], {"x": 249, "y": 144})
        self.assertEqual(graph_after_save["positions"]["api-child:1"], {"x": 249, "y": 144})

    def test_provider_model_route_uses_saved_source_profile_key(self) -> None:
        state = server_module.PROVIDER_PROFILES.create_profile(
            name="接口配置",
            base_url="https://example.test/v1",
            model="gpt-image-test",
            api_key="secret-key",
        )

        with patch("provider_model_catalog.urlopen") as mock_urlopen:
            mock_urlopen.return_value = FakeResponse(
                b'{"data":[{"id":"gpt-image-test"},{"id":"text-model"}]}'
            )
            payload = self.request_json(
                "POST",
                "/api/provider-profiles/models",
                {
                    "base_url": "https://example.test",
                    "api_key": "",
                    "source_profile_id": state["active_profile_id"],
                },
            )

        self.assertEqual(payload["normalized_base_url"], "https://example.test/v1")
        self.assertEqual(
            payload["models"],
            [
                {"id": "gpt-image-test", "category": "image"},
                {"id": "text-model", "category": "other"},
            ],
        )
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.test/v1/models")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-key")

    def test_unknown_api_route_returns_json_404(self) -> None:
        with self.assertRaises(HTTPError) as context:
            self.request_json("GET", "/api/not-found")

        self.assertEqual(context.exception.code, 404)

    def request_json(self, method: str, path: str, payload: dict | None = None) -> dict:
        url = f"http://127.0.0.1:{self.server.server_address[1]}{path}"
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            url,
            data=body,
            method=method,
            headers={"Content-Type": "application/json"} if body is not None else {},
        )
        with urlopen(request, timeout=3) as response:
            self.assertIn(response.status, {200, 201, 202})
            return json.loads(response.read().decode("utf-8"))


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def read(self) -> bytes:
        return self.body

    def close(self) -> None:
        pass


if __name__ == "__main__":
    unittest.main()
