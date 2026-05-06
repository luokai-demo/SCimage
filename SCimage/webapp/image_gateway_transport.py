from __future__ import annotations

import json
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Optional

from image_gateway_errors import (
    GatewayCanceledError,
    GatewayFatalError,
    GatewayRetryableError,
    is_retryable_message,
    normalize_message,
)
from image_gateway_response import extract_image_data, parse_gateway_response
from job_control import build_subprocess_spawn_kwargs, resolve_process_group_id, terminate_process_tree

if TYPE_CHECKING:
    from job_control import JobRunner


StatusCallback = Optional[Callable[[str], None]]
CancelEvent = Optional[Event]
RUN_COMMAND_POLL_INTERVAL_SECONDS = 0.2


@dataclass(frozen=True)
class GatewayConfig:
    connect_timeout: int = 20
    request_max_time: int = 480
    download_max_time: int = 240
    generation_attempts: int = 4
    download_attempts: int = 3
    retry_delays: tuple[int, ...] = (8, 18, 35)


def curl_binary() -> str:
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if not curl:
        raise GatewayFatalError("curl is not available on PATH.")
    return curl


def report_status(callback: StatusCallback, message: str) -> None:
    if callback:
        callback(message)


def raise_if_cancelled(cancel_event: CancelEvent) -> None:
    if cancel_event and cancel_event.is_set():
        raise GatewayCanceledError("图像任务已取消。")


def sleep_before_retry(
    *,
    attempt: int,
    total_attempts: int,
    label: str,
    config: GatewayConfig,
    callback: StatusCallback,
    error: str,
    cancel_event: CancelEvent = None,
) -> None:
    delay = _retry_delay(config, attempt)
    report_status(
        callback,
        f"{label}第 {attempt}/{total_attempts} 次失败：{error}。{delay} 秒后自动重试。",
    )
    sleep_with_cancel(delay, cancel_event=cancel_event)


def sleep_with_cancel(delay_seconds: float, *, cancel_event: CancelEvent = None) -> None:
    if delay_seconds <= 0:
        return
    deadline = time.monotonic() + delay_seconds
    while time.monotonic() < deadline:
        raise_if_cancelled(cancel_event)
        time.sleep(min(RUN_COMMAND_POLL_INTERVAL_SECONDS, max(0.0, deadline - time.monotonic())))


def run_command(
    command: list[str],
    *,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        **build_subprocess_spawn_kwargs(),
    )
    process_group_id = resolve_process_group_id(process.pid)
    if runner:
        runner.register_process(process.pid, process_group_id)

    try:
        while True:
            try:
                stdout, stderr = process.communicate(timeout=RUN_COMMAND_POLL_INTERVAL_SECONDS)
                return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
            except subprocess.TimeoutExpired:
                if cancel_event and cancel_event.is_set():
                    terminate_process_tree(process.pid, process_group_id)
                    process.communicate()
                    raise GatewayCanceledError("图像任务已取消。")
    finally:
        if runner:
            runner.unregister_process(process.pid, process_group_id)


def post_json_once(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict,
    config: GatewayConfig,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    command = [
        curl_binary(),
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
    return parse_gateway_response(run_command(command, cancel_event=cancel_event, runner=runner))


def post_multipart_once(
    *,
    url: str,
    headers: dict[str, str],
    fields: dict[str, object],
    file_fields: list[tuple[str, Path]],
    config: GatewayConfig,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    command = [
        curl_binary(),
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
    return parse_gateway_response(run_command(command, cancel_event=cancel_event, runner=runner))


def request_image_operation(
    *,
    url: str,
    config: GatewayConfig,
    attempt_label: str,
    final_error_label: str,
    retry_label: str,
    request_once: Callable[[], dict],
    status_callback: StatusCallback = None,
    cancel_event: CancelEvent = None,
) -> dict:
    last_error = ""

    for attempt in range(1, config.generation_attempts + 1):
        raise_if_cancelled(cancel_event)
        report_status(
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
            sleep_before_retry(
                attempt=attempt,
                total_attempts=config.generation_attempts,
                label=retry_label,
                config=config,
                callback=status_callback,
                error=last_error,
                cancel_event=cancel_event,
            )
            continue
        except GatewayCanceledError:
            raise

        error = response.get("error")
        if error:
            message = normalize_message(json.dumps(error, ensure_ascii=False))
            if is_retryable_message(message):
                last_error = message
                if attempt == config.generation_attempts:
                    raise GatewayRetryableError(
                        f"{final_error_label}在 {config.generation_attempts} 次尝试后仍返回异常：{last_error}"
                    )
                sleep_before_retry(
                    attempt=attempt,
                    total_attempts=config.generation_attempts,
                    label=retry_label,
                    config=config,
                    callback=status_callback,
                    error=last_error,
                    cancel_event=cancel_event,
                )
                continue
            raise GatewayFatalError(message)

        data = extract_image_data(response)
        if data:
            normalized_response = dict(response)
            normalized_response["data"] = data
            return normalized_response

        last_error = "Gateway response did not include image data."
        if attempt == config.generation_attempts:
            raise GatewayRetryableError(
                f"{final_error_label}在 {config.generation_attempts} 次尝试后仍未返回图片数据。"
            )
        sleep_before_retry(
            attempt=attempt,
            total_attempts=config.generation_attempts,
            label=retry_label,
            config=config,
            callback=status_callback,
            error=last_error,
            cancel_event=cancel_event,
        )

    raise GatewayRetryableError(last_error or f"{url} request failed.")


def _retry_delay(config: GatewayConfig, attempt: int) -> int:
    index = max(0, min(attempt - 1, len(config.retry_delays) - 1))
    return config.retry_delays[index]
