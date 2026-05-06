from __future__ import annotations

from dataclasses import dataclass

from provider_compat import DEFAULT_COMPAT_PROFILE_ID, get_compat_profile


@dataclass(frozen=True)
class ProviderProfile:
    id: str
    name: str
    base_url: str
    api_key: str
    model: str
    compat_profile_id: str = DEFAULT_COMPAT_PROFILE_ID
    supports_count_parameter: bool = True

    def is_ready(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def compat_profile(self):
        return get_compat_profile(self.compat_profile_id)

    def to_client_dict(self, *, include_api_key: bool = False) -> dict:
        payload = {
            "id": self.id,
            "name": self.name,
            "base_url": self.base_url,
            "model": self.model,
            "compat_profile_id": self.compat_profile_id,
            "supports_count_parameter": self.supports_count_parameter,
            "has_api_key": bool(self.api_key),
            "api_key_hint": mask_secret(self.api_key),
        }
        if include_api_key:
            payload["api_key"] = self.api_key
        return payload


def find_profile(profile_id: str | None, profiles: list[ProviderProfile]) -> ProviderProfile | None:
    if not profile_id:
        return None
    for profile in profiles:
        if profile.id == profile_id:
            return profile
    return None


def sort_profiles(profiles: list[ProviderProfile]) -> list[ProviderProfile]:
    return sorted(profiles, key=lambda profile: profile.name.lower())


def mask_secret(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}{'*' * (len(secret) - 8)}{secret[-4:]}"
