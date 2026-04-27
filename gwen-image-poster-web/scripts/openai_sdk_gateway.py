from __future__ import annotations

from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional
import sys

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime
    OpenAI = None


WEBAPP_DIR = Path(__file__).resolve().parents[1] / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from provider_model_catalog import normalize_openai_compatible_base_url  # noqa: E402


StatusCallback = Optional[Callable[[str], None]]


@dataclass(frozen=True)
class OpenAISDKConfig:
    timeout_seconds: int = 480
    max_retries: int = 0


def normalize_openai_sdk_base_url(base_url: str) -> str:
    return normalize_openai_compatible_base_url(base_url)


def _require_openai_client() -> None:
    if OpenAI is None:
        raise RuntimeError("Missing dependency: openai. Please install the openai Python package.")


def _report_status(callback: StatusCallback, message: str) -> None:
    if callback:
        callback(message)


def _build_client(*, base_url: str, api_key: str, config: OpenAISDKConfig) -> OpenAI:
    _require_openai_client()
    return OpenAI(
        api_key=api_key,
        base_url=normalize_openai_sdk_base_url(base_url),
        timeout=float(config.timeout_seconds),
        max_retries=config.max_retries,
    )


def request_openai_sdk_generation(
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    config: OpenAISDKConfig,
    status_callback: StatusCallback = None,
) -> dict:
    _report_status(status_callback, "正在通过 OpenAI SDK 图片接口请求文生图。")
    client = _build_client(base_url=base_url, api_key=api_key, config=config)
    response = client.images.generate(
        model=model,
        prompt=prompt,
        n=count,
        quality=quality,
        size=size,
    )
    return response.model_dump()


def request_openai_sdk_edit(
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    image_paths: list[Path],
    config: OpenAISDKConfig,
    status_callback: StatusCallback = None,
) -> dict:
    _report_status(status_callback, "正在通过 OpenAI SDK 图片接口请求图生图。")
    client = _build_client(base_url=base_url, api_key=api_key, config=config)

    with ExitStack() as exit_stack:
        image_files = [exit_stack.enter_context(path.open("rb")) for path in image_paths]
        image_payload = image_files[0] if len(image_files) == 1 else image_files
        response = client.images.edit(
            model=model,
            image=image_payload,
            prompt=prompt,
            n=count,
            quality=quality,
            size=size,
        )
    return response.model_dump()
