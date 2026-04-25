#!/usr/bin/env python3
"""Generate or edit images through an OpenAI-compatible image endpoint."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import time
from typing import List
from urllib.parse import urljoin, urlparse

from gateway_client import GatewayConfig, download_file, request_edit, request_generation

DEFAULT_BASE_URL = os.getenv("IMAGE_API_BASE_URL") or os.getenv("OPENAI_BASE_URL") or ""
DEFAULT_MODEL = os.getenv("IMAGE_API_MODEL") or "gpt-image-2"
DEFAULT_SIZE = "9:16"
QUALITY_OPTIONS = ("low", "medium", "high")
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
        return [base / f"image-{index}.png" for index in range(count)]
    if not out:
        out = str(_default_download_root() / _default_output_name())
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if count == 1:
        return [out_path]
    stem = out_path.stem
    suffix = out_path.suffix or ".png"
    return [out_path.with_name(f"{stem}-{index}{suffix}") for index in range(count)]


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate or edit images through a configurable image endpoint")
    parser.add_argument("--workflow", default="generate", choices=WORKFLOW_OPTIONS)
    parser.add_argument("--prompt")
    parser.add_argument("--prompt-file")
    parser.add_argument("--api-key")
    parser.add_argument("--base-url", default=os.getenv("IMAGE_API_BASE_URL") or os.getenv("OPENAI_BASE_URL") or DEFAULT_BASE_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--size", default=DEFAULT_SIZE)
    parser.add_argument("--quality", default="low", choices=QUALITY_OPTIONS)
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
            fields = {
                "model": args.model,
                "prompt": prompt,
                "n": args.n,
                "size": args.size,
                "quality": args.quality,
            }
            response = request_edit(
                base_url=base_url,
                headers=headers,
                fields=fields,
                image_paths=source_images,
                config=config,
                status_callback=_print_status,
            )
        else:
            payload = {
                "model": args.model,
                "prompt": prompt,
                "n": args.n,
                "size": args.size,
                "quality": args.quality,
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
        raw_url = item.get("url")
        if not raw_url:
            _die("Gateway response item is missing url.")
        file_url = raw_url if raw_url.startswith("http") else urljoin(origin, raw_url)
        try:
            download_file(
                url=file_url,
                target=target,
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
