from __future__ import annotations

import json
import subprocess
import sys
from contextlib import ExitStack
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Optional

from job_control import build_subprocess_spawn_kwargs, resolve_process_group_id, terminate_process_tree

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime
    OpenAI = None

from provider_model_catalog import normalize_openai_compatible_base_url


StatusCallback = Optional[Callable[[str], None]]
CancelEvent = Optional[Event]
SDK_WORKER_ARG = "--sdk-worker"
SDK_SUBPROCESS_POLL_INTERVAL_SECONDS = 0.2

if TYPE_CHECKING:
    from job_control import JobRunner


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


def _sdk_worker_command() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, SDK_WORKER_ARG]
    return [sys.executable, str(Path(__file__).resolve()), SDK_WORKER_ARG]


def _sdk_request_to_json(request: OpenAISDKRequest, config: OpenAISDKConfig) -> str:
    return json.dumps(
        {
            "request": asdict(request),
            "config": asdict(config),
        },
        ensure_ascii=False,
    )


def _sdk_request_from_json(raw_payload: str) -> tuple[OpenAISDKRequest, OpenAISDKConfig]:
    payload = json.loads(raw_payload)
    request_payload = dict(payload["request"])
    request_payload["image_paths"] = tuple(request_payload.get("image_paths") or ())
    return OpenAISDKRequest(**request_payload), OpenAISDKConfig(**dict(payload["config"]))


def _raise_worker_error(completed: subprocess.CompletedProcess[str]) -> None:
    message = (completed.stderr or completed.stdout or "").strip()
    if not message:
        message = f"OpenAI SDK worker exited with code {completed.returncode}."
    raise RuntimeError(message)


def _run_openai_sdk_subprocess(
    *,
    request: OpenAISDKRequest,
    config: OpenAISDKConfig,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    process = subprocess.Popen(
        _sdk_worker_command(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        **build_subprocess_spawn_kwargs(),
    )
    process_group_id = resolve_process_group_id(process.pid)
    if runner:
        runner.register_process(process.pid, process_group_id)

    input_payload: str | None = _sdk_request_to_json(request, config)
    try:
        while True:
            try:
                stdout, stderr = process.communicate(
                    input=input_payload,
                    timeout=SDK_SUBPROCESS_POLL_INTERVAL_SECONDS,
                )
                completed = subprocess.CompletedProcess(
                    _sdk_worker_command(),
                    process.returncode,
                    stdout,
                    stderr,
                )
                _raise_if_cancelled(cancel_event)
                if completed.returncode != 0:
                    _raise_worker_error(completed)
                return json.loads(completed.stdout)
            except subprocess.TimeoutExpired:
                input_payload = None
                if cancel_event and cancel_event.is_set():
                    terminate_process_tree(process.pid, process_group_id)
                    process.communicate()
                    raise RuntimeError("图像任务已取消。")
    finally:
        if runner:
            runner.unregister_process(process.pid, process_group_id)


def _run_sdk_request(
    *,
    request: OpenAISDKRequest,
    config: OpenAISDKConfig,
    status_message: str,
    status_callback: StatusCallback = None,
    cancel_event: CancelEvent = None,
    runner: "JobRunner" | None = None,
) -> dict:
    _report_status(status_callback, status_message)
    _raise_if_cancelled(cancel_event)
    if runner:
        result = _run_openai_sdk_subprocess(
            request=request,
            config=config,
            cancel_event=cancel_event,
            runner=runner,
        )
    else:
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
    runner: "JobRunner" | None = None,
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
        runner=runner,
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
    runner: "JobRunner" | None = None,
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
        runner=runner,
    )


def _run_worker_from_stdin() -> int:
    try:
        request, config = _sdk_request_from_json(sys.stdin.read())
        result = _execute_openai_sdk_request(request, config)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()
        return 0
    except Exception as exc:
        sys.stderr.write(str(exc).strip() or exc.__class__.__name__)
        sys.stderr.flush()
        return 1


if __name__ == "__main__":
    if SDK_WORKER_ARG in sys.argv:
        raise SystemExit(_run_worker_from_stdin())
