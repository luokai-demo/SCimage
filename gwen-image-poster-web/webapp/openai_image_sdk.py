from __future__ import annotations

from contextlib import ExitStack
from dataclasses import asdict, dataclass
import multiprocessing as mp
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Optional

from job_control import resolve_process_group_id, terminate_process_tree

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime
    OpenAI = None

from provider_model_catalog import normalize_openai_compatible_base_url

if TYPE_CHECKING:
    from job_control import JobRunner


StatusCallback = Optional[Callable[[str], None]]
CancelEvent = Optional[Event]
SDK_PROCESS_POLL_INTERVAL_SECONDS = 0.2


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


def _sdk_worker(
    child_conn,
    request_payload: dict,
    config_payload: dict,
) -> None:
    try:
        result = _execute_openai_sdk_request(
            OpenAISDKRequest(**request_payload),
            OpenAISDKConfig(**config_payload),
        )
        child_conn.send({"ok": result})
    except Exception as exc:  # pragma: no cover - exercised via parent integration
        child_conn.send({"error": str(exc)})
    finally:
        child_conn.close()


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

    context = mp.get_context("spawn")
    parent_conn, child_conn = context.Pipe(duplex=False)
    process = context.Process(
        target=_sdk_worker,
        args=(child_conn, asdict(request), asdict(config)),
        daemon=True,
    )
    process.start()
    child_conn.close()

    process_group_id = resolve_process_group_id(process.pid)
    if runner:
        runner.register_process(process.pid, process_group_id)

    try:
        while True:
            if cancel_event and cancel_event.is_set():
                terminate_process_tree(process.pid, process_group_id)
                process.join(timeout=1)
                raise RuntimeError("图像任务已取消。")

            if parent_conn.poll(SDK_PROCESS_POLL_INTERVAL_SECONDS):
                message = parent_conn.recv()
                if isinstance(message, dict) and "ok" in message:
                    process.join(timeout=1)
                    return message["ok"]
                if isinstance(message, dict) and message.get("error"):
                    raise RuntimeError(str(message["error"]))
                raise RuntimeError("OpenAI SDK 子进程返回了未知结果。")

            if process.exitcode is not None:
                if process.exitcode == 0 and parent_conn.poll():
                    message = parent_conn.recv()
                    if isinstance(message, dict) and "ok" in message:
                        return message["ok"]
                    if isinstance(message, dict) and message.get("error"):
                        raise RuntimeError(str(message["error"]))
                raise RuntimeError("OpenAI SDK 子进程已退出，但没有返回结果。")
    finally:
        if runner:
            runner.unregister_process(process.pid, process_group_id)
        parent_conn.close()
        if process.is_alive():
            terminate_process_tree(process.pid, process_group_id)
            process.join(timeout=1)


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
