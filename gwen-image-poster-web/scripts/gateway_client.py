from __future__ import annotations

import base64
import binascii
import json
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse


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
    "ssl connection timeout",
    "ssl_error_syscall",
)

RETRYABLE_GATEWAY_MARKERS = (
    "504 gateway time-out",
    "504 gateway timeout",
    "gateway request timed out",
    "temporarily unavailable",
    "service unavailable",
    "bad gateway",
    "upstream request failed",
    "upstream_error",
    "too many requests",
    "server internal error",
    '"code":"429"',
    '"code":"500"',
    '"code":"502"',
    '"code":"503"',
    '"code": "429"',
    '"code": "500"',
    '"code": "502"',
    '"code": "503"',
    "<html",
)
HTTP_IMAGE_URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)


class GatewayRetryableError(RuntimeError):
    pass


class GatewayFatalError(RuntimeError):
    pass


IMAGE_PAYLOAD_FIELDS = ("url", "b64_json", "data_url")


@dataclass(frozen=True)
class GatewayConfig:
    connect_timeout: int = 20
    request_max_time: int = 480
    download_max_time: int = 240
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


def _non_empty_string(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


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


def _extract_image_items_from_block(block: object) -> list[dict]:
    items: list[dict] = []
    if isinstance(block, dict):
        if block.get("b64_json"):
            items.append({"b64_json": str(block["b64_json"])})
        if block.get("base64"):
            items.append({"b64_json": str(block["base64"])})
        if block.get("data_url"):
            items.append({"data_url": str(block["data_url"])})

        url = block.get("url")
        if isinstance(url, str) and url.strip():
            normalized_url = url.strip()
            if normalized_url.startswith("data:image/"):
                items.append({"data_url": normalized_url})
            else:
                items.append({"url": normalized_url})

        image_url = block.get("image_url")
        if isinstance(image_url, dict):
            nested_url = image_url.get("url")
            if isinstance(nested_url, str) and nested_url.strip():
                normalized_url = nested_url.strip()
                if normalized_url.startswith("data:image/"):
                    items.append({"data_url": normalized_url})
                else:
                    items.append({"url": normalized_url})
        elif isinstance(image_url, str) and image_url.strip():
            normalized_url = image_url.strip()
            if normalized_url.startswith("data:image/"):
                items.append({"data_url": normalized_url})
            else:
                items.append({"url": normalized_url})

        text = block.get("text")
        if isinstance(text, str) and text.strip():
            items.extend(_extract_image_items_from_content(text))

    elif isinstance(block, str):
        items.extend(_extract_image_items_from_content(block))

    return items


def _extract_image_items_from_content(content: object) -> list[dict]:
    if isinstance(content, list):
        items: list[dict] = []
        for block in content:
            items.extend(_extract_image_items_from_block(block))
        return items

    if isinstance(content, dict):
        return _extract_image_items_from_block(content)

    if not isinstance(content, str):
        return []

    stripped = content.strip()
    if not stripped:
        return []
    if stripped.startswith("data:image/"):
        return [{"data_url": stripped}]

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return [{"url": url.rstrip(".,)") } for url in HTTP_IMAGE_URL_PATTERN.findall(stripped)]
    return _extract_image_items_from_content(payload)


def _normalize_image_items(items: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("url"):
            key = ("url", str(item["url"]))
            if key not in seen:
                seen.add(key)
                normalized.append({"url": str(item["url"])})
        elif item.get("data_url"):
            key = ("data_url", str(item["data_url"]))
            if key not in seen:
                seen.add(key)
                normalized.append({"data_url": str(item["data_url"])})
        elif item.get("b64_json"):
            key = ("b64_json", str(item["b64_json"]))
            if key not in seen:
                seen.add(key)
                normalized.append({"b64_json": str(item["b64_json"])})
    return normalized


def _extract_image_data(response: dict) -> list[dict]:
    data = response.get("data")
    if isinstance(data, list):
        return _normalize_image_items(data)

    choices = response.get("choices")
    if not isinstance(choices, list):
        return []

    items = []
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        for payload_key in ("message", "delta"):
            payload = choice.get(payload_key)
            if isinstance(payload, dict):
                items.extend(_extract_image_items_from_content(payload.get("content")))
    return _normalize_image_items(items)


def _parse_sse_response(body: str) -> dict | None:
    events: list[dict] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith(":") or not line.startswith("data:"):
            continue
        payload = line.removeprefix("data:").strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)

    if not events:
        return None

    for event in reversed(events):
        if event.get("error"):
            return {"error": event["error"]}

    items: list[dict] = []
    for event in events:
        items.extend(_extract_image_data(event))
    if items:
        return {"data": _normalize_image_items(items)}

    return events[-1]


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

        sse_payload = _parse_sse_response(body)
        if sse_payload is not None:
            return sse_payload

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
        command.extend(["-F", f"{field_name}=@{file_path}"])
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

        data = _extract_image_data(response)
        if data:
            normalized_response = dict(response)
            normalized_response["data"] = data
            return normalized_response

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

def request_chat_completion_images(
    *,
    base_url: str,
    headers: dict[str, str],
    payload: dict,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
) -> dict:
    url = f"{base_url.rstrip('/')}/chat/completions"
    return _request_image_operation(
        url=url,
        config=config,
        attempt_label="正在请求图生图接口",
        final_error_label="图生图接口",
        retry_label="请求图生图接口",
        request_once=lambda: _post_json_once(url=url, headers=headers, payload=payload, config=config),
        status_callback=status_callback,
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


def save_image_item(
    *,
    item: dict,
    target: Path,
    base_url: str,
    config: GatewayConfig,
    status_callback: StatusCallback = None,
    image_index: int = 1,
    image_total: int = 1,
) -> str:
    payloads = _collect_image_payloads(item)
    if not payloads:
        raise GatewayFatalError(
            f"Gateway response item is missing supported image payload ({', '.join(IMAGE_PAYLOAD_FIELDS)})."
        )

    errors: list[str] = []
    origin = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"

    for attempt_index, (payload_type, payload) in enumerate(payloads, start=1):
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
                )
                return payload_type

            _report_status(status_callback, f"正在保存第 {image_index}/{image_total} 张图片。")
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
                _report_status(
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
