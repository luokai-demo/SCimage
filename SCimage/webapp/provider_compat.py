from __future__ import annotations

from dataclasses import dataclass

from output_options import OUTPUT_PROFILE_ASPECT_V1, OUTPUT_PROFILE_PIXEL_V1


TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS = "images_generations"
TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK = "openai_sdk"
IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED = "unsupported"
IMAGE_TO_IMAGE_TRANSPORT_IMAGES_EDITS = "images_edits"
IMAGE_TO_IMAGE_TRANSPORT_CHAT_COMPLETIONS = "chat_completions"
IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK = "openai_sdk"

OPENAI_LEGACY_COMPAT_PROFILE_ID = "openai_legacy"
OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID = "openai_chat_edits"
GENERATE_ONLY_COMPAT_PROFILE_ID = "generate_only"
DEFAULT_COMPAT_PROFILE_ID = OPENAI_LEGACY_COMPAT_PROFILE_ID


@dataclass(frozen=True)
class ProviderCompatProfile:
    id: str
    label: str
    text_to_image_transport: str
    image_to_image_transport: str
    output_profile_id: str

    @property
    def supports_image_to_image(self) -> bool:
        return self.image_to_image_transport != IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED

    def to_client_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "text_to_image_transport": self.text_to_image_transport,
            "image_to_image_transport": self.image_to_image_transport,
            "supports_image_to_image": self.supports_image_to_image,
            "output_profile_id": self.output_profile_id,
        }


COMPAT_PROFILES = (
    ProviderCompatProfile(
        id=OPENAI_LEGACY_COMPAT_PROFILE_ID,
        label="OpenAI 图片接口",
        text_to_image_transport=TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK,
        image_to_image_transport=IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK,
        output_profile_id=OUTPUT_PROFILE_ASPECT_V1,
    ),
    ProviderCompatProfile(
        id=OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID,
        label="多 API 图生图兼容",
        text_to_image_transport=TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS,
        image_to_image_transport=IMAGE_TO_IMAGE_TRANSPORT_CHAT_COMPLETIONS,
        output_profile_id=OUTPUT_PROFILE_PIXEL_V1,
    ),
    ProviderCompatProfile(
        id=GENERATE_ONLY_COMPAT_PROFILE_ID,
        label="仅文生图",
        text_to_image_transport=TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS,
        image_to_image_transport=IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED,
        output_profile_id=OUTPUT_PROFILE_PIXEL_V1,
    ),
)
COMPAT_PROFILE_MAP = {profile.id: profile for profile in COMPAT_PROFILES}


def normalize_compat_profile_id(value: object, *, fallback: str = DEFAULT_COMPAT_PROFILE_ID) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in COMPAT_PROFILE_MAP:
        return normalized
    return fallback


def get_compat_profile(value: object) -> ProviderCompatProfile:
    return COMPAT_PROFILE_MAP[normalize_compat_profile_id(value)]


def infer_compat_profile_id(*, workflow: object, output_profile_id: object) -> str:
    normalized_workflow = str(workflow or "").strip().lower()
    normalized_output_profile_id = str(output_profile_id or "").strip().lower()
    if normalized_output_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return OPENAI_LEGACY_COMPAT_PROFILE_ID
    if normalized_workflow == "image-to-image":
        return OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID
    return OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID
