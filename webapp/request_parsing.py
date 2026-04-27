from __future__ import annotations

import cgi
import io
import json
from dataclasses import dataclass
from email.message import Message

from output_options import DEFAULT_QUALITY, DEFAULT_SIZE_OPTION
from workflows import DEFAULT_WORKFLOW


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    content_type: str
    data: bytes


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
    source_fields = form["source_image"] if "source_image" in form else []
    if not isinstance(source_fields, list):
        source_fields = [source_fields]

    source_images: list[UploadedFile] = []
    for field in source_fields:
        filename = str(getattr(field, "filename", "") or "").strip()
        if not filename:
            continue
        source_images.append(
            UploadedFile(
                filename=filename,
                content_type=str(getattr(field, "type", "") or "").strip(),
                data=field.file.read() if field.file is not None else b"",
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


def _parse_count(value: object) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("生成数量必须是整数。") from exc
