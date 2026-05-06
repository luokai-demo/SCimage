from __future__ import annotations

from http import HTTPStatus

from api_provider_profiles import (
    create_provider_profile_payload,
    list_provider_models_payload,
    update_provider_profile_payload,
)


class ProviderRouteMixin:
    def _route_get_provider_profiles(self, parsed, *, send_body: bool) -> None:
        self._send_json(self.provider_profiles.get_state(), HTTPStatus.OK)

    def _route_create_provider_profile(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            state = create_provider_profile_payload(self.provider_profiles, payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return
        self.events.publish_runtime_update("provider-profile-created")
        self._send_json(state, HTTPStatus.CREATED)

    def _route_update_provider_profile(self, parsed, *, send_body: bool, profile_id: str) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            state = update_provider_profile_payload(self.provider_profiles, profile_id, payload)
        except KeyError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return
        self.events.publish_runtime_update("provider-profile-updated")
        self._send_json(state, HTTPStatus.OK)

    def _route_list_provider_models(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return

        try:
            result = list_provider_models_payload(self.provider_profiles, payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return

        self._send_json(result, HTTPStatus.OK)

    def _route_activate_provider_profile(self, parsed, *, send_body: bool, profile_id: str) -> None:
        try:
            state = self.provider_profiles.activate_profile(profile_id)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self.events.publish_runtime_update("provider-profile-activated")
        self._send_json(state, HTTPStatus.OK)

    def _route_delete_provider_profile(self, parsed, *, send_body: bool, profile_id: str) -> None:
        try:
            state = self.provider_profiles.delete_profile(profile_id)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self.events.publish_runtime_update("provider-profile-deleted")
        self._send_json(state, HTTPStatus.OK)
