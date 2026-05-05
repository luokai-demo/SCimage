from __future__ import annotations

import json
import mimetypes
import multiprocessing
import re
import threading
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse, urlunsplit
from uuid import uuid4

from api_gallery import (
    batch_delete_images,
    batch_download_images_archive,
    remove_image_assets,
)
from api_genealogy import (
    build_genealogy_graph_payload,
    update_genealogy_node_positions,
)
from api_maintenance import cleanup_empty_generated_dirs_payload
from api_pagination import (
    build_gallery_groups_payload,
    build_gallery_images_payload,
    build_jobs_page_payload,
)
from api_provider_profiles import (
    create_provider_profile_payload,
    list_provider_models_payload,
    update_provider_profile_payload,
)
from config import (
    GENERATED_DIR,
    HOST,
    MAX_IMAGE_COUNT,
    PORT,
    STATIC_DIR,
)
from generated_assets import (
    cleanup_empty_job_output_dir,
    remove_job_output_dir,
)
from image_service import generate_images
from job_control import JobRegistry
from job_store import JobStore
from output_options import (
    OUTPUT_PROFILE_ASPECT_V1,
    infer_output_profile_id,
    infer_quality_from_size,
    quality_label,
    available_quality_options,
    is_supported_quality,
    is_supported_size_value,
    normalize_quality,
    normalize_size_value,
)
from prompt_guard import validate_prompt
from provider_compat import get_compat_profile
from provider_profiles import ProviderProfileStore
from request_parsing import CreateJobRequest, parse_create_job_request
from runtime_paths import ensure_runtime_data_dirs
from source_images import SourceImageFile, save_source_images
from workspace_state_store import WorkspaceStateStore
from workflows import requires_source_images, validate_workflow


STORE = JobStore()
RUNNERS = JobRegistry()
PROVIDER_PROFILES = ProviderProfileStore()
WORKSPACE_STATE = WorkspaceStateStore()
TERMINAL_JOB_STATUSES = {"completed", "partial", "failed", "canceled"}


@dataclass(frozen=True)
class ApiRoute:
    method: str
    pattern: re.Pattern[str]
    handler_name: str


API_ROUTES = (
    ApiRoute("GET", re.compile(r"^/api/jobs$"), "_route_get_jobs"),
    ApiRoute("GET", re.compile(r"^/api/gallery/images$"), "_route_get_gallery_images"),
    ApiRoute("GET", re.compile(r"^/api/gallery/groups$"), "_route_get_gallery_groups"),
    ApiRoute("GET", re.compile(r"^/api/genealogy/graph$"), "_route_get_genealogy_graph"),
    ApiRoute("GET", re.compile(r"^/api/maintenance/database$"), "_route_get_maintenance_database"),
    ApiRoute("GET", re.compile(r"^/api/maintenance/database/check$"), "_route_get_maintenance_database_check"),
    ApiRoute("GET", re.compile(r"^/api/provider-profiles$"), "_route_get_provider_profiles"),
    ApiRoute("GET", re.compile(r"^/api/workspace-state$"), "_route_get_workspace_state"),
    ApiRoute("GET", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)$"), "_route_get_job_status"),
    ApiRoute("POST", re.compile(r"^/api/jobs$"), "_route_create_job"),
    ApiRoute("POST", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)/retry$"), "_route_retry_job"),
    ApiRoute("POST", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)/cancel$"), "_route_cancel_job"),
    ApiRoute("POST", re.compile(r"^/api/provider-profiles$"), "_route_create_provider_profile"),
    ApiRoute("POST", re.compile(r"^/api/provider-profiles/models$"), "_route_list_provider_models"),
    ApiRoute("POST", re.compile(r"^/api/provider-profiles/(?P<profile_id>[^/]+)/activate$"), "_route_activate_provider_profile"),
    ApiRoute("POST", re.compile(r"^/api/maintenance/generated/cleanup-empty-dirs$"), "_route_cleanup_empty_generated_dirs"),
    ApiRoute("POST", re.compile(r"^/api/maintenance/database$"), "_route_maintain_database"),
    ApiRoute("POST", re.compile(r"^/api/genealogy/nodes/positions$"), "_route_update_genealogy_node_positions"),
    ApiRoute("POST", re.compile(r"^/api/gallery/batch/delete$"), "_route_batch_delete_images"),
    ApiRoute("POST", re.compile(r"^/api/gallery/batch/download$"), "_route_batch_download_images"),
    ApiRoute("PUT", re.compile(r"^/api/workspace-state$"), "_route_replace_workspace_state"),
    ApiRoute("PUT", re.compile(r"^/api/provider-profiles/(?P<profile_id>[^/]+)$"), "_route_update_provider_profile"),
    ApiRoute("DELETE", re.compile(r"^/api/provider-profiles/(?P<profile_id>[^/]+)$"), "_route_delete_provider_profile"),
    ApiRoute("DELETE", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)/images/(?P<slot>\d+)$"), "_route_delete_job_image"),
    ApiRoute("DELETE", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)$"), "_route_delete_job"),
)


def _safe_path(root: Path, requested: str) -> Path | None:
    candidate = (root / requested.lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _quality_options_text(output_profile_id: str) -> str:
    return "、".join(
        f"{quality_label(value, output_profile_id=output_profile_id)}（{value}）"
        for value in available_quality_options(output_profile_id=output_profile_id)
    )


def _size_options_text(output_profile_id: str) -> str:
    if output_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return "需为自动或比例值，例如 auto、9:16、16:9、1:1。"
    return "需为自动、比例值或 WxH 像素，例如 auto、9:16、720x1280、1440x2560。"


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
            message=f"接口已返回，已保存 {completed_count}/{total_count} 张图片。",
        )

    report(f"任务已创建，准备生成 {count} 张图片。")
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
    server_version = "SCimage/1.0"

    def do_GET(self) -> None:
        self._route_request(method="GET", send_body=True)

    def do_HEAD(self) -> None:
        self._route_request(method="GET", send_body=False)

    def do_POST(self) -> None:
        self._route_api_request("POST")

    def do_PUT(self) -> None:
        self._route_api_request("PUT")

    def do_DELETE(self) -> None:
        self._route_api_request("DELETE")

    def log_message(self, format: str, *args) -> None:
        return

    def _route_request(self, *, method: str, send_body: bool) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._serve_file(STATIC_DIR / "index.html", send_body=send_body)
            return
        if parsed.path.startswith("/api/"):
            self._route_api_request(method, send_body=send_body)
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

    def _route_api_request(self, method: str, *, send_body: bool = True) -> None:
        parsed = urlparse(self.path)
        for route in API_ROUTES:
            if route.method != method:
                continue
            match = route.pattern.match(parsed.path)
            if match is None:
                continue
            kwargs = {key: unquote(value) for key, value in match.groupdict().items()}
            handler = getattr(self, route.handler_name)
            handler(parsed, send_body=send_body, **kwargs)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")

    def _route_get_jobs(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_jobs_page_payload(STORE, parse_qs(parsed.query)), HTTPStatus.OK)

    def _route_get_gallery_images(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_gallery_images_payload(STORE, parse_qs(parsed.query)), HTTPStatus.OK)

    def _route_get_gallery_groups(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_gallery_groups_payload(STORE, parse_qs(parsed.query)), HTTPStatus.OK)

    def _route_get_genealogy_graph(self, parsed, *, send_body: bool) -> None:
        self._send_json(build_genealogy_graph_payload(STORE), HTTPStatus.OK)

    def _route_get_maintenance_database(self, parsed, *, send_body: bool) -> None:
        self._send_json(STORE.maintain_database(vacuum=False), HTTPStatus.OK)

    def _route_get_maintenance_database_check(self, parsed, *, send_body: bool) -> None:
        query = parse_qs(parsed.query)
        check_files = str((query.get("files") or ["0"])[0]).strip().lower() in {"1", "true", "yes"}
        self._send_json(STORE.check_database(check_files=check_files), HTTPStatus.OK)

    def _route_get_provider_profiles(self, parsed, *, send_body: bool) -> None:
        self._send_json(PROVIDER_PROFILES.get_state(), HTTPStatus.OK)

    def _route_get_workspace_state(self, parsed, *, send_body: bool) -> None:
        self._send_json(WORKSPACE_STATE.get_state(), HTTPStatus.OK)

    def _route_get_job_status(self, parsed, *, send_body: bool, job_id: str) -> None:
        self._handle_job_status(job_id)

    def _route_create_job(self, parsed, *, send_body: bool) -> None:
        self._handle_create_job()

    def _route_retry_job(self, parsed, *, send_body: bool, job_id: str) -> None:
        self._handle_retry_job(job_id)

    def _route_cancel_job(self, parsed, *, send_body: bool, job_id: str) -> None:
        self._handle_cancel_job(job_id)

    def _route_create_provider_profile(self, parsed, *, send_body: bool) -> None:
        self._handle_create_provider_profile()

    def _route_list_provider_models(self, parsed, *, send_body: bool) -> None:
        self._handle_list_provider_models()

    def _route_activate_provider_profile(self, parsed, *, send_body: bool, profile_id: str) -> None:
        self._handle_activate_provider_profile(profile_id)

    def _route_cleanup_empty_generated_dirs(self, parsed, *, send_body: bool) -> None:
        self._handle_cleanup_empty_generated_dirs()

    def _route_maintain_database(self, parsed, *, send_body: bool) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        self._send_json(STORE.maintain_database(vacuum=bool(payload.get("vacuum"))), HTTPStatus.OK)

    def _route_update_genealogy_node_positions(self, parsed, *, send_body: bool) -> None:
        self._handle_update_genealogy_node_positions()

    def _route_batch_delete_images(self, parsed, *, send_body: bool) -> None:
        self._handle_batch_delete_images()

    def _route_batch_download_images(self, parsed, *, send_body: bool) -> None:
        self._handle_batch_download_images()

    def _route_replace_workspace_state(self, parsed, *, send_body: bool) -> None:
        self._handle_replace_workspace_state()

    def _route_update_provider_profile(self, parsed, *, send_body: bool, profile_id: str) -> None:
        self._handle_update_provider_profile(profile_id)

    def _route_delete_provider_profile(self, parsed, *, send_body: bool, profile_id: str) -> None:
        self._handle_delete_provider_profile(profile_id)

    def _route_delete_job_image(self, parsed, *, send_body: bool, job_id: str, slot: str) -> None:
        self._handle_delete_job_image(job_id, int(slot))

    def _route_delete_job(self, parsed, *, send_body: bool, job_id: str) -> None:
        self._handle_delete_job(job_id)

    def _handle_create_job(self) -> None:
        request = self._read_create_job_request()
        if request is None:
            return

        provider_profile = PROVIDER_PROFILES.get_active_profile()
        if provider_profile is None:
            self._send_json({"error": "请先在连接设置里保存至少一个提供方配置。"}, HTTPStatus.CONFLICT)
            return
        if not provider_profile.is_ready():
            self._send_json({"error": "当前提供方配置不完整，请补全 Base URL、API Key 和模型后再试。"}, HTTPStatus.CONFLICT)
            return

        compat_profile = provider_profile.compat_profile()
        output_profile_id = compat_profile.output_profile_id

        try:
            workflow = validate_workflow(request.workflow)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        prompt = request.prompt
        quality = normalize_quality(request.quality, fallback="", output_profile_id=output_profile_id)
        size = str(request.size or "").strip().lower()
        count = request.count

        if not prompt:
            self._send_json({"error": "提示词不能为空。"}, HTTPStatus.BAD_REQUEST)
            return
        guard_message = validate_prompt(prompt)
        if guard_message:
            self._send_json({"error": guard_message}, HTTPStatus.BAD_REQUEST)
            return
        if not is_supported_quality(quality, output_profile_id=output_profile_id):
            self._send_json(
                {"error": f"质量参数无效，可选值：{_quality_options_text(output_profile_id)}。"},
                HTTPStatus.BAD_REQUEST,
            )
            return
        if not is_supported_size_value(size, output_profile_id=output_profile_id):
            self._send_json(
                {"error": f"尺寸参数无效，可选值：{_size_options_text(output_profile_id)}。"},
                HTTPStatus.BAD_REQUEST,
            )
            return
        size = normalize_size_value(size, quality=quality, output_profile_id=output_profile_id)
        quality = infer_quality_from_size(size, fallback=quality, output_profile_id=output_profile_id)
        if not isinstance(count, int) or not 1 <= count <= MAX_IMAGE_COUNT:
            self._send_json({"error": f"生成数量必须在 1 到 {MAX_IMAGE_COUNT} 之间。"}, HTTPStatus.BAD_REQUEST)
            return
        if workflow == "image-to-image" and not compat_profile.supports_image_to_image:
            self._send_json({"error": "当前提供方配置不支持图生图，请切换兼容模式后再试。"}, HTTPStatus.CONFLICT)
            return
        if requires_source_images(workflow) and not request.source_images:
            self._send_json({"error": "图生图至少需要上传 1 张参考图。"}, HTTPStatus.BAD_REQUEST)
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
                            origin=item.origin,
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
            model=provider_profile.model,
            compat_profile_id=compat_profile.id,
            output_profile_id=output_profile_id,
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

        STORE.cancel(job_id, snapshot.get("images", []))
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

        job_output_profile_id = str(
            snapshot.get("output_profile_id")
            or infer_output_profile_id(snapshot.get("quality"), snapshot.get("size"))
        ).strip()
        job_compat_profile = get_compat_profile(snapshot.get("compat_profile_id"))
        active_compat_profile = provider_profile.compat_profile()
        if job_compat_profile.id != active_compat_profile.id:
            self._send_json(
                {
                    "error": f"原任务使用“{job_compat_profile.label}”，当前生效配置是“{active_compat_profile.label}”，请切换到一致的兼容模式后再重试。"
                },
                HTTPStatus.CONFLICT,
            )
            return

        STORE.retry(job_id)
        retry_quality = normalize_quality(
            snapshot.get("quality"),
            output_profile_id=job_output_profile_id,
        )
        retry_size = normalize_size_value(
            snapshot.get("size"),
            quality=retry_quality,
            output_profile_id=job_output_profile_id,
        )
        retry_quality = infer_quality_from_size(
            retry_size,
            fallback=retry_quality,
            output_profile_id=job_output_profile_id,
        )
        _start_job_thread(
            job_id,
            str(snapshot.get("workflow", "generate")).strip().lower(),
            str(snapshot.get("prompt", "")).strip(),
            int(snapshot.get("count", 1)),
            retry_quality,
            retry_size,
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

        remove_image_assets(job_id, removed_image, deleted_job=deleted_job)
        self._send_json(
            {
                "ok": True,
                "deleted_job": deleted_job,
                "job": next_snapshot,
                "removed_image": removed_image,
            },
            HTTPStatus.OK,
        )

    def _handle_update_genealogy_node_positions(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            result = update_genealogy_node_positions(STORE, payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except KeyError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self._send_json(result, HTTPStatus.OK)

    def _handle_batch_delete_images(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            result = batch_delete_images(STORE, payload.get("items", []))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._send_json(result, HTTPStatus.OK)

    def _handle_batch_download_images(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            body = batch_download_images_archive(STORE, payload.get("items", []))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except FileNotFoundError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", 'attachment; filename="SCimage-selected-images.zip"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_create_provider_profile(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            state = create_provider_profile_payload(PROVIDER_PROFILES, payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return
        self._send_json(state, HTTPStatus.CREATED)

    def _handle_update_provider_profile(self, profile_id: str) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            state = update_provider_profile_payload(PROVIDER_PROFILES, profile_id, payload)
        except KeyError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return
        self._send_json(state, HTTPStatus.OK)

    def _handle_list_provider_models(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return

        try:
            result = list_provider_models_payload(PROVIDER_PROFILES, payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return

        self._send_json(result, HTTPStatus.OK)

    def _handle_activate_provider_profile(self, profile_id: str) -> None:
        try:
            state = PROVIDER_PROFILES.activate_profile(profile_id)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self._send_json(state, HTTPStatus.OK)

    def _handle_delete_provider_profile(self, profile_id: str) -> None:
        try:
            state = PROVIDER_PROFILES.delete_profile(profile_id)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        self._send_json(state, HTTPStatus.OK)

    def _handle_cleanup_empty_generated_dirs(self) -> None:
        self._send_json(cleanup_empty_generated_dirs_payload(), HTTPStatus.OK)

    def _handle_replace_workspace_state(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        self._send_json(WORKSPACE_STATE.replace_state(payload), HTTPStatus.OK)

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


def prepare_runtime_environment() -> list[Path]:
    ensure_runtime_data_dirs()
    return []


def create_server(*, host: str = HOST, port: int = PORT) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), ImageWorkbenchHandler)


def serve_server(server: ThreadingHTTPServer) -> None:
    server.serve_forever()


def shutdown_server(server: ThreadingHTTPServer) -> None:
    server.shutdown()
    server.server_close()


def main() -> None:
    multiprocessing.freeze_support()
    removed_dirs = prepare_runtime_environment()
    server = create_server(host=HOST, port=PORT)
    server_url = urlunsplit(("http", f"{HOST}:{PORT}", "", "", ""))
    print(f"SCimage running at {server_url}")
    if removed_dirs:
        print(f"Cleaned {len(removed_dirs)} empty generated directories on startup.")
    try:
        serve_server(server)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
