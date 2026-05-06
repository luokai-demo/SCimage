from __future__ import annotations

from http import HTTPStatus


class WorkspaceRouteMixin:
    def _route_get_workspace_state(self, parsed, *, send_body: bool) -> None:
        self._send_json(self.workspace_state.get_state(), HTTPStatus.OK)

    def _route_replace_workspace_state(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        self._send_json(self.workspace_state.replace_state(payload), HTTPStatus.OK)
