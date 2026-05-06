from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus
from uuid import uuid4

from generated_assets import remove_job_output_dir
from job_execution import JobExecutionQueue, JobExecutionRequest, TERMINAL_JOB_STATUSES
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
from provider_profiles import ProviderProfile, ProviderProfileStore
from request_parsing import CreateJobRequest, UploadedFile
from source_images import SourceImageFile, save_source_images
from workflows import requires_source_images, validate_workflow


@dataclass(frozen=True)
class ApiJobResult:
    payload: dict
    status: HTTPStatus


def _error(message: str, status: HTTPStatus) -> ApiJobResult:
    return ApiJobResult({"error": message}, status)


def _snapshot_result(store: JobStore, job_id: str, status: HTTPStatus) -> ApiJobResult:
    return ApiJobResult(store.snapshot(job_id) or {}, status)


def create_job_payload(
    *,
    store: JobStore,
    provider_profiles: ProviderProfileStore,
    execution_queue: JobExecutionQueue,
    request: CreateJobRequest,
    max_image_count: int,
) -> ApiJobResult:
    provider_profile_result = _get_ready_provider_profile(provider_profiles)
    if isinstance(provider_profile_result, ApiJobResult):
        return provider_profile_result
    provider_profile = provider_profile_result

    normalized_result = _normalize_create_job_request(
        request,
        provider_profile=provider_profile,
        max_image_count=max_image_count,
    )
    if isinstance(normalized_result, ApiJobResult):
        return normalized_result
    normalized = normalized_result

    job_id = uuid4().hex[:12]
    source_images_result = _save_source_images_for_request(
        job_id=job_id,
        workflow=normalized["workflow"],
        uploaded_files=request.source_images,
    )
    if isinstance(source_images_result, ApiJobResult):
        return source_images_result
    source_images = source_images_result

    compat_profile = provider_profile.compat_profile()
    job = store.create(
        prompt=normalized["prompt"],
        count=normalized["count"],
        quality=normalized["quality"],
        size=normalized["size"],
        model=provider_profile.model,
        compat_profile_id=compat_profile.id,
        output_profile_id=compat_profile.output_profile_id,
        workflow=normalized["workflow"],
        source_images=source_images,
        job_id=job_id,
    )
    execution_queue.enqueue(
        JobExecutionRequest(
            job_id=job.id,
            workflow=normalized["workflow"],
            prompt=normalized["prompt"],
            count=normalized["count"],
            quality=normalized["quality"],
            size=normalized["size"],
            source_images=source_images,
            provider_profile=provider_profile,
        )
    )
    return _snapshot_result(store, job.id, HTTPStatus.ACCEPTED)


def get_job_status_payload(store: JobStore, job_id: str) -> ApiJobResult:
    snapshot = store.snapshot(job_id)
    if not snapshot:
        return _error("任务不存在。", HTTPStatus.NOT_FOUND)
    return ApiJobResult(snapshot, HTTPStatus.OK)


def cancel_job_payload(
    *,
    store: JobStore,
    execution_queue: JobExecutionQueue,
    job_id: str,
) -> ApiJobResult:
    snapshot = store.snapshot(job_id)
    if not snapshot:
        return _error("任务不存在。", HTTPStatus.NOT_FOUND)
    if snapshot["status"] in TERMINAL_JOB_STATUSES:
        return ApiJobResult(snapshot, HTTPStatus.OK)

    store.cancel(job_id, snapshot.get("images", []))
    if not execution_queue.cancel(job_id):
        store.cancel(job_id, snapshot.get("images", []), warnings=["本地后端进程已结束，任务已按中断处理。"])
    return _snapshot_result(store, job_id, HTTPStatus.OK)


def retry_job_payload(
    *,
    store: JobStore,
    provider_profiles: ProviderProfileStore,
    execution_queue: JobExecutionQueue,
    job_id: str,
) -> ApiJobResult:
    snapshot = store.snapshot(job_id)
    if not snapshot:
        return _error("任务不存在。", HTTPStatus.NOT_FOUND)
    if snapshot["status"] not in {"failed", "canceled"}:
        return _error("只有失败或已中断任务才能重试。", HTTPStatus.CONFLICT)
    if execution_queue.is_running(job_id):
        return _error("任务仍在运行中，暂时不能重试。", HTTPStatus.CONFLICT)

    provider_profile_result = _get_ready_provider_profile(provider_profiles)
    if isinstance(provider_profile_result, ApiJobResult):
        return provider_profile_result
    provider_profile = provider_profile_result

    job_output_profile_id = str(
        snapshot.get("output_profile_id")
        or infer_output_profile_id(snapshot.get("quality"), snapshot.get("size"))
    ).strip()
    job_compat_profile = get_compat_profile(snapshot.get("compat_profile_id"))
    active_compat_profile = provider_profile.compat_profile()
    if job_compat_profile.id != active_compat_profile.id:
        return _error(
            f"原任务使用“{job_compat_profile.label}”，当前生效配置是“{active_compat_profile.label}”，请切换到一致的兼容模式后再重试。",
            HTTPStatus.CONFLICT,
        )

    store.retry(job_id)
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
    execution_queue.enqueue(
        JobExecutionRequest(
            job_id=job_id,
            workflow=str(snapshot.get("workflow", "generate")).strip().lower(),
            prompt=str(snapshot.get("prompt", "")).strip(),
            count=int(snapshot.get("count", 1)),
            quality=retry_quality,
            size=retry_size,
            source_images=list(snapshot.get("source_images", [])),
            provider_profile=provider_profile,
        )
    )
    return _snapshot_result(store, job_id, HTTPStatus.ACCEPTED)


def delete_job_payload(store: JobStore, job_id: str) -> ApiJobResult:
    snapshot = store.snapshot(job_id)
    if not snapshot:
        return _error("任务不存在。", HTTPStatus.NOT_FOUND)
    if snapshot["status"] not in TERMINAL_JOB_STATUSES:
        return _error("运行中的任务请先中断，再删除。", HTTPStatus.CONFLICT)

    store.remove(job_id)
    remove_job_output_dir(job_id)
    return ApiJobResult({"ok": True, "deleted_id": job_id}, HTTPStatus.OK)


def _get_ready_provider_profile(provider_profiles: ProviderProfileStore) -> ProviderProfile | ApiJobResult:
    provider_profile = provider_profiles.get_active_profile()
    if provider_profile is None:
        return _error("请先在连接设置里保存至少一个提供方配置。", HTTPStatus.CONFLICT)
    if not provider_profile.is_ready():
        return _error("当前提供方配置不完整，请补全 Base URL、API Key 和模型后再试。", HTTPStatus.CONFLICT)
    return provider_profile


def _normalize_create_job_request(
    request: CreateJobRequest,
    *,
    provider_profile: ProviderProfile,
    max_image_count: int,
) -> dict | ApiJobResult:
    compat_profile = provider_profile.compat_profile()
    output_profile_id = compat_profile.output_profile_id

    try:
        workflow = validate_workflow(request.workflow)
    except ValueError as exc:
        return _error(str(exc), HTTPStatus.BAD_REQUEST)

    prompt = request.prompt
    quality = normalize_quality(request.quality, fallback="", output_profile_id=output_profile_id)
    size = str(request.size or "").strip().lower()
    count = request.count

    if not prompt:
        return _error("提示词不能为空。", HTTPStatus.BAD_REQUEST)
    guard_message = validate_prompt(prompt)
    if guard_message:
        return _error(guard_message, HTTPStatus.BAD_REQUEST)
    if not is_supported_quality(quality, output_profile_id=output_profile_id):
        return _error(
            f"质量参数无效，可选值：{_quality_options_text(output_profile_id)}。",
            HTTPStatus.BAD_REQUEST,
        )
    if not is_supported_size_value(size, output_profile_id=output_profile_id):
        return _error(
            f"尺寸参数无效，可选值：{_size_options_text(output_profile_id)}。",
            HTTPStatus.BAD_REQUEST,
        )
    size = normalize_size_value(size, quality=quality, output_profile_id=output_profile_id)
    quality = infer_quality_from_size(size, fallback=quality, output_profile_id=output_profile_id)
    if not isinstance(count, int) or not 1 <= count <= max_image_count:
        return _error(f"生成数量必须在 1 到 {max_image_count} 之间。", HTTPStatus.BAD_REQUEST)
    if workflow == "image-to-image" and not compat_profile.supports_image_to_image:
        return _error("当前提供方配置不支持图生图，请切换兼容模式后再试。", HTTPStatus.CONFLICT)
    if requires_source_images(workflow) and not request.source_images:
        return _error("图生图至少需要上传 1 张参考图。", HTTPStatus.BAD_REQUEST)

    return {
        "workflow": workflow,
        "prompt": prompt,
        "quality": quality,
        "size": size,
        "count": count,
    }


def _save_source_images_for_request(
    *,
    job_id: str,
    workflow: str,
    uploaded_files: tuple[UploadedFile, ...],
) -> list[dict] | ApiJobResult:
    if not requires_source_images(workflow):
        return []
    try:
        return save_source_images(
            job_id,
            [
                SourceImageFile(
                    filename=item.filename,
                    content_type=item.content_type,
                    data=item.data,
                    origin=item.origin,
                )
                for item in uploaded_files
            ],
        )
    except ValueError as exc:
        return _error(str(exc), HTTPStatus.BAD_REQUEST)
    except OSError as exc:
        return _error(f"参考图保存失败：{exc}", HTTPStatus.INTERNAL_SERVER_ERROR)


def _quality_options_text(output_profile_id: str) -> str:
    return "、".join(
        f"{quality_label(value, output_profile_id=output_profile_id)}（{value}）"
        for value in available_quality_options(output_profile_id=output_profile_id)
    )


def _size_options_text(output_profile_id: str) -> str:
    if output_profile_id == OUTPUT_PROFILE_ASPECT_V1:
        return "需为自动或比例值，例如 auto、9:16、16:9、1:1。"
    return "需为自动、比例值或 WxH 像素，例如 auto、9:16、720x1280、1440x2560。"
