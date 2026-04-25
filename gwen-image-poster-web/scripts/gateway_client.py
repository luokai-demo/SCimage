from __future__ import annotations

import json
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional


StatusCallback = Optional[Callable[[str], None]]

RETRYABLE_CURL_MARKERS = (
    "operation timed out",
    "timed out",
    "empty reply from server",
    "failed to connect",
    "connection reset by peer",
    "recv failure",
    "connection was reset",
    "proxy connect aborted",
)

RETRYABLE_GATEWAY_MARKERS = (
    "auth_required",
    "chat-requirements failed",
    "504 gateway time-out",
    "504 gateway timeout",
    "gateway request timed out",
    "temporarily unavailable",
    "service unavailable",
    "bad gateway",
    "too many requests",
    '"code":"429"',
    '"code":"502"',
    '"code":"503"',
    "<html",
)


class GatewayRetryableError(RuntimeError):
    pass


class GatewayFatalError(RuntimeError):
    pass


@dataclass(frozen=True)
class GatewayConfig:
    connect_timeout: int = 20
    request_max_time: int = 210
    download_max_time: int = 180
    generation_attempts: int = 4
    download_attempts: int = 3
    retry_delays: tuple[int, ...] = (8, 18, 35)


def _curl_binary() -> str:
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if not curl:
        raise GatewayFatalError("curl is not available on PATH.")
    return curl


def _parse_last_json_document(body: str) -> dict:
    decoder = json.JSONDecoder()
    index = 0
    last_obj = None

    while index < len(body):
        while index < len(body) and body[index].isspace():
            index += 1
        if index >= len(body):
            break
        obj, next_index = decoder.raw_decode(body, index)
        last_obj = obj
        index = next_index

    if not isinstance(last_obj, dict):
        raise json.JSONDecodeError("Last JSON document is not an object", body, 0)
    return last_obj


def _report_status(callback: StatusCallback, message: str) -> None:
    if callback:
        callback(message)


def _normalize_message(message: str) -> str:
    return " ".join(message.replace("\r", " ").replace("\n", " ").split()).strip()


def _is_retryable_message(message: str) -> bool:
    normalized = message.lower()
    return any(marker in normalized for marker in RETRYABLE_CURL_MARKERS + RETRYABLE_GATEWAY_MARKERS)


def _retry_delay(config: GatewayConfig, attempt: int) -> int:
    index = max(0, min(attempt - 1, len(config.retry_delays) - 1))
    return config.retry_delays[index]


def _sleep_before_retry(
    *,
    attempt: int,
    total_attempts: int,
    label: str,
    config: GatewayConfig,
    callback: StatusCallback,
    error: str,
) -> None:
    delay = _retry_delay(config, attempt)
    _report_status(
        callback,
        f"{label}第 {attempt}/{total_attempts} 次失败：{error}。{delay} 秒后自动重试。",
    )
    time.sleep(delay)


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, encoding="utf-8")


def _parse_json_response(result: subprocess.CompletedProcess[str]) -> dict:
    if result.returncode != 0:
        message = _normalize_message(result.stderr or result.stdout or "curl request failed.")
        if _is_retryable_message(message):
            raise GatewayRetryableError(message)
        raise GatewayFatalError(message)

    body = result.stdout
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        if "Extra data" in str(exc):
            try:
                return _parse_last_json_document(body)
            except json.JSONDecodeError:
                pass
        snippet = _normalize_message(body[:400])
        message = f"Gateway returned non-JSON content: {exc}. Snippet: {snippet}"
        if _is_retryable_message(message):
            raise GatewayRetryableError(message)
        raise GatewayFatalError(message)


def _post_json_once(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict,
    config: GatewayConfig,
) -> dict:
    command = [
        _curl_binary(),
        "-sS",
        url,
        "-H",
        f"Authorization: {headers['Authorization']}",
        "-H",
        f"Content-Type: {headers['Content-Type']}",
        "--connect-timeout",
        str(config.connect_timeout),
        "--max-time",
        str(config.request_max_time),
        "-d",
        json.dumps(payload, ensure_ascii=False),
    ]
    return _parse_json_response(_run_command(command))


def _post_multipart_once(
    *,
    url: str,
    headers: dict[str, str],
    fields: dict[str, object],
    file_fields: list[tuple[str, Path]],
    config: GatewayConfig,
) -> dict:
    command = [
        _curl_binary(),
        "-sS",
        url,
        "-H",
        f"Authorization: {headers['Authorization']}",
        "--connect-timeout",
        str(config.connect_timeout),
        "--max-time",
        str(config.request_max_time),
    ]
    for key, value in fields.items():
        if value is None:
            continue
        command.extend(["--form-string", f"{key}={value}"])
    for field_name, file_path in file_fields:
        field_value = f"{field_name}=@{file_path}"
        command.extend(["-F", field_value])
    return _parse_json_response(_run_command(command))


def _request_image_operation(
    *,
    url: str,
    config: GatewayConfig,
    attempt_label: str,
    final_error_label: str,
    retry_label: str,
    request_once: Callable[[], dict],
    status_callback: StatusCallback = None,
) -> dict:
    last_error = ""

    for attempt in range(1, config.generation_attempts + 1):
        _report_status(
            status_callback,
            f"{attempt_label}，第 {attempt}/{config.generation_attempts} 次尝试。",
        )
        try:
            response = request_once()
        except GatewayRetryableError as exc:
            last_error = str(exc)
            if attempt == config.generation_attempts:
                raise GatewayRetryableError(
                    f"{final_error_label}在 {config.generation_attempts} 次尝试后仍失败：{last_error}"
                ) from exc
            _sleep_before_retry(
                attempt=attempt,
                total_attempts=config.generation_attempts,
                label=retry_label,
                config=config,
                callback=status_callback,
                error=last_error,
            )
            continue

        error = response.get("error")
        if error:
            message = _normalize_message(json.dumps(error, ensure_ascii=False))
            if _is_retryable_message(message):
                last_error = message
                if attempt == config.generation_attempts:
                    raise GatewayRetryableError(
                        f"{final_error_label}在 {config.generation_attempts} 次尝试后仍返回异常：{last_error}"
                    )
                _sleep_before_retry(
                    attempt=attempt,
                    total_attempts=config.generation_attempts,
                    label=retry_label,
                    config=config,
                    callback=status_callback,
                    error=last_error,
                )
                continue
            raise GatewayFatalError(message)

        data = response.get("data")
        if isinstance(data, list) and data:
            return response

        last_error = "Gateway response did not include image data."
        if attempt == config.generation_attempts:
            raise GatewayRetryableError(
                f"{final_error_label}在 {config.generation_attempts} 次尝试后仍未返回图片数据。"
            )
        _sleep_before_retry(
            attempt=attempt,
            total_attempts=config.generation_attempts,
            label=retry_label,
            config=config,
            callback=status_callback,
            error=last_error,
        )

    raise GatewayRetryableError(last_error or f"{url} request failed.")


def request_generation(
    *,
    base_url: str,
    headers: dict[str, str],
    payload: dict,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
) -> dict:
    url = f"{base_url.rstrip('/')}/images/generations"
    return _request_image_operation(
        url=url,
        config=config,
        attempt_label="正在请求图像接口",
        final_error_label="图像接口",
        retry_label="请求接口",
        request_once=lambda: _post_json_once(url=url, headers=headers, payload=payload, config=config),
        status_callback=status_callback,
    )


def request_edit(
    *,
    base_url: str,
    headers: dict[str, str],
    fields: dict[str, object],
    image_paths: list[Path],
    config: GatewayConfig,
    status_callback: StatusCallback = None,
) -> dict:
    url = f"{base_url.rstrip('/')}/images/edits"
    return _request_image_operation(
        url=url,
        config=config,
        attempt_label="正在请求图像编辑接口",
        final_error_label="图像编辑接口",
        retry_label="请求编辑接口",
        request_once=lambda: _post_multipart_once(
            url=url,
            headers=headers,
            fields=fields,
            file_fields=[("image", path) for path in image_paths],
            config=config,
        ),
        status_callback=status_callback,
    )


def download_file(
    *,
    url: str,
    target: Path,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    image_index: int = 1,
    image_total: int = 1,
) -> None:
    last_error = ""

    for attempt in range(1, config.download_attempts + 1):
        _report_status(
            status_callback,
            f"正在下载第 {image_index}/{image_total} 张图片，第 {attempt}/{config.download_attempts} 次尝试。",
        )
        result = _run_command(
            [
                _curl_binary(),
                "-L",
                "-sS",
                "--connect-timeout",
                str(config.connect_timeout),
                "--max-time",
                str(config.download_max_time),
                url,
                "-o",
                str(target),
            ]
        )
        if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
            return

        message = _normalize_message(result.stderr or result.stdout or f"Failed to download {url}")
        if target.exists() and target.stat().st_size == 0:
            target.unlink()

        if not _is_retryable_message(message):
            raise GatewayFatalError(message)

        last_error = message
        if attempt == config.download_attempts:
            break
        _sleep_before_retry(
            attempt=attempt,
            total_attempts=config.download_attempts,
            label="下载图片",
            config=config,
            callback=status_callback,
            error=last_error,
        )

    raise GatewayRetryableError(
        f"图片下载在 {config.download_attempts} 次尝试后仍失败：{last_error or url}"
    )
