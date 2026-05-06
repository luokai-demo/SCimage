from __future__ import annotations

from http import HTTPStatus

from api_genealogy import build_genealogy_graph_payload, update_genealogy_node_positions


class GenealogyRouteMixin:
    def _route_get_genealogy_graph(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_genealogy_graph_payload(self.store), HTTPStatus.OK)

    def _route_update_genealogy_node_positions(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            result = update_genealogy_node_positions(self.store, payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except KeyError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self._send_json(result, HTTPStatus.OK)
        self.events.publish_runtime_update("genealogy-positions")
