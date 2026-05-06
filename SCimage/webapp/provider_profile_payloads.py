from __future__ import annotations

from provider_compat import COMPAT_PROFILES
from provider_profile_models import ProviderProfile, find_profile


def build_state_payload(active_profile_id: str | None, profiles: list[ProviderProfile]) -> dict:
    active_profile = find_profile(active_profile_id, profiles)
    return {
        "active_profile_id": active_profile_id,
        "compat_profiles": [profile.to_client_dict() for profile in COMPAT_PROFILES],
        "profiles": [profile.to_client_dict() for profile in profiles],
        "active_profile": active_profile.to_client_dict(include_api_key=True) if active_profile else None,
        "has_profiles": bool(profiles),
        "is_ready": bool(active_profile and active_profile.is_ready()),
    }
