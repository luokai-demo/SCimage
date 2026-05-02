from __future__ import annotations

import base64
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Optional

from image_gateway_client import (
    GatewayConfig,
    request_chat_completion_images,
    request_edit,
    request_generation,
    save_image_item,
)
from openai_image_sdk import OpenAISDKConfig, request_openai_sdk_edit, request_openai_sdk_generation
from output_options import (
    DEFAULT_OUTPUT_PROFILE_ID,
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    normalize_output_profile_id,
    normalize_quality,
    normalize_size_value,
    resolve_api_size_value,
    resolve_openai_sdk_quality,
    resolve_openai_sdk_size_value,
)
from provider_compat import (
    DEFAULT_COMPAT_PROFILE_ID,
    IMAGE_TO_IMAGE_TRANSPORT_CHAT_COMPLETIONS,
    IMAGE_TO_IMAGE_TRANSPORT_IMAGES_EDITS,
    IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK,
    IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED,
    TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS,
    TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK,
    get_compat_profile,
    normalize_compat_profile_id,
)


StatusCallback = Optional[Callable[[str], None]]
WORKFLOW_OPTIONS = ("generate", "image-to-image")

if TYPE_CHECKING:
    from job_control import JobRunner


@dataclass(frozen=True)
class ImageGenerationRequest:
    workflow: str
    prompt: str
    api_key: str
    base_url: str
    model: str
    compat_profile_id: str = DEFAULT_COMPAT_PROFILE_ID
    output_profile_id: str = DEFAULT_OUTPUT_PROFILE_ID
    size: str = DEFAULT_SIZE_OPTION
    quality: str = DEFAULT_QUALITY
    count: int = 1
    output_paths: tuple[Path, ...] = ()
    source_image_paths: tuple[Path, ...] = ()


@dataclass(frozen=True)
class ImageGenerationResponse:
    saved_paths: tuple[Path, ...]
    task_id: str | None = None


def validate_source_image_paths(raw_paths: list[str]) -> list[Path]:
    resolved_paths: list[Path] = []
    for index, raw_path in enumerate(raw_paths, start=1):
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            raise ValueError(f"Missing source image #{index}: {path}")
        resolved_paths.append(path)
    return resolved_paths


def execute_image_generation(
    request: ImageGenerationRequest,
    *,
    status_callback: StatusCallback = None,
    gateway_config: GatewayConfig | None = None,
    openai_sdk_config: OpenAISDKConfig | None = None,
    cancel_event: Event | None = None,
    runner: "JobRunner" | None = None,
) -> ImageGenerationResponse:
    if request.count < 1:
        raise ValueError("生成数量必须大于 0。")
    if not request.prompt.strip():
        raise ValueError("Missing prompt.")
    if not request.base_url.rstrip("/"):
        raise ValueError("Missing base URL. Set IMAGE_API_BASE_URL / OPENAI_BASE_URL, or pass --base-url.")
    if not request.api_key.strip():
        raise ValueError("Missing API key. Set IMAGE_API_KEY or OPENAI_API_KEY, or pass --api-key.")
    if request.workflow not in WORKFLOW_OPTIONS:
        raise ValueError(f"Unsupported workflow: {request.workflow}")

    output_paths = tuple(request.output_paths)
    if not output_paths:
        raise ValueError("输出路径不能为空。")

    compat_profile = get_compat_profile(normalize_compat_profile_id(request.compat_profile_id))
    output_profile_id = normalize_output_profile_id(
        request.output_profile_id,
        fallback=compat_profile.output_profile_id,
    )
    normalized_quality = normalize_quality(
        request.quality,
        fallback=DEFAULT_QUALITY,
        output_profile_id=output_profile_id,
    )
    normalized_size = normalize_size_value(
        request.size,
        fallback=DEFAULT_SIZE_OPTION,
        quality=normalized_quality,
        output_profile_id=output_profile_id,
    )
    api_size = resolve_api_size_value(
        normalized_size,
        normalized_quality,
        output_profile_id=output_profile_id,
    )
    sdk_quality = resolve_openai_sdk_quality(normalized_quality, output_profile_id=output_profile_id)
    sdk_size = resolve_openai_sdk_size_value(
        normalized_size,
        normalized_quality,
        output_profile_id=output_profile_id,
    )
    headers = {
        "Authorization": f"Bearer {request.api_key}",
        "Content-Type": "application/json",
    }

    runtime_gateway_config = gateway_config or GatewayConfig()
    runtime_openai_sdk_config = openai_sdk_config or OpenAISDKConfig()

    if request.workflow == "image-to-image":
        if not request.source_image_paths:
            raise ValueError("Image-to-image workflow requires at least one source image.")
        response = _request_image_to_image(
            request=request,
            headers=headers,
            compat_profile=compat_profile,
            normalized_quality=normalized_quality,
            api_size=api_size,
            sdk_quality=sdk_quality,
            sdk_size=sdk_size,
            gateway_config=runtime_gateway_config,
            openai_sdk_config=runtime_openai_sdk_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    else:
        response = _request_text_to_image(
            request=request,
            headers=headers,
            compat_profile=compat_profile,
            normalized_quality=normalized_quality,
            api_size=api_size,
            sdk_quality=sdk_quality,
            sdk_size=sdk_size,
            gateway_config=runtime_gateway_config,
            openai_sdk_config=runtime_openai_sdk_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )

    data = response.get("data", [])
    task_id = str(response.get("task_id", "")).strip() or None
    saved_paths: list[Path] = []
    for index, (item, target) in enumerate(zip(data, output_paths), start=1):
        save_image_item(
            item=item,
            target=target,
            base_url=request.base_url,
            config=runtime_gateway_config,
            status_callback=status_callback,
            image_index=index,
            image_total=len(output_paths),
            cancel_event=cancel_event,
            runner=runner,
        )
        saved_paths.append(target)
    return ImageGenerationResponse(saved_paths=tuple(saved_paths), task_id=task_id)


def normalize_generation_error(message: str) -> str:
    lines = [line.strip() for line in message.splitlines() if line.strip()]
    cleaned = (lines[-1] if lines else message).strip()
    if cleaned.startswith("Error:"):
        cleaned = cleaned.removeprefix("Error:").strip()
    normalized = cleaned.lower()

    if '"code": "401"' in normalized or '"code":"401"' in normalized:
        return "API Key 无效或已过期，接口返回了 401。"
    if '"code": "402"' in normalized or '"code":"402"' in normalized:
        return "接口余额不足，接口返回了 402。"
    if '"code": "403"' in normalized or '"code":"403"' in normalized:
        return "当前账号无权限访问这个接口，接口返回了 403。"
    if "在 4 次尝试后仍返回异常" in cleaned or "在 4 次尝试后仍失败" in cleaned:
        if "auth_required" in normalized or "chat-requirements failed" in normalized:
            return "图像服务已经自动重试多次，但上游仍返回 auth_required / chat-requirements failed。建议稍后再试。"
    if "auth_required" in normalized or "chat-requirements failed" in normalized:
        return "上游图像服务当前未通过权限校验，接口返回了 auth_required / chat-requirements failed。"
    if '"code": "429"' in normalized or '"code":"429"' in normalized:
        return "图像服务当前请求过于频繁，接口返回了 429，请稍后再试。"
    if '"code": "500"' in normalized or '"code":"500"' in normalized:
        return "图像服务内部错误，接口返回了 500。"
    if '"code": "502"' in normalized or '"code":"502"' in normalized:
        return "图像服务上游不可用，接口返回了 502。"
    if "504 gateway time-out" in normalized or "504 gateway timeout" in normalized or "gateway request timed out" in normalized:
        return "图像服务超时了。脚本已经自动重试过，建议稍后再试。"
    if "operation timed out" in normalized or "timed out" in normalized:
        return "图像服务长时间没有返回结果。当前图片生成超时上限约 8 分钟，脚本已经自动重试过，建议稍后再试。"
    if "gateway returned invalid response" in normalized or "gateway returned non-json content" in normalized or "<html" in normalized:
        return "图像服务返回了异常页面，脚本已经自动重试过，通常是上游超时或临时故障。"
    if "502" in normalized or "503" in normalized or "temporarily unavailable" in normalized:
        return "图像服务暂时不可用，脚本已经自动重试过，请稍后再试。"

    return cleaned or "图像请求失败。"


def _request_image_to_image(
    *,
    request: ImageGenerationRequest,
    headers: dict[str, str],
    compat_profile,
    normalized_quality: str,
    api_size: str,
    sdk_quality: str,
    sdk_size: str,
    gateway_config: GatewayConfig,
    openai_sdk_config: OpenAISDKConfig,
    status_callback: StatusCallback,
    cancel_event: Event | None,
    runner: "JobRunner" | None,
) -> dict:
    source_image_paths = list(request.source_image_paths)
    if compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED:
        raise ValueError("当前兼容模式不支持图生图，请切换到支持图生图的提供方配置。")
    if compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK:
        return request_openai_sdk_edit(
            base_url=request.base_url,
            api_key=request.api_key,
            model=request.model,
            prompt=request.prompt,
            count=request.count,
            quality=sdk_quality,
            size=sdk_size,
            image_paths=source_image_paths,
            config=openai_sdk_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    if compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_IMAGES_EDITS:
        return request_edit(
            base_url=request.base_url,
            headers=headers,
            fields=_build_edit_fields(
                model=request.model,
                prompt=request.prompt,
                count=request.count,
                quality=normalized_quality,
                size=api_size,
            ),
            image_paths=source_image_paths,
            config=gateway_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    if compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_CHAT_COMPLETIONS:
        return request_chat_completion_images(
            base_url=request.base_url,
            headers=headers,
            payload=_build_chat_completion_payload(
                model=request.model,
                prompt=request.prompt,
                quality=normalized_quality,
                size=api_size,
                source_images=source_image_paths,
            ),
            config=gateway_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    raise ValueError(f"Unsupported image-to-image transport: {compat_profile.image_to_image_transport}")


def _request_text_to_image(
    *,
    request: ImageGenerationRequest,
    headers: dict[str, str],
    compat_profile,
    normalized_quality: str,
    api_size: str,
    sdk_quality: str,
    sdk_size: str,
    gateway_config: GatewayConfig,
    openai_sdk_config: OpenAISDKConfig,
    status_callback: StatusCallback,
    cancel_event: Event | None,
    runner: "JobRunner" | None,
) -> dict:
    if compat_profile.text_to_image_transport == TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK:
        return request_openai_sdk_generation(
            base_url=request.base_url,
            api_key=request.api_key,
            model=request.model,
            prompt=request.prompt,
            count=request.count,
            quality=sdk_quality,
            size=sdk_size,
            config=openai_sdk_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    if compat_profile.text_to_image_transport == TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS:
        return request_generation(
            base_url=request.base_url,
            headers=headers,
            payload=_build_generation_payload(
                model=request.model,
                prompt=request.prompt,
                count=request.count,
                quality=normalized_quality,
                size=api_size,
            ),
            config=gateway_config,
            status_callback=status_callback,
            cancel_event=cancel_event,
            runner=runner,
        )
    raise ValueError(f"Unsupported text-to-image transport: {compat_profile.text_to_image_transport}")


def _file_to_data_url(path: Path) -> str:
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _build_generation_payload(*, model: str, prompt: str, count: int, quality: str, size: str) -> dict:
    return {
        "model": model,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": quality,
    }


def _build_edit_fields(*, model: str, prompt: str, count: int, quality: str, size: str) -> dict[str, object]:
    return {
        "model": model,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": quality,
    }


def _build_chat_completion_payload(
    *,
    model: str,
    prompt: str,
    quality: str,
    size: str,
    source_images: list[Path],
) -> dict:
    content = [{"type": "text", "text": prompt}]
    content.extend(
        {
            "type": "image_url",
            "image_url": {"url": _file_to_data_url(path)},
        }
        for path in source_images
    )
    return {
        "model": model,
        "stream": True,
        "quality": quality,
        "size": size,
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
    }
