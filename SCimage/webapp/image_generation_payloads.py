from __future__ import annotations

import base64
import mimetypes
from pathlib import Path


def build_generation_payload(*, model: str, prompt: str, count: int, quality: str, size: str) -> dict:
    return {
        "model": model,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": quality,
    }


def build_edit_fields(*, model: str, prompt: str, count: int, quality: str, size: str) -> dict[str, object]:
    return {
        "model": model,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": quality,
    }


def build_chat_completion_payload(
    *,
    model: str,
    prompt: str,
    quality: str,
    size: str,
    source_images: list[Path],
) -> dict:
    content = [{"type": "text", "text": prompt}]
    content.extend(
        {
            "type": "image_url",
            "image_url": {"url": file_to_data_url(path)},
        }
        for path in source_images
    )
    return {
        "model": model,
        "stream": True,
        "quality": quality,
        "size": size,
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
    }


def file_to_data_url(path: Path) -> str:
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"
