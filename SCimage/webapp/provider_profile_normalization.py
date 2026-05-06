from __future__ import annotations

from urllib.parse import urlparse

from config import DEFAULT_PROVIDER_MODEL
from provider_compat import normalize_compat_profile_id
from provider_profile_models import ProviderProfile


def deserialize_profile(payload: dict) -> ProviderProfile | None:
    profile_id = str(payload.get("id", "")).strip()
    name = str(payload.get("name", "")).strip()
    base_url = str(payload.get("base_url", "")).strip()
    model = str(payload.get("model", "")).strip() or DEFAULT_PROVIDER_MODEL
    api_key = str(payload.get("api_key", "")).strip()
    compat_profile_id = normalize_compat_profile_id(payload.get("compat_profile_id"))
    supports_count_parameter = normalize_supports_count_parameter(payload.get("supports_count_parameter"))
    if not profile_id or not name or not base_url or not model:
        return None
    return ProviderProfile(
        id=profile_id,
        name=name,
        base_url=base_url,
        api_key=api_key,
        model=model,
        compat_profile_id=compat_profile_id,
        supports_count_parameter=supports_count_parameter,
    )


def normalize_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("配置名称不能为空。")
    return normalized


def normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    if not normalized:
        raise ValueError("Base URL 不能为空。")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Base URL 必须是合法的 http/https 地址。")
    return normalized


def normalize_model(value: str) -> str:
    normalized = value.strip()
    return normalized or DEFAULT_PROVIDER_MODEL


def normalize_api_key(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("API Key 不能为空。")
    return normalized


def normalize_supports_count_parameter(value: object, *, fallback: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return fallback
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback


def assert_unique_name(name: str, profiles: list[ProviderProfile], exclude_id: str | None = None) -> None:
    normalized = name.strip().lower()
    for profile in profiles:
        if profile.id == exclude_id:
            continue
        if profile.name.strip().lower() == normalized:
            raise ValueError("已存在同名配置，请换一个名称。")
