from __future__ import annotations

from provider_model_catalog import (
    discover_provider_models,
    normalize_openai_compatible_base_url,
)


def create_provider_profile_payload(store, payload: dict) -> dict:
    compat_profile_id = str(payload.get("compat_profile_id", "")).strip()
    source_profile_id = str(payload.get("source_profile_id", "")).strip()
    source_profile = store.get_profile(source_profile_id) if source_profile_id else store.get_active_profile()
    if source_profile_id and source_profile is None:
        raise ValueError("源配置不存在，无法继承密钥。")
    if source_profile is not None and not compat_profile_id:
        compat_profile_id = source_profile.compat_profile_id

    api_key = resolve_provider_api_key(
        store,
        api_key=payload.get("api_key", ""),
        source_profile_id=source_profile_id,
    )
    normalized_base_url = resolve_provider_base_url(payload)
    supports_count_parameter = resolve_supports_count_parameter(
        payload.get("supports_count_parameter"),
        fallback_profile=source_profile,
    )

    return store.create_profile(
        name=str(payload.get("name", "")).strip(),
        base_url=normalized_base_url,
        model=str(payload.get("model", "")).strip(),
        api_key=api_key,
        compat_profile_id=compat_profile_id,
        supports_count_parameter=supports_count_parameter,
    )


def update_provider_profile_payload(store, profile_id: str, payload: dict) -> dict:
    current_profile = store.get_profile(profile_id)
    if current_profile is None:
        raise KeyError("配置不存在。")

    normalized_base_url = resolve_provider_base_url(payload)
    supports_count_parameter = resolve_supports_count_parameter(
        payload.get("supports_count_parameter"),
        fallback_profile=current_profile,
    )

    api_key = payload.get("api_key")
    if api_key is not None:
        api_key = str(api_key).strip()

    return store.update_profile(
        profile_id,
        name=str(payload.get("name", "")).strip(),
        base_url=normalized_base_url,
        model=str(payload.get("model", "")).strip(),
        compat_profile_id=str(payload.get("compat_profile_id", "")).strip(),
        api_key=api_key if api_key else None,
        supports_count_parameter=supports_count_parameter,
    )


def list_provider_models_payload(store, payload: dict) -> dict:
    normalized_base_url, models = discover_models_from_payload(store, payload)
    return {
        "models": models,
        "normalized_base_url": normalized_base_url,
    }


def discover_models_from_payload(store, payload: dict, *, fallback_profile=None) -> tuple[str, list[dict]]:
    api_key = resolve_provider_api_key(
        store,
        api_key=payload.get("api_key", ""),
        source_profile_id=payload.get("source_profile_id", ""),
        fallback_profile=fallback_profile,
    )
    normalized_base_url, models = discover_provider_models(
        base_url=str(payload.get("base_url", "")).strip(),
        api_key=api_key,
    )
    return normalized_base_url, [model.to_client_dict() for model in models]


def resolve_provider_base_url(payload: dict) -> str:
    return normalize_openai_compatible_base_url(str(payload.get("base_url", "")).strip())


def resolve_provider_api_key(
    store,
    *,
    api_key: object,
    source_profile_id: object = "",
    fallback_profile=None,
) -> str:
    normalized_api_key = str(api_key or "").strip()
    if normalized_api_key:
        return normalized_api_key

    normalized_source_profile_id = str(source_profile_id or "").strip()
    source_profile = fallback_profile
    if normalized_source_profile_id:
        source_profile = store.get_profile(normalized_source_profile_id)
        if source_profile is None:
            raise ValueError("源配置不存在，无法继承密钥。")
    elif source_profile is None:
        source_profile = store.get_active_profile()

    if source_profile and source_profile.api_key:
        return source_profile.api_key
    raise ValueError("API Key 不能为空。")


def resolve_supports_count_parameter(value: object, *, fallback_profile=None) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return True if fallback_profile is None else bool(fallback_profile.supports_count_parameter)

    normalized = str(value).strip().lower()
    if not normalized:
        return True if fallback_profile is None else bool(fallback_profile.supports_count_parameter)
    if normalized in {"0", "false", "no", "off"}:
        return False
    return True
