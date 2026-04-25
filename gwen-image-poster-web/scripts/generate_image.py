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
from urllib.parse import urljoin, urlparse

from gateway_client import (
    GatewayConfig,
    download_file,
    request_chat_completion_images,
    request_generation,
)

WEBAPP_DIR = Path(__file__).resolve().parents[1] / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from output_options import (  # noqa: E402
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
    normalize_quality,
    normalize_size_value,
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


def _write_base64_image(target: Path, payload: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(payload))


def _write_data_url_image(target: Path, payload: str) -> None:
    if "," not in payload:
        _die("Gateway response data URL is invalid.")
    _, encoded = payload.split(",", 1)
    _write_base64_image(target, encoded)


def _save_response_item(
    *,
    item: dict,
    target: Path,
    config: GatewayConfig,
    origin: str,
    image_index: int,
    image_total: int,
) -> None:
    raw_url = item.get("url")
    if isinstance(raw_url, str) and raw_url.strip():
        file_url = raw_url if raw_url.startswith("http") else urljoin(origin, raw_url)
        download_file(
            url=file_url,
            target=target,
            config=config,
            status_callback=_print_status,
            image_index=image_index,
            image_total=image_total,
        )
        return

    data_url = item.get("data_url")
    if isinstance(data_url, str) and data_url.strip():
        _write_data_url_image(target, data_url.strip())
        return

    b64_json = item.get("b64_json")
    if isinstance(b64_json, str) and b64_json.strip():
        _write_base64_image(target, b64_json.strip())
        return

    _die("Gateway response item is missing image payload.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate or edit images through a configurable image endpoint")
    parser.add_argument("--workflow", default="generate", choices=WORKFLOW_OPTIONS)
    parser.add_argument("--prompt")
    parser.add_argument("--prompt-file")
    parser.add_argument("--api-key")
    parser.add_argument("--base-url", default=os.getenv("IMAGE_API_BASE_URL") or os.getenv("OPENAI_BASE_URL") or DEFAULT_BASE_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
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

    normalized_quality = normalize_quality(args.quality, fallback=DEFAULT_QUALITY)
    normalized_size = normalize_size_value(args.size, fallback=DEFAULT_SIZE_OPTION, quality=normalized_quality)

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

            content = [{"type": "text", "text": prompt}]
            content.extend(
                {
                    "type": "image_url",
                    "image_url": {"url": _file_to_data_url(path)},
                }
                for path in source_images
            )
            payload = {
                "model": args.model,
                "stream": True,
                "quality": normalized_quality,
                "size": normalized_size,
                "messages": [
                    {
                        "role": "user",
                        "content": content,
                    }
                ],
            }
            response = request_chat_completion_images(
                base_url=base_url,
                headers=headers,
                payload=payload,
                config=config,
                status_callback=_print_status,
            )
        else:
            payload = {
                "model": args.model,
                "prompt": prompt,
                "n": args.n,
                "size": normalized_size,
                "quality": normalized_quality,
            }
            response = request_generation(
                base_url=base_url,
                headers=headers,
                payload=payload,
                config=config,
                status_callback=_print_status,
            )
    except Exception as exc:
        _die(str(exc))

    data = response["data"]
    task_id = response.get("task_id")
    if task_id:
        print(f"task_id={task_id}", file=sys.stderr)

    origin = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
    for index, (item, target) in enumerate(zip(data, output_paths), start=1):
        try:
            _save_response_item(
                item=item,
                target=target,
                config=config,
                origin=origin,
                image_index=index,
                image_total=len(output_paths),
            )
        except Exception as exc:
            _die(str(exc))
        print(target)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
