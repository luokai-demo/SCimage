from __future__ import annotations

import json
import mimetypes
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from config import GENERATED_DIR, HOST, MAX_IMAGE_COUNT, PORT, QUALITY_OPTIONS, RECENT_JOBS_LIMIT, STATIC_DIR
from generated_assets import cleanup_empty_generated_dirs, cleanup_empty_job_output_dir, remove_job_image_file, remove_job_output_dir
from request_parsing import CreateJobRequest, parse_create_job_request
from image_service import generate_images
from job_control import JobRegistry
from job_store import JobStore
from prompt_guard import validate_prompt
from provider_profiles import ProviderProfileStore
from source_images import SourceImageFile, save_source_images
from workflows import requires_source_images, validate_workflow


STORE = JobStore()
RUNNERS = JobRegistry()
PROVIDER_PROFILES = ProviderProfileStore()
TERMINAL_JOB_STATUSES = {"completed", "partial", "failed", "canceled"}


def _safe_path(root: Path, requested: str) -> Path | None:
    candidate = (root / requested.lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _is_valid_size(value: str) -> bool:
    parts = value.lower().split("x")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return False
    width, height = (int(part) for part in parts)
    return width > 0 and height > 0


def _run_job(
    job_id: str,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    source_images: list[dict],
    provider_profile,
    runner,
) -> None:
    def report(message: str) -> None:
        STORE.update_status(job_id, "running", message)

    def report_image(image: dict, completed_count: int, total_count: int) -> None:
        STORE.append_image(
            job_id,
            image,
            message=f"并行处理中，已完成 {completed_count}/{total_count} 张图片。",
        )

    report(f"任务已创建，准备并行处理 {count} 张图片。")
    try:
        result = generate_images(
            job_id=job_id,
            workflow=workflow,
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
            source_images=source_images,
            provider_profile=provider_profile,
            status_callback=report,
            image_callback=report_image,
            cancel_event=runner.cancel_event,
            runner=runner,
        )
    except Exception as exc:
        if runner.cancel_event.is_set():
            snapshot = STORE.snapshot(job_id) or {}
            STORE.cancel(job_id, snapshot.get("images", []), warnings=[str(exc)] if str(exc) else [])
        else:
            STORE.fail(job_id, str(exc))
    else:
        if result.cancelled:
            STORE.cancel(job_id, result.images, warnings=result.errors)
        else:
            STORE.complete(job_id, result.images, warnings=result.errors)
    finally:
        cleanup_empty_job_output_dir(job_id)
        RUNNERS.finish(job_id)


def _start_job_thread(
    job_id: str,
    workflow: str,
    prompt: str,
    count: int,
    quality: str,
    size: str,
    source_images: list[dict],
    provider_profile,
) -> None:
    runner = RUNNERS.create(job_id)
    thread = threading.Thread(
        target=_run_job,
        kwargs={
            "job_id": job_id,
            "workflow": workflow,
            "prompt": prompt,
            "count": count,
            "quality": quality,
            "size": size,
            "source_images": source_images,
            "provider_profile": provider_profile,
            "runner": runner,
        },
        daemon=True,
    )
    thread.start()


class ImageWorkbenchHandler(BaseHTTPRequestHandler):
    server_version = "ImageWorkbench/1.0"

    def do_GET(self) -> None:
        self._route_request(send_body=True)

    def do_HEAD(self) -> None:
        self._route_request(send_body=False)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/jobs":
            self._handle_create_job()
            return
        if parsed.path.startswith("/api/jobs/") and parsed.path.endswith("/retry"):
            job_id = parsed.path.removeprefix("/api/jobs/").removesuffix("/retry").strip("/")
            if not job_id:
                self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
                return
            self._handle_retry_job(job_id)
            return
        if parsed.path.startswith("/api/jobs/") and parsed.path.endswith("/cancel"):
            job_id = parsed.path.removeprefix("/api/jobs/").removesuffix("/cancel").strip("/")
            if not job_id:
                self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
                return
            self._handle_cancel_job(job_id)
            return
        if parsed.path == "/api/provider-profiles":
            self._handle_create_provider_profile()
            return
        if parsed.path.startswith("/api/provider-profiles/") and parsed.path.endswith("/activate"):
            profile_id = parsed.path.removeprefix("/api/provider-profiles/").removesuffix("/activate").strip("/")
            if not profile_id:
                self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
                return
            self._handle_activate_provider_profile(profile_id)
            return
        if parsed.path == "/api/maintenance/generated/cleanup-empty-dirs":
            self._handle_cleanup_empty_generated_dirs()
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/provider-profiles/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
            return

        profile_id = parsed.path.removeprefix("/api/provider-profiles/").strip("/")
        if not profile_id or "/" in profile_id:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
            return
        self._handle_update_provider_profile(profile_id)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/jobs/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
            return

        image_match = parsed.path.removeprefix("/api/jobs/").split("/")
        if len(image_match) == 3 and image_match[1] == "images":
            job_id, _, slot_value = image_match
            if not job_id or not slot_value.isdigit():
                self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
                return
            self._handle_delete_job_image(job_id, int(slot_value))
            return

        job_id = parsed.path.removeprefix("/api/jobs/").strip("/")
        if not job_id or "/" in job_id:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
            return
        self._handle_delete_job(job_id)

    def log_message(self, format: str, *args) -> None:
        return

    def _route_request(self, send_body: bool) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._serve_file(STATIC_DIR / "index.html", send_body=send_body)
            return
        if parsed.path == "/api/jobs":
            self._send_json({"jobs": STORE.list_recent(RECENT_JOBS_LIMIT)}, HTTPStatus.OK)
            return
        if parsed.path.startswith("/api/jobs/"):
            self._handle_job_status(parsed.path.removeprefix("/api/jobs/"))
            return
        if parsed.path == "/api/provider-profiles":
            self._send_json(PROVIDER_PROFILES.get_state(), HTTPStatus.OK)
            return
        if parsed.path.startswith("/generated/"):
            relative = parsed.path.removeprefix("/generated/")
            safe_path = _safe_path(GENERATED_DIR, relative)
            if safe_path is None:
                self.send_error(HTTPStatus.FORBIDDEN, "Invalid generated file path.")
                return
            self._serve_file(safe_path, send_body=send_body)
            return

        relative = parsed.path.lstrip("/")
        safe_path = _safe_path(STATIC_DIR, relative)
        if safe_path is None:
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid static file path.")
            return
        self._serve_file(safe_path, send_body=send_body)

    def _handle_create_job(self) -> None:
        request = self._read_create_job_request()
        if request is None:
            return

        try:
            workflow = validate_workflow(request.workflow)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        prompt = request.prompt
        quality = request.quality
        size = request.size
        count = request.count

        if not prompt:
            self._send_json({"error": "提示词不能为空。"}, HTTPStatus.BAD_REQUEST)
            return
        guard_message = validate_prompt(prompt)
        if guard_message:
            self._send_json({"error": guard_message}, HTTPStatus.BAD_REQUEST)
            return
        if quality not in QUALITY_OPTIONS:
            self._send_json({"error": f"质量参数无效，可选值：{', '.join(QUALITY_OPTIONS)}。"}, HTTPStatus.BAD_REQUEST)
            return
        if size != "auto" and not _is_valid_size(size):
            self._send_json({"error": "尺寸参数无效，需为 auto 或 宽x高 的格式。"}, HTTPStatus.BAD_REQUEST)
            return
        if not isinstance(count, int) or not 1 <= count <= MAX_IMAGE_COUNT:
            self._send_json({"error": f"生成数量必须在 1 到 {MAX_IMAGE_COUNT} 之间。"}, HTTPStatus.BAD_REQUEST)
            return
        if requires_source_images(workflow) and not request.source_images:
            self._send_json({"error": "图生图至少需要上传 1 张参考图。"}, HTTPStatus.BAD_REQUEST)
            return

        provider_profile = PROVIDER_PROFILES.get_active_profile()
        if provider_profile is None:
            self._send_json({"error": "请先在连接设置里保存至少一个提供方配置。"}, HTTPStatus.CONFLICT)
            return
        if not provider_profile.is_ready():
            self._send_json({"error": "当前提供方配置不完整，请补全 Base URL、API Key 和模型后再试。"}, HTTPStatus.CONFLICT)
            return

        job_id = uuid4().hex[:12]
        source_images: list[dict] = []
        if requires_source_images(workflow):
            try:
                source_images = save_source_images(
                    job_id,
                    [
                        SourceImageFile(
                            filename=item.filename,
                            content_type=item.content_type,
                            data=item.data,
                        )
                        for item in request.source_images
                    ],
                )
            except ValueError as exc:
                self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            except OSError as exc:
                self._send_json({"error": f"参考图保存失败：{exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return

        job = STORE.create(
            prompt=prompt,
            count=count,
            quality=quality,
            size=size,
            workflow=workflow,
            source_images=source_images,
            job_id=job_id,
        )
        _start_job_thread(job.id, workflow, prompt, count, quality, size, source_images, provider_profile)
        self._send_json(STORE.snapshot(job.id), HTTPStatus.ACCEPTED)

    def _handle_job_status(self, job_id: str) -> None:
        snapshot = STORE.snapshot(job_id)
        if not snapshot:
            self._send_json({"error": "任务不存在。"}, HTTPStatus.NOT_FOUND)
            return
        self._send_json(snapshot, HTTPStatus.OK)

    def _handle_cancel_job(self, job_id: str) -> None:
        snapshot = STORE.snapshot(job_id)
        if not snapshot:
            self._send_json({"error": "任务不存在。"}, HTTPStatus.NOT_FOUND)
            return
        if snapshot["status"] in TERMINAL_JOB_STATUSES:
            self._send_json(snapshot, HTTPStatus.OK)
            return

        STORE.update_status(job_id, "canceling", "正在中断任务，已启动的图片请求会尽快停止。")
        if not RUNNERS.request_cancel(job_id):
            STORE.cancel(job_id, snapshot.get("images", []), warnings=["本地后端进程已结束，任务已按中断处理。"])
        self._send_json(STORE.snapshot(job_id), HTTPStatus.OK)

    def _handle_retry_job(self, job_id: str) -> None:
        snapshot = STORE.snapshot(job_id)
        if not snapshot:
            self._send_json({"error": "任务不存在。"}, HTTPStatus.NOT_FOUND)
            return
        if snapshot["status"] not in {"failed", "canceled"}:
            self._send_json({"error": "只有失败或已中断任务才能重试。"}, HTTPStatus.CONFLICT)
            return
        if RUNNERS.get(job_id):
            self._send_json({"error": "任务仍在运行中，暂时不能重试。"}, HTTPStatus.CONFLICT)
            return

        provider_profile = PROVIDER_PROFILES.get_active_profile()
        if provider_profile is None:
            self._send_json({"error": "请先在连接设置里保存至少一个提供方配置。"}, HTTPStatus.CONFLICT)
            return
        if not provider_profile.is_ready():
            self._send_json({"error": "当前提供方配置不完整，请补全 Base URL、API Key 和模型后再试。"}, HTTPStatus.CONFLICT)
            return

        STORE.retry(job_id)
        _start_job_thread(
            job_id,
            str(snapshot.get("workflow", "generate")).strip().lower(),
            str(snapshot.get("prompt", "")).strip(),
            int(snapshot.get("count", 1)),
            str(snapshot.get("quality", "auto")).strip().lower(),
            str(snapshot.get("size", "auto")).strip().lower(),
            list(snapshot.get("source_images", [])),
            provider_profile,
        )
        self._send_json(STORE.snapshot(job_id), HTTPStatus.ACCEPTED)

    def _handle_delete_job(self, job_id: str) -> None:
        snapshot = STORE.snapshot(job_id)
        if not snapshot:
            self._send_json({"error": "任务不存在。"}, HTTPStatus.NOT_FOUND)
            return
        if snapshot["status"] not in TERMINAL_JOB_STATUSES:
            self._send_json({"error": "运行中的任务请先中断，再删除。"}, HTTPStatus.CONFLICT)
            return

        STORE.remove(job_id)
        remove_job_output_dir(job_id)
        self._send_json({"ok": True, "deleted_id": job_id}, HTTPStatus.OK)

    def _handle_delete_job_image(self, job_id: str, slot: int) -> None:
        snapshot = STORE.snapshot(job_id)
        if not snapshot:
            self._send_json({"error": "任务不存在。"}, HTTPStatus.NOT_FOUND)
            return
        if snapshot["status"] not in TERMINAL_JOB_STATUSES:
            self._send_json({"error": "运行中的任务不能删除单张图片，请先中断任务。"}, HTTPStatus.CONFLICT)
            return

        next_snapshot, removed_image, deleted_job = STORE.remove_image(job_id, slot)
        if removed_image is None:
            self._send_json({"error": "图片不存在。"}, HTTPStatus.NOT_FOUND)
            return

        remove_job_image_file(job_id, str(removed_image.get("name", "")).strip())
        if deleted_job:
            remove_job_output_dir(job_id)
        else:
            cleanup_empty_job_output_dir(job_id)
        self._send_json(
            {
                "ok": True,
                "deleted_job": deleted_job,
                "job": next_snapshot,
                "removed_image": removed_image,
            },
            HTTPStatus.OK,
        )

    def _handle_create_provider_profile(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return

        api_key = str(payload.get("api_key", "")).strip()
        if not api_key:
            source_profile_id = str(payload.get("source_profile_id", "")).strip()
            source_profile = PROVIDER_PROFILES.get_profile(source_profile_id) if source_profile_id else PROVIDER_PROFILES.get_active_profile()
            if source_profile_id and source_profile is None:
                self._send_json({"error": "源配置不存在，无法继承密钥。"}, HTTPStatus.BAD_REQUEST)
                return
            if source_profile is not None:
                api_key = source_profile.api_key

        try:
            state = PROVIDER_PROFILES.create_profile(
                name=str(payload.get("name", "")).strip(),
                base_url=str(payload.get("base_url", "")).strip(),
                model=str(payload.get("model", "")).strip(),
                api_key=api_key,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._send_json(state, HTTPStatus.CREATED)

    def _handle_update_provider_profile(self, profile_id: str) -> None:
        payload = self._read_json_body()
        if payload is None:
            return

        api_key = payload.get("api_key")
        if api_key is not None:
            api_key = str(api_key).strip()

        try:
            state = PROVIDER_PROFILES.update_profile(
                profile_id,
                name=str(payload.get("name", "")).strip(),
                base_url=str(payload.get("base_url", "")).strip(),
                model=str(payload.get("model", "")).strip(),
                api_key=api_key if api_key else None,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._send_json(state, HTTPStatus.OK)

    def _handle_activate_provider_profile(self, profile_id: str) -> None:
        try:
            state = PROVIDER_PROFILES.activate_profile(profile_id)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self._send_json(state, HTTPStatus.OK)

    def _handle_cleanup_empty_generated_dirs(self) -> None:
        removed_dirs = cleanup_empty_generated_dirs()
        self._send_json(
            {
                "ok": True,
                "removed_count": len(removed_dirs),
                "removed_dirs": [str(path.relative_to(GENERATED_DIR.parent)) for path in removed_dirs],
            },
            HTTPStatus.OK,
        )

    def _read_json_body(self) -> dict | None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            return json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except json.JSONDecodeError:
            self._send_json({"error": "请求体不是合法 JSON。"}, HTTPStatus.BAD_REQUEST)
            return None

    def _read_create_job_request(self) -> CreateJobRequest | None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            return parse_create_job_request(
                content_type=str(self.headers.get("Content-Type", "")),
                raw_body=raw_body,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return None

    def _serve_file(self, path: Path, send_body: bool = True) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found.")
            return

        mime_type, _ = mimetypes.guess_type(path.name)
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def _send_json(self, payload: dict, status: HTTPStatus) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    removed_dirs = cleanup_empty_generated_dirs()
    server = ThreadingHTTPServer((HOST, PORT), ImageWorkbenchHandler)
    print(f"Image workbench running at http://{HOST}:{PORT}")
    if removed_dirs:
        print(f"Cleaned {len(removed_dirs)} empty generated directories on startup.")
    server.serve_forever()


if __name__ == "__main__":
    main()
