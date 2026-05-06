from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
from threading import Lock
from uuid import uuid4

from config import LOCAL_STATE_DIR, PROVIDER_PROFILES_PATH
from provider_compat import DEFAULT_COMPAT_PROFILE_ID, normalize_compat_profile_id
from provider_profile_models import ProviderProfile, find_profile, sort_profiles
from provider_profile_normalization import (
    assert_unique_name,
    deserialize_profile,
    normalize_api_key,
    normalize_base_url,
    normalize_model,
    normalize_name,
    normalize_supports_count_parameter,
)
from provider_profile_payloads import build_state_payload


class ProviderProfileStore:
    def __init__(self, path: Path = PROVIDER_PROFILES_PATH) -> None:
        self._path = path
        self._lock = Lock()

    def get_state(self) -> dict:
        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            return build_state_payload(active_profile_id, profiles)

    def get_active_profile(self) -> ProviderProfile | None:
        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            return find_profile(active_profile_id, profiles)

    def get_profile(self, profile_id: str) -> ProviderProfile | None:
        with self._lock:
            _, profiles = self._load_unlocked()
            return find_profile(profile_id, profiles)

    def create_profile(
        self,
        *,
        name: str,
        base_url: str,
        model: str,
        api_key: str,
        compat_profile_id: str = DEFAULT_COMPAT_PROFILE_ID,
        supports_count_parameter: bool = True,
    ) -> dict:
        normalized_name = normalize_name(name)
        normalized_base_url = normalize_base_url(base_url)
        normalized_model = normalize_model(model)
        normalized_api_key = normalize_api_key(api_key)
        normalized_compat_profile_id = normalize_compat_profile_id(compat_profile_id)
        normalized_supports_count_parameter = normalize_supports_count_parameter(supports_count_parameter)

        with self._lock:
            _, profiles = self._load_unlocked()
            assert_unique_name(normalized_name, profiles)

            next_profile = ProviderProfile(
                id=uuid4().hex[:12],
                name=normalized_name,
                base_url=normalized_base_url,
                api_key=normalized_api_key,
                model=normalized_model,
                compat_profile_id=normalized_compat_profile_id,
                supports_count_parameter=normalized_supports_count_parameter,
            )
            next_profiles = sort_profiles([*profiles, next_profile])
            self._write_unlocked(next_profile.id, next_profiles)
            return build_state_payload(next_profile.id, next_profiles)

    def update_profile(
        self,
        profile_id: str,
        *,
        name: str,
        base_url: str,
        model: str,
        compat_profile_id: str,
        api_key: str | None = None,
        supports_count_parameter: bool | None = None,
    ) -> dict:
        normalized_name = normalize_name(name)
        normalized_base_url = normalize_base_url(base_url)
        normalized_model = normalize_model(model)
        normalized_compat_profile_id = normalize_compat_profile_id(compat_profile_id)

        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            current = find_profile(profile_id, profiles)
            if current is None:
                raise ValueError("配置不存在。")

            assert_unique_name(normalized_name, profiles, exclude_id=current.id)
            next_api_key = current.api_key if api_key is None else normalize_api_key(api_key)
            next_supports_count_parameter = (
                current.supports_count_parameter
                if supports_count_parameter is None
                else normalize_supports_count_parameter(supports_count_parameter)
            )
            updated = ProviderProfile(
                id=current.id,
                name=normalized_name,
                base_url=normalized_base_url,
                api_key=next_api_key,
                model=normalized_model,
                compat_profile_id=normalized_compat_profile_id,
                supports_count_parameter=next_supports_count_parameter,
            )
            next_profiles = sort_profiles(
                [updated if profile.id == current.id else profile for profile in profiles],
            )
            self._write_unlocked(active_profile_id, next_profiles)
            return build_state_payload(active_profile_id, next_profiles)

    def activate_profile(self, profile_id: str) -> dict:
        with self._lock:
            _, profiles = self._load_unlocked()
            if find_profile(profile_id, profiles) is None:
                raise ValueError("配置不存在。")
            self._write_unlocked(profile_id, profiles)
            return build_state_payload(profile_id, profiles)

    def delete_profile(self, profile_id: str) -> dict:
        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            current = find_profile(profile_id, profiles)
            if current is None:
                raise ValueError("配置不存在。")

            next_profiles = [profile for profile in profiles if profile.id != current.id]
            next_active_profile_id = active_profile_id
            if active_profile_id == current.id:
                next_active_profile_id = next_profiles[0].id if next_profiles else None
            elif next_active_profile_id and find_profile(next_active_profile_id, next_profiles) is None:
                next_active_profile_id = next_profiles[0].id if next_profiles else None

            self._write_unlocked(next_active_profile_id, next_profiles)
            return build_state_payload(next_active_profile_id, next_profiles)

    def _load_unlocked(self) -> tuple[str | None, list[ProviderProfile]]:
        if not self._path.exists():
            return None, []

        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None, []

        raw_profiles = payload.get("profiles", [])
        if not isinstance(raw_profiles, list):
            return None, []

        profiles: list[ProviderProfile] = []
        seen_ids: set[str] = set()
        mutated = False
        for raw_profile in raw_profiles:
            if not isinstance(raw_profile, dict):
                continue
            profile = deserialize_profile(raw_profile)
            if profile is None:
                continue
            if profile.id in seen_ids:
                continue
            seen_ids.add(profile.id)
            profiles.append(profile)
            if normalize_compat_profile_id(raw_profile.get("compat_profile_id")) != profile.compat_profile_id:
                mutated = True
            if normalize_supports_count_parameter(raw_profile.get("supports_count_parameter")) != profile.supports_count_parameter:
                mutated = True

        profiles = sort_profiles(profiles)
        active_profile_id = str(payload.get("active_profile_id", "")).strip() or None
        if active_profile_id and find_profile(active_profile_id, profiles) is None:
            active_profile_id = None
        if not active_profile_id and profiles:
            active_profile_id = profiles[0].id
            if payload.get("active_profile_id") != active_profile_id:
                mutated = True
        if mutated:
            self._write_unlocked(active_profile_id, profiles)
        return active_profile_id, profiles

    def _write_unlocked(self, active_profile_id: str | None, profiles: list[ProviderProfile]) -> None:
        LOCAL_STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "active_profile_id": active_profile_id,
            "profiles": [asdict(profile) for profile in profiles],
        }
        self._path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
