from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from image_gateway_assets import IMAGE_PAYLOAD_FIELDS, download_file, save_image_item
from image_gateway_errors import GatewayCanceledError, GatewayFatalError, GatewayRetryableError, is_retryable_message
from image_gateway_transport import (
    CancelEvent,
    GatewayConfig,
    StatusCallback,
    post_json_once,
    post_multipart_once,
    request_image_operation,
)

if TYPE_CHECKING:
    from job_control import JobRunner


def _is_retryable_message(message: str) -> bool:
    return is_retryable_message(message)


def request_generation(
    *,
    base_url: str,
    headers: dict[str, str],
    payload: dict,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    url = f"{base_url.rstrip('/')}/images/generations"
    return request_image_operation(
        url=url,
        config=config,
        attempt_label="正在请求图像接口",
        final_error_label="图像接口",
        retry_label="请求接口",
        request_once=lambda: post_json_once(
            url=url,
            headers=headers,
            payload=payload,
            config=config,
            cancel_event=cancel_event,
            runner=runner,
        ),
        status_callback=status_callback,
        cancel_event=cancel_event,
    )


def request_edit(
    *,
    base_url: str,
    headers: dict[str, str],
    fields: dict[str, object],
    image_paths: list[Path],
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    url = f"{base_url.rstrip('/')}/images/edits"
    return request_image_operation(
        url=url,
        config=config,
        attempt_label="正在请求图像编辑接口",
        final_error_label="图像编辑接口",
        retry_label="请求编辑接口",
        request_once=lambda: post_multipart_once(
            url=url,
            headers=headers,
            fields=fields,
            file_fields=[("image", path) for path in image_paths],
            config=config,
            cancel_event=cancel_event,
            runner=runner,
        ),
        status_callback=status_callback,
        cancel_event=cancel_event,
    )


def request_chat_completion_images(
    *,
    base_url: str,
    headers: dict[str, str],
    payload: dict,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    url = f"{base_url.rstrip('/')}/chat/completions"
    return request_image_operation(
        url=url,
        config=config,
        attempt_label="正在请求图生图接口",
        final_error_label="图生图接口",
        retry_label="请求图生图接口",
        request_once=lambda: post_json_once(
            url=url,
            headers=headers,
            payload=payload,
            config=config,
            cancel_event=cancel_event,
            runner=runner,
        ),
        status_callback=status_callback,
        cancel_event=cancel_event,
    )
