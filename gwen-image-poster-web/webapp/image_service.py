from __future__ import annotations

from concurrent.futures import CancelledError, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import os
import signal
import time
import subprocess
import sys
import threading
from threading import Event
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Dict, List

from config import MAX_PARALLEL_IMAGE_WORKERS, SCRIPT_PATH
from generated_assets import recreate_job_output_dir
from output_options import normalize_quality, normalize_size_value
from provider_profiles import ProviderProfile
from source_images import resolve_source_image_paths
from workflows import requires_source_images

if TYPE_CHECKING:
    from job_control import JobRunner


@dataclass(frozen=True)
class GenerationResult:
    images: List[Dict[str, str]]
    errors: List[str]
    cancelled: bool = False


class JobCanceled(RuntimeError):
    pass


def _build_command(
    workflow: str,
    prompt: str,
    output_path: Path,
    quality: str,
    size: str,
    *,
    base_url: str,
    model: str,
    source_image_paths: List[Path] | None = None,
) -> List[str]:
    command = [
        sys.executable,
        str(SCRIPT_PATH),
        "--workflow",
        workflow,
        "--prompt",
        prompt,
        "--out",
        str(output_path),
        "--base-url",
        base_url,
        "--model",
        model,
    ]
    command.extend(["--quality", normalize_quality(quality)])
    command.extend(["--size", normalize_size_value(size)])
    for source_image_path in source_image_paths or []:
        command.extend(["--source-image", str(source_image_path)])
    return command


def _forward_script_status(line: str, status_callback: Callable[[str], None] | None) -> None:
    if not status_callback:
        return
    if line.startswith("STATUS:"):
        status_callback(line.removeprefix("STATUS:").strip())


def _drain_stream(
    stream,
    sink: List[str],
    *,
    status_callback: Callable[[str], None] | None = None,
) -> None:
    try:
        for raw_line in iter(stream.readline, ""):
            line = raw_line.rstrip("\n")
            sink.append(line)
            _forward_script_status(line, status_callback)
    finally:
        stream.close()


def _run_script(
    command: List[str],
    status_callback: Callable[[str], None] | None = None,
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
    process_group_id = None
    try:
        process_group_id = os.getpgid(process.pid)
    except OSError:
        process_group_id = None
    if runner:
        runner.register_process(process.pid, process_group_id)

    stdout_lines: List[str] = []
    stderr_lines: List[str] = []

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


def _normalize_script_error(message: str) -> str:
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


def _resolve_output_path(result: subprocess.CompletedProcess[str], output_path: Path) -> Path | None:
    if output_path.exists():
        return output_path

    stdout_paths = [Path(line.strip()) for line in result.stdout.splitlines() if line.strip()]
    for path in stdout_paths:
        if path.exists():
            return path
    return None


def _build_image_payload(job_id: str, file_path: Path, slot: int) -> Dict[str, str]:
    return {
        "slot": slot,
        "name": file_path.name,
        "path": str(file_path),
        "url": f"/generated/{job_id}/{file_path.name}",
    }


def _run_single_image(
    *,
    job_id: str,
    workflow: str,
    prompt: str,
    slot: int,
    quality: str,
    size: str,
    output_dir: Path,
    provider_profile: ProviderProfile,
    source_image_paths: List[Path] | None = None,
    cancel_event: Event | None = None,
    runner: "JobRunner" | None = None,
) -> Dict[str, str]:
    if cancel_event and cancel_event.is_set():
        raise JobCanceled("任务已中断。")

    output_path = output_dir / f"image-{slot}.png"
    command = _build_command(
        workflow=workflow,
        prompt=prompt,
        output_path=output_path,
        quality=quality,
        size=size,
        base_url=provider_profile.base_url,
        model=provider_profile.model,
        source_image_paths=source_image_paths,
    )
    script_env = os.environ.copy()
    script_env["IMAGE_API_BASE_URL"] = provider_profile.base_url
    script_env["IMAGE_API_KEY"] = provider_profile.api_key
    script_env["IMAGE_API_MODEL"] = provider_profile.model
    result = _run_script(command, cancel_event=cancel_event, env=script_env, runner=runner)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        raw_message = stderr or stdout or "脚本执行失败。"
        raise RuntimeError(_normalize_script_error(raw_message))

    resolved_path = _resolve_output_path(result, output_path)
    if resolved_path is None:
        raise RuntimeError("脚本执行完成，但没有发现生成图片。")

    return _build_image_payload(job_id=job_id, file_path=resolved_path, slot=slot)


def generate_images(
    job_id: str,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    source_images: List[Dict[str, str]],
    provider_profile: ProviderProfile,
    status_callback: Callable[[str], None] | None = None,
    image_callback: Callable[[Dict[str, str], int, int], None] | None = None,
    cancel_event: Event | None = None,
    runner: "JobRunner" | None = None,
) -> GenerationResult:
    if cancel_event and cancel_event.is_set():
        return GenerationResult(images=[], errors=[], cancelled=True)

    source_image_paths = resolve_source_image_paths(source_images) if requires_source_images(workflow) else []
    output_dir = recreate_job_output_dir(job_id)

    workers = min(max(1, count), MAX_PARALLEL_IMAGE_WORKERS)
    if status_callback:
        status_callback(
            f"正在调用图像脚本，目标 {count} 张，当前 {workers} 路并行，模型 {provider_profile.model}。"
        )

    images: List[Dict[str, str]] = []
    errors: List[str] = []

    # 每张图拆成一次独立请求，避免上游一次只回 1 张时提前结束。
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_map = {
            executor.submit(
                _run_single_image,
                job_id=job_id,
                workflow=workflow,
                prompt=prompt,
                slot=slot,
                quality=quality,
                size=size,
                output_dir=output_dir,
                provider_profile=provider_profile,
                source_image_paths=source_image_paths,
                cancel_event=cancel_event,
                runner=runner,
            ): slot
            for slot in range(1, count + 1)
        }

        for future in as_completed(future_map):
            slot = future_map[future]
            try:
                image = future.result()
            except (CancelledError, JobCanceled):
                pass
            except Exception as exc:
                errors.append(f"第 {slot} 张失败：{exc}")
            else:
                images.append(image)
                images.sort(key=lambda item: item.get("slot", 0))
                if image_callback:
                    image_callback(image, len(images), count)

            if cancel_event and cancel_event.is_set():
                for pending in future_map:
                    pending.cancel()
                continue

            if status_callback:
                pending = max(0, count - len(images) - len(errors))
                if errors:
                    status_callback(
                        f"并行处理中，已完成 {len(images)}/{count} 张，失败 {len(errors)} 张，剩余 {pending} 张。"
                    )
                else:
                    status_callback(f"并行处理中，已完成 {len(images)}/{count} 张，剩余 {pending} 张。")

    if cancel_event and cancel_event.is_set():
        return GenerationResult(images=images, errors=errors, cancelled=True)

    if not images:
        raise RuntimeError(errors[0] if errors else "脚本执行完成，但没有发现生成图片。")

    return GenerationResult(images=images, errors=errors)
