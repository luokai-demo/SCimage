from __future__ import annotations

from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import Callable, Optional

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime
    OpenAI = None

from provider_model_catalog import normalize_openai_compatible_base_url


StatusCallback = Optional[Callable[[str], None]]
CancelEvent = Optional[Event]


@dataclass(frozen=True)
class OpenAISDKConfig:
    timeout_seconds: int = 480
    max_retries: int = 0


@dataclass(frozen=True)
class OpenAISDKRequest:
    operation: str
    base_url: str
    api_key: str
    model: str
    prompt: str
    count: int
    quality: str
    size: str
    image_paths: tuple[str, ...] = ()


def normalize_openai_sdk_base_url(base_url: str) -> str:
    return normalize_openai_compatible_base_url(base_url)


def _require_openai_client() -> None:
    if OpenAI is None:
        raise RuntimeError("Missing dependency: openai. Please install the openai Python package.")


def _report_status(callback: StatusCallback, message: str) -> None:
    if callback:
        callback(message)


def _raise_if_cancelled(cancel_event: CancelEvent) -> None:
    if cancel_event and cancel_event.is_set():
        raise RuntimeError("图像任务已取消。")


def _build_client(*, base_url: str, api_key: str, config: OpenAISDKConfig) -> OpenAI:
    _require_openai_client()
    return OpenAI(
        api_key=api_key,
        base_url=normalize_openai_sdk_base_url(base_url),
        timeout=float(config.timeout_seconds),
        max_retries=config.max_retries,
    )


def _execute_openai_sdk_request(request: OpenAISDKRequest, config: OpenAISDKConfig) -> dict:
    client = _build_client(base_url=request.base_url, api_key=request.api_key, config=config)
    try:
        if request.operation == "generate":
            response = client.images.generate(
                model=request.model,
                prompt=request.prompt,
                n=request.count,
                quality=request.quality,
                size=request.size,
            )
            return response.model_dump()

        if request.operation == "edit":
            image_paths = [Path(path) for path in request.image_paths]
            with ExitStack() as exit_stack:
                image_files = [exit_stack.enter_context(path.open("rb")) for path in image_paths]
                image_payload = image_files[0] if len(image_files) == 1 else image_files
                response = client.images.edit(
                    model=request.model,
                    image=image_payload,
                    prompt=request.prompt,
                    n=request.count,
                    quality=request.quality,
                    size=request.size,
                )
            return response.model_dump()

        raise RuntimeError(f"Unsupported OpenAI SDK operation: {request.operation}")
    finally:
        client.close()


def _run_sdk_request(
    *,
    request: OpenAISDKRequest,
    config: OpenAISDKConfig,
    status_message: str,
    status_callback: StatusCallback = None,
    cancel_event: CancelEvent = None,
) -> dict:
    _report_status(status_callback, status_message)
    _raise_if_cancelled(cancel_event)
    result = _execute_openai_sdk_request(request, config)
    _raise_if_cancelled(cancel_event)
    return result


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
    cancel_event: CancelEvent = None,
) -> dict:
    return _run_sdk_request(
        request=OpenAISDKRequest(
            operation="generate",
            base_url=base_url,
            api_key=api_key,
            model=model,
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
        ),
        config=config,
        status_message="正在通过 OpenAI SDK 图片接口请求文生图。",
        status_callback=status_callback,
        cancel_event=cancel_event,
    )


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
    cancel_event: CancelEvent = None,
) -> dict:
    return _run_sdk_request(
        request=OpenAISDKRequest(
            operation="edit",
            base_url=base_url,
            api_key=api_key,
            model=model,
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
            image_paths=tuple(str(path) for path in image_paths),
        ),
        config=config,
        status_message="正在通过 OpenAI SDK 图片接口请求图生图。",
        status_callback=status_callback,
        cancel_event=cancel_event,
    )
