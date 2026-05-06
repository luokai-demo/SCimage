from __future__ import annotations

from http import HTTPStatus
from urllib.parse import parse_qs

from api_gallery import batch_delete_images, batch_download_images_archive
from api_pagination import build_gallery_groups_payload, build_gallery_images_payload


class GalleryRouteMixin:
    def _route_get_gallery_images(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_gallery_images_payload(self.store, parse_qs(parsed.query)), HTTPStatus.OK)

    def _route_get_gallery_groups(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_gallery_groups_payload(self.store, parse_qs(parsed.query)), HTTPStatus.OK)

    def _route_batch_delete_images(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            result = batch_delete_images(self.store, payload.get("items", []))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self.events.publish_runtime_update("gallery-batch-delete")
        self._send_json(result, HTTPStatus.OK)

    def _route_batch_download_images(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            body = batch_download_images_archive(self.store, payload.get("items", []))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except FileNotFoundError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", 'attachment; filename="SCimage-selected-images.zip"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
