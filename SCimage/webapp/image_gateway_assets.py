from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urljoin, urlparse

from image_gateway_errors import GatewayFatalError, GatewayRetryableError, is_retryable_message, normalize_message
from image_gateway_transport import (
    CancelEvent,
    GatewayConfig,
    StatusCallback,
    curl_binary,
    raise_if_cancelled,
    report_status,
    run_command,
    sleep_before_retry,
)

if TYPE_CHECKING:
    from job_control import JobRunner


IMAGE_PAYLOAD_FIELDS = ("url", "b64_json", "data_url")


def save_image_item(
    *,
    item: dict,
    target: Path,
    base_url: str,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    image_index: int = 1,
    image_total: int = 1,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> str:
    payloads = _collect_image_payloads(item)
    if not payloads:
        raise GatewayFatalError(
            f"Gateway response item is missing supported image payload ({', '.join(IMAGE_PAYLOAD_FIELDS)})."
        )

    errors: list[str] = []
    origin = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"

    for attempt_index, (payload_type, payload) in enumerate(payloads, start=1):
        raise_if_cancelled(cancel_event)
        try:
            if payload_type == "url":
                file_url = payload if payload.startswith("http") else urljoin(origin, payload)
                download_file(
                    url=file_url,
                    target=target,
                    config=config,
                    status_callback=status_callback,
                    image_index=image_index,
                    image_total=image_total,
                    cancel_event=cancel_event,
                    runner=runner,
                )
                return payload_type

            report_status(status_callback, f"正在保存第 {image_index}/{image_total} 张图片。")
            if payload_type == "b64_json":
                _write_base64_image(target, payload)
                return payload_type
            if payload_type == "data_url":
                _write_data_url_image(target, payload)
                return payload_type
            raise GatewayFatalError(f"Unsupported image payload type: {payload_type}.")
        except (GatewayFatalError, GatewayRetryableError) as exc:
            errors.append(f"{payload_type}: {exc}")
            if attempt_index < len(payloads):
                report_status(
                    status_callback,
                    f"第 {image_index}/{image_total} 张图片使用 {payload_type} 保存失败，尝试下一个返回载荷。",
                )
                continue
            break

    raise GatewayFatalError(f"Gateway response image payloads all failed: {'; '.join(errors)}")


def download_file(
    *,
    url: str,
    target: Path,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    image_index: int = 1,
    image_total: int = 1,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> None:
    last_error = ""

    for attempt in range(1, config.download_attempts + 1):
        raise_if_cancelled(cancel_event)
        report_status(
            status_callback,
            f"正在下载第 {image_index}/{image_total} 张图片，第 {attempt}/{config.download_attempts} 次尝试。",
        )
        result = run_command(
            [
                curl_binary(),
                "-L",
                "-sS",
                "--connect-timeout",
                str(config.connect_timeout),
                "--max-time",
                str(config.download_max_time),
                url,
                "-o",
                str(target),
            ],
            cancel_event=cancel_event,
            runner=runner,
        )
        if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
            return

        message = normalize_message(result.stderr or result.stdout or f"Failed to download {url}")
        if target.exists() and target.stat().st_size == 0:
            target.unlink()

        if not is_retryable_message(message):
            raise GatewayFatalError(message)

        last_error = message
        if attempt == config.download_attempts:
            break
        sleep_before_retry(
            attempt=attempt,
            total_attempts=config.download_attempts,
            label="下载图片",
            config=config,
            callback=status_callback,
            error=last_error,
            cancel_event=cancel_event,
        )

    raise GatewayRetryableError(
        f"图片下载在 {config.download_attempts} 次尝试后仍失败：{last_error or url}"
    )


def _collect_image_payloads(item: dict) -> list[tuple[str, str]]:
    return [
        (field, value)
        for field in IMAGE_PAYLOAD_FIELDS
        if (value := _non_empty_string(item.get(field)))
    ]


def _write_base64_image(target: Path, payload: str) -> None:
    try:
        data = base64.b64decode(payload)
    except (binascii.Error, ValueError) as exc:
        raise GatewayFatalError(f"Gateway response base64 image payload is invalid: {exc}") from exc
    if not data:
        raise GatewayFatalError("Gateway response base64 image payload is empty.")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def _write_data_url_image(target: Path, payload: str) -> None:
    if "," not in payload:
        raise GatewayFatalError("Gateway response data_url image payload is invalid.")
    _, encoded = payload.split(",", 1)
    _write_base64_image(target, encoded.strip())


def _non_empty_string(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""
