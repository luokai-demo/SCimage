from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse
from uuid import uuid4

from config import DEFAULT_PROVIDER_MODEL, LOCAL_STATE_DIR, PROVIDER_PROFILES_PATH


@dataclass(frozen=True)
class ProviderProfile:
    id: str
    name: str
    base_url: str
    api_key: str
    model: str

    def is_ready(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def to_client_dict(self, *, include_api_key: bool = False) -> dict:
        payload = {
            "id": self.id,
            "name": self.name,
            "base_url": self.base_url,
            "model": self.model,
            "has_api_key": bool(self.api_key),
            "api_key_hint": _mask_secret(self.api_key),
        }
        if include_api_key:
            payload["api_key"] = self.api_key
        return payload


class ProviderProfileStore:
    def __init__(self, path: Path = PROVIDER_PROFILES_PATH) -> None:
        self._path = path
        self._lock = Lock()

    def get_state(self) -> dict:
        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            return _build_state_payload(active_profile_id, profiles)

    def get_active_profile(self) -> ProviderProfile | None:
        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            return _find_profile(active_profile_id, profiles)

    def get_profile(self, profile_id: str) -> ProviderProfile | None:
        with self._lock:
            _, profiles = self._load_unlocked()
            return _find_profile(profile_id, profiles)

    def create_profile(self, *, name: str, base_url: str, model: str, api_key: str) -> dict:
        normalized_name = _normalize_name(name)
        normalized_base_url = _normalize_base_url(base_url)
        normalized_model = _normalize_model(model)
        normalized_api_key = _normalize_api_key(api_key)

        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            _assert_unique_name(normalized_name, profiles)

            next_profile = ProviderProfile(
                id=uuid4().hex[:12],
                name=normalized_name,
                base_url=normalized_base_url,
                api_key=normalized_api_key,
                model=normalized_model,
            )
            next_profiles = sorted([*profiles, next_profile], key=lambda profile: profile.name.lower())
            self._write_unlocked(next_profile.id, next_profiles)
            return _build_state_payload(next_profile.id, next_profiles)

    def update_profile(
        self,
        profile_id: str,
        *,
        name: str,
        base_url: str,
        model: str,
        api_key: str | None = None,
    ) -> dict:
        normalized_name = _normalize_name(name)
        normalized_base_url = _normalize_base_url(base_url)
        normalized_model = _normalize_model(model)

        with self._lock:
            active_profile_id, profiles = self._load_unlocked()
            current = _find_profile(profile_id, profiles)
            if current is None:
                raise ValueError("配置不存在。")

            _assert_unique_name(normalized_name, profiles, exclude_id=current.id)
            next_api_key = current.api_key if api_key is None else _normalize_api_key(api_key)
            updated = ProviderProfile(
                id=current.id,
                name=normalized_name,
                base_url=normalized_base_url,
                api_key=next_api_key,
                model=normalized_model,
            )
            next_profiles = sorted(
                [updated if profile.id == current.id else profile for profile in profiles],
                key=lambda profile: profile.name.lower(),
            )
            self._write_unlocked(active_profile_id, next_profiles)
            return _build_state_payload(active_profile_id, next_profiles)

    def activate_profile(self, profile_id: str) -> dict:
        with self._lock:
            _, profiles = self._load_unlocked()
            if _find_profile(profile_id, profiles) is None:
                raise ValueError("配置不存在。")
            self._write_unlocked(profile_id, profiles)
            return _build_state_payload(profile_id, profiles)

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
            profile = _deserialize_profile(raw_profile)
            if profile is None:
                continue
            if profile.id in seen_ids:
                continue
            seen_ids.add(profile.id)
            profiles.append(profile)

        profiles.sort(key=lambda profile: profile.name.lower())
        active_profile_id = str(payload.get("active_profile_id", "")).strip() or None
        if active_profile_id and _find_profile(active_profile_id, profiles) is None:
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


def _build_state_payload(active_profile_id: str | None, profiles: list[ProviderProfile]) -> dict:
    active_profile = _find_profile(active_profile_id, profiles)
    return {
        "active_profile_id": active_profile_id,
        "profiles": [profile.to_client_dict() for profile in profiles],
        "active_profile": active_profile.to_client_dict(include_api_key=True) if active_profile else None,
        "has_profiles": bool(profiles),
        "is_ready": bool(active_profile and active_profile.is_ready()),
    }


def _deserialize_profile(payload: dict) -> ProviderProfile | None:
    profile_id = str(payload.get("id", "")).strip()
    name = str(payload.get("name", "")).strip()
    base_url = str(payload.get("base_url", "")).strip()
    model = str(payload.get("model", "")).strip() or DEFAULT_PROVIDER_MODEL
    api_key = str(payload.get("api_key", "")).strip()
    if not profile_id or not name or not base_url or not model:
        return None
    return ProviderProfile(
        id=profile_id,
        name=name,
        base_url=base_url,
        api_key=api_key,
        model=model,
    )


def _find_profile(profile_id: str | None, profiles: list[ProviderProfile]) -> ProviderProfile | None:
    if not profile_id:
        return None
    for profile in profiles:
        if profile.id == profile_id:
            return profile
    return None


def _normalize_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("配置名称不能为空。")
    return normalized


def _normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    if not normalized:
        raise ValueError("Base URL 不能为空。")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Base URL 必须是合法的 http/https 地址。")
    return normalized


def _normalize_model(value: str) -> str:
    normalized = value.strip()
    return normalized or DEFAULT_PROVIDER_MODEL


def _normalize_api_key(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("API Key 不能为空。")
    return normalized


def _assert_unique_name(name: str, profiles: list[ProviderProfile], exclude_id: str | None = None) -> None:
    normalized = name.strip().lower()
    for profile in profiles:
        if profile.id == exclude_id:
            continue
        if profile.name.strip().lower() == normalized:
            raise ValueError("已存在同名配置，请换一个名称。")


def _mask_secret(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}{'*' * (len(secret) - 8)}{secret[-4:]}"
