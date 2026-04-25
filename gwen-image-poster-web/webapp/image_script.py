from __future__ import annotations

from dataclasses import dataclass
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from threading import Event
from typing import TYPE_CHECKING, Callable, Optional

from config import SCRIPT_PATH
from generated_assets import OUTPUT_IMAGE_EXTENSIONS
from output_options import resolve_api_size_value

if TYPE_CHECKING:
    from job_control import JobRunner


StatusCallback = Optional[Callable[[str], None]]


@dataclass(frozen=True)
class ImageScriptRequest:
    workflow: str
    prompt: str
    count: int
    quality: str
    size: str
    output_dir: Path
    base_url: str
    model: str
    source_image_paths: list[Path]


class JobCanceled(RuntimeError):
    pass


def build_image_script_command(request: ImageScriptRequest) -> list[str]:
    command = [
        sys.executable,
        str(SCRIPT_PATH),
        "--workflow",
        request.workflow,
        "--prompt",
        request.prompt,
        "--out-dir",
        str(request.output_dir),
        "--base-url",
        request.base_url,
        "--model",
        request.model,
        "--n",
        str(request.count),
        "--size",
        resolve_api_size_value(request.size, request.quality),
    ]
    for source_image_path in request.source_image_paths:
        command.extend(["--source-image", str(source_image_path)])
    return command


def run_image_script(
    command: list[str],
    *,
    status_callback: StatusCallback = None,
    cancel_event: Event | None = None,
    env: dict[str, str] | None = None,
    runner: "JobRunner" | None = None,
) -> subprocess.CompletedProcess[str]:
    if cancel_event and cancel_event.is_set():
        raise JobCanceled("任务已中断。")

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
        env=env,
        start_new_session=True,
    )
    process_group_id = _process_group_id(process)
    if runner:
        runner.register_process(process.pid, process_group_id)

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    stdout_thread = threading.Thread(
        target=_drain_stream,
        args=(process.stdout, stdout_lines),
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=_drain_stream,
        args=(process.stderr, stderr_lines),
        kwargs={"status_callback": status_callback},
        daemon=True,
    )

    stdout_thread.start()
    stderr_thread.start()

    try:
        while process.poll() is None:
            if cancel_event and cancel_event.is_set():
                _terminate_process(process)
                stdout_thread.join()
                stderr_thread.join()
                raise JobCanceled("任务已中断。")
            time.sleep(0.12)

        returncode = process.wait()
        stdout_thread.join()
        stderr_thread.join()

        return subprocess.CompletedProcess(
            args=command,
            returncode=returncode,
            stdout="\n".join(stdout_lines),
            stderr="\n".join(stderr_lines),
        )
    finally:
        if runner:
            runner.unregister_process(process.pid, process_group_id)


def normalize_script_error(message: str) -> str:
    lines = [line.strip() for line in message.splitlines() if line.strip()]
    relevant_lines = [line for line in lines if not line.startswith("STATUS:")]
    cleaned = (relevant_lines[-1] if relevant_lines else message).strip()
    if cleaned.startswith("Error:"):
        cleaned = cleaned.removeprefix("Error:").strip()
    normalized = cleaned.lower()

    if "在 4 次尝试后仍返回异常" in cleaned or "在 4 次尝试后仍失败" in cleaned:
        if "auth_required" in normalized or "chat-requirements failed" in normalized:
            return "图像服务已经自动重试多次，但上游仍返回 auth_required / chat-requirements failed。建议稍后再试。"
    if "auth_required" in normalized or "chat-requirements failed" in normalized:
        return "上游图像服务当前未通过权限校验，接口返回了 auth_required / chat-requirements failed。"
    if "504 gateway time-out" in normalized or "504 gateway timeout" in normalized or "gateway request timed out" in normalized:
        return "图像服务超时了。脚本已经自动重试过，建议稍后再试。"
    if "operation timed out" in normalized or "timed out" in normalized:
        return "图像服务长时间没有返回结果。脚本已经自动重试过，建议稍后再试。"
    if "gateway returned invalid response" in normalized or "gateway returned non-json content" in normalized or "<html" in normalized:
        return "图像服务返回了异常页面，脚本已经自动重试过，通常是上游超时或临时故障。"
    if "429" in normalized:
        return "图像服务当前请求过多，脚本已经自动重试过，请稍后再试。"
    if "502" in normalized or "503" in normalized or "temporarily unavailable" in normalized:
        return "图像服务暂时不可用，脚本已经自动重试过，请稍后再试。"

    return cleaned or "脚本执行失败。"


def resolve_output_paths(result: subprocess.CompletedProcess[str], output_dir: Path) -> list[Path]:
    paths = _paths_from_stdout(result.stdout, output_dir)
    if paths:
        return paths
    return _paths_from_output_dir(output_dir)


def _forward_script_status(line: str, status_callback: StatusCallback) -> None:
    if not status_callback:
        return
    if line.startswith("STATUS:"):
        status_callback(line.removeprefix("STATUS:").strip())


def _drain_stream(
    stream,
    sink: list[str],
    *,
    status_callback: StatusCallback = None,
) -> None:
    try:
        for raw_line in iter(stream.readline, ""):
            line = raw_line.rstrip("\n")
            sink.append(line)
            _forward_script_status(line, status_callback)
    finally:
        stream.close()


def _process_group_id(process: subprocess.Popen[str]) -> int | None:
    try:
        return os.getpgid(process.pid)
    except OSError:
        return None


def _terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    try:
        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        pass
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        process.kill()
        process.wait(timeout=3)


def _paths_from_stdout(stdout: str, output_dir: Path) -> list[Path]:
    paths: list[Path] = []
    seen: set[Path] = set()
    for line in stdout.splitlines():
        raw_path = line.strip()
        if not raw_path:
            continue
        path = Path(raw_path)
        if path.exists() and path.is_file() and _is_output_image(path, output_dir):
            resolved = path.resolve()
            if resolved not in seen:
                seen.add(resolved)
                paths.append(path)
    return paths


def _paths_from_output_dir(output_dir: Path) -> list[Path]:
    if not output_dir.exists():
        return []
    return sorted(
        [
            path
            for path in output_dir.iterdir()
            if path.is_file() and path.suffix.lower() in OUTPUT_IMAGE_EXTENSIONS
        ],
        key=lambda path: path.name,
    )


def _is_output_image(path: Path, output_dir: Path) -> bool:
    if path.suffix.lower() not in OUTPUT_IMAGE_EXTENSIONS:
        return False
    try:
        path.resolve().relative_to(output_dir.resolve())
    except ValueError:
        return False
    return path.parent.resolve() == output_dir.resolve()
