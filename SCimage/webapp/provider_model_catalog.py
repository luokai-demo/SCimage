from __future__ import annotations

import json
import ssl
from contextlib import closing
from dataclasses import dataclass
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

try:
    import certifi
except ImportError:  # pragma: no cover - bundled app should include certifi via openai/httpx
    certifi = None


IMAGE_MODEL_PREFIXES = ("gpt-image-",)
IMAGE_MODEL_EXACT_IDS = {
    "chatgpt-image-latest",
    "dall-e-2",
    "dall-e-3",
}
MODEL_CATEGORY_IMAGE = "image"
MODEL_CATEGORY_OTHER = "other"


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
    normalized_base_url = normalize_openai_compatible_base_url(base_url)
    payload = _request_provider_models(
        base_url=normalized_base_url,
        api_key=api_key,
        timeout_seconds=runtime_config.timeout_seconds,
    )
    return normalized_base_url, _normalize_provider_models(_read_models_payload(payload))


def _request_provider_models(*, base_url: str, api_key: str, timeout_seconds: int) -> object:
    request = Request(
        urljoin(f"{base_url.rstrip('/')}/", "models"),
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="GET",
    )
    try:
        with closing(urlopen(request, timeout=timeout_seconds, context=_build_ssl_context())) as response:
            raw_body = response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        message = _extract_error_message(exc.read().decode("utf-8", errors="replace"))
        raise RuntimeError(_format_provider_models_http_error(exc.code, message)) from exc
    except FileNotFoundError as exc:
        missing_path = getattr(exc, "filename", "") or str(exc)
        raise RuntimeError(f"模型列表请求失败，运行时缺少文件：{missing_path}") from exc
    except URLError as exc:
        raise RuntimeError(f"模型列表请求失败：{exc.reason}") from exc
    except OSError as exc:
        raise RuntimeError(f"模型列表请求失败：{exc}") from exc

    try:
        return json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise RuntimeError("模型列表返回了非 JSON 内容。") from exc


def _build_ssl_context() -> ssl.SSLContext:
    if certifi is None:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def _read_models_payload(payload: object) -> Iterable[object]:
    if isinstance(payload, dict):
        data = payload.get("data", [])
        return data if isinstance(data, list) else []
    if isinstance(payload, list):
        return payload
    return []


def _extract_error_message(body: str) -> str:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return " ".join(body.split()).strip()
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error.get("code") or "").strip()
        if isinstance(error, str):
            return error.strip()
        message = payload.get("message")
        if isinstance(message, str):
            return message.strip()
    return ""


def _format_provider_models_http_error(status_code: int, detail: str) -> str:
    normalized_detail = " ".join(str(detail or "").split()).strip()
    lower_detail = normalized_detail.lower()
    if "insufficient balance" in lower_detail or "余额不足" in normalized_detail:
        return "无法获取模型列表：账户余额不足，可充值、切换 API Key，或直接手动输入模型 ID。"
    if status_code == 401:
        return "无法获取模型列表：上游接口返回 HTTP 401，请检查 API Key 是否正确，或直接手动输入模型 ID。"
    if status_code == 403:
        return "无法获取模型列表：上游接口返回 HTTP 403，当前 API Key 可能没有模型列表权限，可直接手动输入模型 ID。"
    if status_code == 404:
        return "无法获取模型列表：上游接口没有找到 /models，请检查 Base URL，或直接手动输入模型 ID。"
    if normalized_detail:
        return f"无法获取模型列表：上游接口返回 HTTP {status_code}，{normalized_detail}。可直接手动输入模型 ID。"
    return f"无法获取模型列表：上游接口返回 HTTP {status_code}，可直接手动输入模型 ID。"


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
