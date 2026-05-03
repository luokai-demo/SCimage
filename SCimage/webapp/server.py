from __future__ import annotations

import json
import mimetypes
import multiprocessing
import threading
import io
import zipfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse, urlunsplit
from uuid import uuid4

from config import (
    DEFAULT_JOBS_PAGE_SIZE,
    GENERATED_DIR,
    HOST,
    MAX_IMAGE_COUNT,
    MAX_JOBS_PAGE_SIZE,
    PORT,
    STATIC_DIR,
)
from generated_assets import (
    cleanup_empty_generated_dirs,
    cleanup_empty_job_output_dir,
    remove_job_image_file,
    remove_job_output_dir,
    remove_job_preview_file,
    job_output_dir,
)
from genealogy import build_genealogy_graph
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
from provider_model_catalog import (
    discover_provider_models,
    validate_provider_model_selection,
)
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


def _resolve_provider_api_key(
    *,
    api_key: object,
    source_profile_id: object = "",
    fallback_profile=None,
) -> str:
    normalized_api_key = str(api_key or "").strip()
    if normalized_api_key:
        return normalized_api_key

    normalized_source_profile_id = str(source_profile_id or "").strip()
    source_profile = fallback_profile
    if normalized_source_profile_id:
        source_profile = PROVIDER_PROFILES.get_profile(normalized_source_profile_id)
        if source_profile is None:
            raise ValueError("源配置不存在，无法继承密钥。")
    elif source_profile is None:
        source_profile = PROVIDER_PROFILES.get_active_profile()

    if source_profile and source_profile.api_key:
        return source_profile.api_key
    raise ValueError("API Key 不能为空。")


def _discover_models_from_payload(payload: dict, *, fallback_profile=None) -> tuple[str, list[dict]]:
    api_key = _resolve_provider_api_key(
        api_key=payload.get("api_key", ""),
        source_profile_id=payload.get("source_profile_id", ""),
        fallback_profile=fallback_profile,
    )
    normalized_base_url, models = discover_provider_models(
        base_url=str(payload.get("base_url", "")).strip(),
        api_key=api_key,
    )
    return normalized_base_url, [model.to_client_dict() for model in models]


def _validate_model_selection_from_payload(payload: dict, *, fallback_profile=None) -> str:
    api_key = _resolve_provider_api_key(
        api_key=payload.get("api_key", ""),
        source_profile_id=payload.get("source_profile_id", ""),
        fallback_profile=fallback_profile,
    )
    normalized_base_url, _ = validate_provider_model_selection(
        base_url=str(payload.get("base_url", "")).strip(),
        api_key=api_key,
        model=str(payload.get("model", "")).strip(),
    )
    return normalized_base_url


def _resolve_supports_count_parameter(value: object, *, fallback_profile=None) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return True if fallback_profile is None else bool(fallback_profile.supports_count_parameter)

    normalized = str(value).strip().lower()
    if not normalized:
        return True if fallback_profile is None else bool(fallback_profile.supports_count_parameter)
    if normalized in {"0", "false", "no", "off"}:
        return False
    return True


def _normalize_batch_selections(raw_items: object) -> list[dict]:
    if not isinstance(raw_items, list):
        return []
    selections = []
    seen = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        job_id = str(item.get("job_id") or item.get("jobId") or "").strip()
        try:
            slot = int(item.get("slot", 0))
        except (TypeError, ValueError):
            slot = 0
        key = (job_id, slot)
        if not job_id or slot <= 0 or key in seen:
            continue
        seen.add(key)
        selections.append({"job_id": job_id, "slot": slot})
    return selections


def _parse_int_query_value(query: dict[str, list[str]], key: str, *, default: int) -> int:
    values = query.get(key) or []
    if not values:
        return default
    try:
        return int(str(values[0]).strip())
    except (TypeError, ValueError):
        return default


def _build_jobs_page_payload(query: dict[str, list[str]]) -> dict:
    offset = max(0, _parse_int_query_value(query, "offset", default=0))
    limit = _parse_int_query_value(query, "limit", default=DEFAULT_JOBS_PAGE_SIZE)
    cursor = str((query.get("cursor") or [""])[0]).strip()
    limit = min(MAX_JOBS_PAGE_SIZE, max(1, limit))
    return STORE.list_page(offset=offset, limit=limit, cursor=cursor)


def _build_gallery_images_payload(query: dict[str, list[str]]) -> dict:
    limit = _parse_int_query_value(query, "limit", default=DEFAULT_JOBS_PAGE_SIZE)
    cursor = str((query.get("cursor") or [""])[0]).strip()
    sort = str((query.get("sort") or ["desc"])[0]).strip().lower()
    group_by = str((query.get("group_by") or [""])[0]).strip().lower()
    group_key = str((query.get("group_key") or [""])[0]).strip()
    limit = min(MAX_JOBS_PAGE_SIZE, max(1, limit))
    return STORE.list_gallery_images(
        limit=limit,
        cursor=cursor,
        sort_asc=sort == "asc",
        group_by=group_by,
        group_key=group_key,
    )


def _build_gallery_groups_payload(query: dict[str, list[str]]) -> dict:
    limit = _parse_int_query_value(query, "limit", default=DEFAULT_JOBS_PAGE_SIZE)
    cursor = str((query.get("cursor") or [""])[0]).strip()
    sort = str((query.get("sort") or ["desc"])[0]).strip().lower()
    group_by = str((query.get("group_by") or ["task"])[0]).strip().lower()
    limit = min(MAX_JOBS_PAGE_SIZE, max(1, limit))
    return STORE.list_gallery_groups(
        group_by="prompt" if group_by in {"prompt", "prompts"} else "task",
        limit=limit,
        cursor=cursor,
        sort_asc=sort == "asc",
    )


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
        if parsed.path == "/api/provider-profiles/models":
            self._handle_list_provider_models()
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
        if parsed.path == "/api/maintenance/database":
            payload = self._read_json_body()
            if payload is None:
                return
            self._send_json(STORE.maintain_database(vacuum=bool(payload.get("vacuum"))), HTTPStatus.OK)
            return
        if parsed.path.startswith("/api/genealogy/nodes/") and parsed.path.endswith("/position"):
            node_id = parsed.path.removeprefix("/api/genealogy/nodes/").removesuffix("/position").strip("/")
            if not node_id:
                self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
                return
            self._handle_update_genealogy_node_position(unquote(node_id))
            return
        if parsed.path == "/api/gallery/batch/delete":
            self._handle_batch_delete_images()
            return
        if parsed.path == "/api/gallery/batch/download":
            self._handle_batch_download_images()
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/workspace-state":
            self._handle_replace_workspace_state()
            return
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
        if parsed.path.startswith("/api/provider-profiles/"):
            profile_id = parsed.path.removeprefix("/api/provider-profiles/").strip("/")
            if not profile_id or "/" in profile_id:
                self.send_error(HTTPStatus.NOT_FOUND, "Unknown API path.")
                return
            self._handle_delete_provider_profile(profile_id)
            return

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
            self._send_json(_build_jobs_page_payload(parse_qs(parsed.query)), HTTPStatus.OK)
            return
        if parsed.path == "/api/gallery/images":
            self._send_json(_build_gallery_images_payload(parse_qs(parsed.query)), HTTPStatus.OK)
            return
        if parsed.path == "/api/gallery/groups":
            self._send_json(_build_gallery_groups_payload(parse_qs(parsed.query)), HTTPStatus.OK)
            return
        if parsed.path == "/api/genealogy/graph":
            self._send_json(build_genealogy_graph(STORE.list_all(), STORE.list_genealogy_positions()), HTTPStatus.OK)
            return
        if parsed.path == "/api/maintenance/database":
            self._send_json(STORE.maintain_database(vacuum=False), HTTPStatus.OK)
            return
        if parsed.path == "/api/maintenance/database/check":
            query = parse_qs(parsed.query)
            check_files = str((query.get("files") or ["0"])[0]).strip().lower() in {"1", "true", "yes"}
            self._send_json(STORE.check_database(check_files=check_files), HTTPStatus.OK)
            return
        if parsed.path.startswith("/api/jobs/"):
            self._handle_job_status(parsed.path.removeprefix("/api/jobs/"))
            return
        if parsed.path == "/api/provider-profiles":
            self._send_json(PROVIDER_PROFILES.get_state(), HTTPStatus.OK)
            return
        if parsed.path == "/api/workspace-state":
            self._send_json(WORKSPACE_STATE.get_state(), HTTPStatus.OK)
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

        remove_job_image_file(job_id, str(removed_image.get("name", "")).strip())
        preview = removed_image.get("preview")
        if isinstance(preview, dict):
            remove_job_preview_file(job_id, str(preview.get("name", "")).strip())
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

    def _handle_update_genealogy_node_position(self, node_id: str) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        try:
            position = STORE.update_genealogy_node_position(
                node_id,
                {
                    "x": payload.get("x"),
                    "y": payload.get("y"),
                },
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if not position:
            self._send_json({"error": "族谱节点不存在。"}, HTTPStatus.NOT_FOUND)
            return
        self._send_json({"ok": True, "position": position}, HTTPStatus.OK)

    def _handle_batch_delete_images(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        selections = _normalize_batch_selections(payload.get("items", []))
        if not selections:
            self._send_json({"error": "请先选择要删除的图片。"}, HTTPStatus.BAD_REQUEST)
            return
        result = STORE.remove_images(selections)
        for item in result["removed"]:
            job_id = item["job_id"]
            image = item["image"]
            remove_job_image_file(job_id, str(image.get("name", "")).strip())
            preview = image.get("preview")
            if isinstance(preview, dict):
                remove_job_preview_file(job_id, str(preview.get("name", "")).strip())
            if job_id in result["deleted_jobs"]:
                remove_job_output_dir(job_id)
            else:
                cleanup_empty_job_output_dir(job_id)
        self._send_json(
            {
                "ok": True,
                "removed_count": len(result["removed"]),
                "deleted_jobs": result["deleted_jobs"],
                "missing": result["missing"],
            },
            HTTPStatus.OK,
        )

    def _handle_batch_download_images(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return
        selections = _normalize_batch_selections(payload.get("items", []))
        if not selections:
            self._send_json({"error": "请先选择要下载的图片。"}, HTTPStatus.BAD_REQUEST)
            return
        buffer = io.BytesIO()
        added = 0
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for selection in selections:
                snapshot = STORE.snapshot(selection["job_id"])
                if not snapshot:
                    continue
                image = next(
                    (
                        item for item in snapshot.get("images", [])
                        if int(item.get("slot", 0)) == selection["slot"]
                    ),
                    None,
                )
                if not image:
                    continue
                image_name = str(image.get("name", "")).strip()
                image_path = (job_output_dir(selection["job_id"]) / image_name).resolve()
                try:
                    image_path.relative_to(job_output_dir(selection["job_id"]).resolve())
                except ValueError:
                    continue
                if not image_path.exists() or not image_path.is_file():
                    continue
                archive.write(image_path, f"{selection['job_id']}/{image_name}")
                added += 1
        if added == 0:
            self._send_json({"error": "选中的图片文件不存在，无法下载。"}, HTTPStatus.NOT_FOUND)
            return
        body = buffer.getvalue()
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

        compat_profile_id = str(payload.get("compat_profile_id", "")).strip()
        source_profile_id = str(payload.get("source_profile_id", "")).strip()
        source_profile = PROVIDER_PROFILES.get_profile(source_profile_id) if source_profile_id else PROVIDER_PROFILES.get_active_profile()
        if source_profile_id and source_profile is None:
            self._send_json({"error": "源配置不存在，无法继承密钥。"}, HTTPStatus.BAD_REQUEST)
            return
        if source_profile is not None and not compat_profile_id:
            compat_profile_id = source_profile.compat_profile_id

        try:
            api_key = _resolve_provider_api_key(
                api_key=payload.get("api_key", ""),
                source_profile_id=source_profile_id,
            )
            normalized_base_url = _validate_model_selection_from_payload(
                payload,
                fallback_profile=source_profile,
            )
            supports_count_parameter = _resolve_supports_count_parameter(
                payload.get("supports_count_parameter"),
                fallback_profile=source_profile,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return

        try:
            state = PROVIDER_PROFILES.create_profile(
                name=str(payload.get("name", "")).strip(),
                base_url=normalized_base_url,
                model=str(payload.get("model", "")).strip(),
                api_key=api_key,
                compat_profile_id=compat_profile_id,
                supports_count_parameter=supports_count_parameter,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._send_json(state, HTTPStatus.CREATED)

    def _handle_update_provider_profile(self, profile_id: str) -> None:
        payload = self._read_json_body()
        if payload is None:
            return

        current_profile = PROVIDER_PROFILES.get_profile(profile_id)
        if current_profile is None:
            self._send_json({"error": "配置不存在。"}, HTTPStatus.NOT_FOUND)
            return

        try:
            normalized_base_url = _validate_model_selection_from_payload(
                payload,
                fallback_profile=current_profile,
            )
            supports_count_parameter = _resolve_supports_count_parameter(
                payload.get("supports_count_parameter"),
                fallback_profile=current_profile,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return

        api_key = payload.get("api_key")
        if api_key is not None:
            api_key = str(api_key).strip()

        try:
            state = PROVIDER_PROFILES.update_profile(
                profile_id,
                name=str(payload.get("name", "")).strip(),
                base_url=normalized_base_url,
                model=str(payload.get("model", "")).strip(),
                compat_profile_id=str(payload.get("compat_profile_id", "")).strip(),
                api_key=api_key if api_key else None,
                supports_count_parameter=supports_count_parameter,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._send_json(state, HTTPStatus.OK)

    def _handle_list_provider_models(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return

        try:
            normalized_base_url, models = _discover_models_from_payload(payload)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_GATEWAY)
            return

        self._send_json(
            {
                "models": models,
                "normalized_base_url": normalized_base_url,
            },
            HTTPStatus.OK,
        )

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
        removed_dirs = cleanup_empty_generated_dirs()
        self._send_json(
            {
                "ok": True,
                "removed_count": len(removed_dirs),
                "removed_dirs": [str(path.relative_to(GENERATED_DIR.parent)) for path in removed_dirs],
            },
            HTTPStatus.OK,
        )

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
