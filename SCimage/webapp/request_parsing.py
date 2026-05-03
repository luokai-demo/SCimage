from __future__ import annotations

import cgi
import io
import json
from dataclasses import dataclass
from email.message import Message
from typing import Any

from output_options import DEFAULT_QUALITY, DEFAULT_SIZE_OPTION
from workflows import DEFAULT_WORKFLOW


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    content_type: str
    data: bytes
    origin: dict[str, Any] | None = None


@dataclass(frozen=True)
class CreateJobRequest:
    workflow: str
    prompt: str
    quality: str
    size: str
    count: int
    source_images: tuple[UploadedFile, ...] = ()


def parse_create_job_request(*, content_type: str, raw_body: bytes) -> CreateJobRequest:
    normalized_content_type = (content_type or "").lower()
    if "multipart/form-data" in normalized_content_type:
        return _parse_multipart_create_job_request(content_type=content_type, raw_body=raw_body)
    if not normalized_content_type or "application/json" in normalized_content_type:
        return _parse_json_create_job_request(raw_body)
    raise ValueError("创建任务仅支持 application/json 或 multipart/form-data 请求。")


def _parse_json_create_job_request(raw_body: bytes) -> CreateJobRequest:
    if not raw_body:
        payload = {}
    else:
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("请求体不是合法 JSON。") from exc

    if not isinstance(payload, dict):
        raise ValueError("请求体不是合法 JSON。")

    return CreateJobRequest(
        workflow=str(payload.get("workflow", DEFAULT_WORKFLOW)).strip() or DEFAULT_WORKFLOW,
        prompt=str(payload.get("prompt", "")).strip(),
        quality=str(payload.get("quality") or DEFAULT_QUALITY).strip().lower(),
        size=str(payload.get("size") or DEFAULT_SIZE_OPTION).strip().lower(),
        count=_parse_count(payload.get("count", 1)),
        source_images=(),
    )


def _parse_multipart_create_job_request(*, content_type: str, raw_body: bytes) -> CreateJobRequest:
    form = _parse_multipart_form(content_type=content_type, raw_body=raw_body)
    source_fields = _field_list(form["source_image"] if "source_image" in form else [])
    origin_fields = _field_list(form["source_image_origin"] if "source_image_origin" in form else [])

    source_images: list[UploadedFile] = []
    for index, field in enumerate(source_fields):
        filename = str(getattr(field, "filename", "") or "").strip()
        if not filename:
            continue
        source_images.append(
            UploadedFile(
                filename=filename,
                content_type=str(getattr(field, "type", "") or "").strip(),
                data=field.file.read() if field.file is not None else b"",
                origin=_parse_source_image_origin(_field_value(origin_fields[index]) if index < len(origin_fields) else ""),
            )
        )

    return CreateJobRequest(
        workflow=form.getfirst("workflow", DEFAULT_WORKFLOW).strip() or DEFAULT_WORKFLOW,
        prompt=form.getfirst("prompt", "").strip(),
        quality=(form.getfirst("quality") or DEFAULT_QUALITY).strip().lower(),
        size=(form.getfirst("size") or DEFAULT_SIZE_OPTION).strip().lower(),
        count=_parse_count(form.getfirst("count", "1")),
        source_images=tuple(source_images),
    )


def _parse_multipart_form(*, content_type: str, raw_body: bytes) -> cgi.FieldStorage:
    headers = Message()
    headers["Content-Type"] = content_type
    return cgi.FieldStorage(
        fp=io.BytesIO(raw_body),
        headers=headers,
        environ={
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": content_type,
            "CONTENT_LENGTH": str(len(raw_body)),
        },
        keep_blank_values=True,
    )


def _field_list(value: object) -> list:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _field_value(field: object) -> str:
    value = getattr(field, "value", "")
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value or "")


def _parse_source_image_origin(value: str) -> dict[str, Any] | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None

    job_id = str(payload.get("job_id") or payload.get("origin_job_id") or "").strip()
    slot = _to_positive_int(payload.get("slot") or payload.get("origin_slot"), default=0)
    url = str(payload.get("url") or payload.get("origin_url") or "").strip()
    filename = str(payload.get("filename") or payload.get("name") or "").strip()
    prompt = str(payload.get("prompt") or "").strip()

    origin: dict[str, Any] = {}
    if job_id and slot:
        origin["job_id"] = job_id
        origin["slot"] = slot
    if url:
        origin["url"] = url
    if filename:
        origin["filename"] = filename
    if prompt:
        origin["prompt"] = prompt
    return origin or None


def _parse_count(value: object) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("生成数量必须是整数。") from exc


def _to_positive_int(value: object, *, default: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return default
    return normalized if normalized > 0 else default
