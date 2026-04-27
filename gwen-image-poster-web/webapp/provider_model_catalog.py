from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urlparse

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime
    OpenAI = None


IMAGE_MODEL_PREFIXES = ("gpt-image-",)
IMAGE_MODEL_EXACT_IDS = {
    "chatgpt-image-latest",
    "dall-e-2",
    "dall-e-3",
}
MODEL_CATEGORY_IMAGE = "image"
MODEL_CATEGORY_OTHER = "other"
MODEL_VALIDATION_ERROR_MESSAGE = "当前模型不在该 API 支持列表中，请重新拉取并选择。"


@dataclass(frozen=True)
class ProviderModelOption:
    id: str
    category: str

    def to_client_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
        }


@dataclass(frozen=True)
class ProviderModelCatalogConfig:
    timeout_seconds: int = 30
    max_retries: int = 0


def normalize_openai_compatible_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        raise ValueError("Base URL 不能为空。")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Base URL 必须是合法的 http/https 地址。")
    if parsed.path in {"", "/"}:
        return f"{normalized}/v1"
    return normalized


def categorize_provider_model(model_id: str) -> str:
    normalized = str(model_id or "").strip().lower()
    if normalized in IMAGE_MODEL_EXACT_IDS:
        return MODEL_CATEGORY_IMAGE
    if normalized.startswith(IMAGE_MODEL_PREFIXES):
        return MODEL_CATEGORY_IMAGE
    return MODEL_CATEGORY_OTHER


def discover_provider_models(
    *,
    base_url: str,
    api_key: str,
    config: ProviderModelCatalogConfig | None = None,
) -> tuple[str, list[ProviderModelOption]]:
    runtime_config = config or ProviderModelCatalogConfig()
    client = _build_openai_client(
        base_url=base_url,
        api_key=api_key,
        config=runtime_config,
    )
    normalized_base_url = normalize_openai_compatible_base_url(base_url)
    response = client.models.list()
    return normalized_base_url, _normalize_provider_models(getattr(response, "data", []))


def validate_provider_model_selection(
    *,
    base_url: str,
    api_key: str,
    model: str,
    config: ProviderModelCatalogConfig | None = None,
) -> tuple[str, list[ProviderModelOption]]:
    normalized_base_url, models = discover_provider_models(
        base_url=base_url,
        api_key=api_key,
        config=config,
    )
    normalized_model = str(model or "").strip()
    if not normalized_model:
        raise ValueError(MODEL_VALIDATION_ERROR_MESSAGE)

    supported_model_ids = {item.id for item in models}
    if normalized_model not in supported_model_ids:
        raise ValueError(MODEL_VALIDATION_ERROR_MESSAGE)
    return normalized_base_url, models


def _build_openai_client(
    *,
    base_url: str,
    api_key: str,
    config: ProviderModelCatalogConfig,
):
    if OpenAI is None:
        raise RuntimeError("Missing dependency: openai. Please install the openai Python package.")
    return OpenAI(
        api_key=api_key,
        base_url=normalize_openai_compatible_base_url(base_url),
        timeout=float(config.timeout_seconds),
        max_retries=config.max_retries,
    )


def _normalize_provider_models(raw_models: Iterable[object]) -> list[ProviderModelOption]:
    image_models: list[ProviderModelOption] = []
    other_models: list[ProviderModelOption] = []
    seen_ids: set[str] = set()

    for raw_model in raw_models:
        model_id = _read_model_id(raw_model)
        if not model_id or model_id in seen_ids:
            continue
        seen_ids.add(model_id)
        model = ProviderModelOption(
            id=model_id,
            category=categorize_provider_model(model_id),
        )
        if model.category == MODEL_CATEGORY_IMAGE:
            image_models.append(model)
        else:
            other_models.append(model)

    return [*image_models, *other_models]


def _read_model_id(raw_model: object) -> str:
    if isinstance(raw_model, dict):
        return str(raw_model.get("id", "")).strip()
    return str(getattr(raw_model, "id", "")).strip()
