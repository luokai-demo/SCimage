from __future__ import annotations

from http import HTTPStatus
from urllib.parse import parse_qs

from api_maintenance import cleanup_empty_generated_dirs_payload


class MaintenanceRouteMixin:
    def _route_get_maintenance_database(self, parsed, *, send_body: bool) -> None:
        self._send_json(self.store.maintain_database(vacuum=False), HTTPStatus.OK)

    def _route_get_maintenance_database_check(self, parsed, *, send_body: bool) -> None:
        query = parse_qs(parsed.query)
        check_files = str((query.get("files") or ["0"])[0]).strip().lower() in {"1", "true", "yes"}
        self._send_json(self.store.check_database(check_files=check_files), HTTPStatus.OK)

    def _route_cleanup_empty_generated_dirs(self, parsed, *, send_body: bool) -> None:
        self._send_json(cleanup_empty_generated_dirs_payload(), HTTPStatus.OK)
        self.events.publish_runtime_update("generated-cleanup")

    def _route_maintain_database(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        self._send_json(self.store.maintain_database(vacuum=bool(payload.get("vacuum"))), HTTPStatus.OK)
