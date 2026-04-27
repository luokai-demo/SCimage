#!/usr/bin/env python3
"""Generate or edit images through a configurable image endpoint."""

from __future__ import annotations

import argparse
import base64
import mimetypes
import os
from pathlib import Path
import sys
import time
from typing import List

from gateway_client import (
    GatewayConfig,
    request_chat_completion_images,
    request_edit,
    request_generation,
    save_image_item,
)
from openai_sdk_gateway import OpenAISDKConfig, request_openai_sdk_edit, request_openai_sdk_generation

WEBAPP_DIR = Path(__file__).resolve().parents[1] / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from output_options import (  # noqa: E402
    DEFAULT_OUTPUT_PROFILE_ID,
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    normalize_output_profile_id,
    normalize_quality,
    normalize_size_value,
    resolve_api_size_value,
    resolve_openai_sdk_quality,
    resolve_openai_sdk_size_value,
)
from provider_compat import (  # noqa: E402
    DEFAULT_COMPAT_PROFILE_ID,
    IMAGE_TO_IMAGE_TRANSPORT_CHAT_COMPLETIONS,
    IMAGE_TO_IMAGE_TRANSPORT_IMAGES_EDITS,
    IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK,
    IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED,
    TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS,
    TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK,
    get_compat_profile,
    normalize_compat_profile_id,
)

DEFAULT_BASE_URL = os.getenv("IMAGE_API_BASE_URL") or os.getenv("OPENAI_BASE_URL") or ""
DEFAULT_MODEL = os.getenv("IMAGE_API_MODEL") or "gpt-image-2"
WORKFLOW_OPTIONS = ("generate", "image-to-image")


def _die(message: str) -> "None":
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(1)


def _get_api_key(explicit: str | None) -> str:
    key = explicit or os.getenv("IMAGE_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        _die("Missing API key. Set IMAGE_API_KEY or OPENAI_API_KEY, or pass --api-key.")
    return key


def _read_prompt(prompt: str | None, prompt_file: str | None) -> str:
    if prompt and prompt_file:
        _die("Use --prompt or --prompt-file, not both.")
    if prompt_file:
        return Path(prompt_file).read_text(encoding="utf-8").strip()
    if prompt:
        return prompt.strip()
    _die("Missing prompt.")


def _default_download_root() -> Path:
    return Path(os.getenv("IMAGE_OUTPUT_DIR", str(Path.home() / "Downloads" / "image-workbench")))


def _default_output_name() -> str:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    return f"image-{timestamp}.png"


def _build_output_paths(out: str | None, out_dir: str | None, count: int) -> List[Path]:
    if out and out_dir:
        _die("Use --out or --out-dir, not both.")
    if count < 1:
        _die("--n must be >= 1.")
    if out_dir:
        base = Path(out_dir)
        base.mkdir(parents=True, exist_ok=True)
        return [base / f"image-{index}.png" for index in range(1, count + 1)]
    if not out:
        out = str(_default_download_root() / _default_output_name())
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if count == 1:
        return [out_path]
    stem = out_path.stem
    suffix = out_path.suffix or ".png"
    return [out_path.with_name(f"{stem}-{index}{suffix}") for index in range(1, count + 1)]


def _print_status(message: str) -> None:
    print(f"STATUS: {message}", file=sys.stderr, flush=True)


def _resolve_source_images(paths: list[str]) -> list[Path]:
    resolved_paths: list[Path] = []
    for index, raw_path in enumerate(paths, start=1):
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            _die(f"Missing source image #{index}: {path}")
        resolved_paths.append(path)
    return resolved_paths


def _file_to_data_url(path: Path) -> str:
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _build_generation_payload(*, model: str, prompt: str, count: int, quality: str, size: str) -> dict:
    return {
        "model": model,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": quality,
    }


def _build_edit_fields(*, model: str, prompt: str, count: int, quality: str, size: str) -> dict[str, object]:
    return {
        "model": model,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": quality,
    }


def _build_chat_completion_payload(
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
            "image_url": {"url": _file_to_data_url(path)},
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate or edit images through a configurable image endpoint")
    parser.add_argument("--workflow", default="generate", choices=WORKFLOW_OPTIONS)
    parser.add_argument("--prompt")
    parser.add_argument("--prompt-file")
    parser.add_argument("--api-key")
    parser.add_argument(
        "--base-url",
        default=os.getenv("IMAGE_API_BASE_URL") or os.getenv("OPENAI_BASE_URL") or DEFAULT_BASE_URL,
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--compat-profile", default=os.getenv("IMAGE_API_COMPAT_PROFILE") or DEFAULT_COMPAT_PROFILE_ID)
    parser.add_argument("--output-profile", default=os.getenv("IMAGE_API_OUTPUT_PROFILE") or DEFAULT_OUTPUT_PROFILE_ID)
    parser.add_argument("--size", default=DEFAULT_SIZE_OPTION)
    parser.add_argument("--quality", default=DEFAULT_QUALITY)
    parser.add_argument("--n", type=int, default=1)
    parser.add_argument("--out")
    parser.add_argument("--out-dir")
    parser.add_argument("--source-image", action="append", default=[])
    args = parser.parse_args()

    prompt = _read_prompt(args.prompt, args.prompt_file)
    api_key = _get_api_key(args.api_key)
    output_paths = _build_output_paths(args.out, args.out_dir, args.n)

    base_url = args.base_url.rstrip("/")
    if not base_url:
        _die("Missing base URL. Set IMAGE_API_BASE_URL / OPENAI_BASE_URL, or pass --base-url.")

    compat_profile = get_compat_profile(normalize_compat_profile_id(args.compat_profile))
    output_profile_id = normalize_output_profile_id(
        args.output_profile,
        fallback=compat_profile.output_profile_id,
    )
    normalized_quality = normalize_quality(
        args.quality,
        fallback=DEFAULT_QUALITY,
        output_profile_id=output_profile_id,
    )
    normalized_size = normalize_size_value(
        args.size,
        fallback=DEFAULT_SIZE_OPTION,
        quality=normalized_quality,
        output_profile_id=output_profile_id,
    )
    api_size = resolve_api_size_value(
        normalized_size,
        normalized_quality,
        output_profile_id=output_profile_id,
    )
    sdk_quality = resolve_openai_sdk_quality(normalized_quality, output_profile_id=output_profile_id)
    sdk_size = resolve_openai_sdk_size_value(
        normalized_size,
        normalized_quality,
        output_profile_id=output_profile_id,
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    config = GatewayConfig()
    try:
        if args.workflow == "image-to-image":
            source_images = _resolve_source_images(args.source_image)
            if not source_images:
                _die("Image-to-image workflow requires at least one --source-image.")

            if compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_UNSUPPORTED:
                _die("当前兼容模式不支持图生图，请切换到支持图生图的提供方配置。")

            if compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_OPENAI_SDK:
                response = request_openai_sdk_edit(
                    base_url=base_url,
                    api_key=api_key,
                    model=args.model,
                    prompt=prompt,
                    count=args.n,
                    quality=sdk_quality,
                    size=sdk_size,
                    image_paths=source_images,
                    config=OpenAISDKConfig(),
                    status_callback=_print_status,
                )
            elif compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_IMAGES_EDITS:
                response = request_edit(
                    base_url=base_url,
                    headers=headers,
                    fields=_build_edit_fields(
                        model=args.model,
                        prompt=prompt,
                        count=args.n,
                        quality=normalized_quality,
                        size=api_size,
                    ),
                    image_paths=source_images,
                    config=config,
                    status_callback=_print_status,
                )
            elif compat_profile.image_to_image_transport == IMAGE_TO_IMAGE_TRANSPORT_CHAT_COMPLETIONS:
                response = request_chat_completion_images(
                    base_url=base_url,
                    headers=headers,
                    payload=_build_chat_completion_payload(
                        model=args.model,
                        prompt=prompt,
                        quality=normalized_quality,
                        size=api_size,
                        source_images=source_images,
                    ),
                    config=config,
                    status_callback=_print_status,
                )
            else:
                _die(f"Unsupported image-to-image transport: {compat_profile.image_to_image_transport}")
        else:
            if compat_profile.text_to_image_transport == TEXT_TO_IMAGE_TRANSPORT_OPENAI_SDK:
                response = request_openai_sdk_generation(
                    base_url=base_url,
                    api_key=api_key,
                    model=args.model,
                    prompt=prompt,
                    count=args.n,
                    quality=sdk_quality,
                    size=sdk_size,
                    config=OpenAISDKConfig(),
                    status_callback=_print_status,
                )
            elif compat_profile.text_to_image_transport == TEXT_TO_IMAGE_TRANSPORT_IMAGES_GENERATIONS:
                response = request_generation(
                    base_url=base_url,
                    headers=headers,
                    payload=_build_generation_payload(
                        model=args.model,
                        prompt=prompt,
                        count=args.n,
                        quality=normalized_quality,
                        size=api_size,
                    ),
                    config=config,
                    status_callback=_print_status,
                )
            else:
                _die(f"Unsupported text-to-image transport: {compat_profile.text_to_image_transport}")
    except Exception as exc:
        _die(str(exc))

    data = response["data"]
    task_id = response.get("task_id")
    if task_id:
        print(f"task_id={task_id}", file=sys.stderr)

    for index, (item, target) in enumerate(zip(data, output_paths), start=1):
        try:
            save_image_item(
                item=item,
                target=target,
                base_url=base_url,
                config=config,
                status_callback=_print_status,
                image_index=index,
                image_total=len(output_paths),
            )
        except Exception as exc:
            _die(str(exc))
        print(target)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
