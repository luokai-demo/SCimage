#!/usr/bin/env python3
"""Generate or edit images through a configurable image endpoint."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import time


WEBAPP_DIR = Path(__file__).resolve().parents[1] / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from image_generation_runtime import (  # noqa: E402
    ImageGenerationRequest,
    execute_image_generation,
    normalize_generation_error,
    validate_source_image_paths,
)
from output_options import (  # noqa: E402
    DEFAULT_OUTPUT_PROFILE_ID,
    DEFAULT_QUALITY,
    DEFAULT_SIZE_OPTION,
)
from provider_compat import DEFAULT_COMPAT_PROFILE_ID  # noqa: E402


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
    return Path(os.getenv("IMAGE_OUTPUT_DIR", str(Path.home() / "Downloads" / "SCimage")))


def _default_output_name() -> str:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    return f"image-{timestamp}.png"


def _build_output_paths(out: str | None, out_dir: str | None, count: int) -> tuple[Path, ...]:
    if out and out_dir:
        _die("Use --out or --out-dir, not both.")
    if count < 1:
        _die("--n must be >= 1.")

    if out_dir:
        base = Path(out_dir)
        base.mkdir(parents=True, exist_ok=True)
        return tuple(base / f"image-{index}.png" for index in range(1, count + 1))

    out_path = Path(out) if out else _default_download_root() / _default_output_name()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if count == 1:
        return (out_path,)

    stem = out_path.stem
    suffix = out_path.suffix or ".png"
    return tuple(out_path.with_name(f"{stem}-{index}{suffix}") for index in range(1, count + 1))


def _print_status(message: str) -> None:
    print(f"STATUS: {message}", file=sys.stderr, flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate or edit images through a configurable image endpoint")
    parser.add_argument("--workflow", default="generate", choices=WORKFLOW_OPTIONS)
    parser.add_argument("--prompt")
    parser.add_argument("--prompt-file")
    parser.add_argument("--api-key")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
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
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    prompt = _read_prompt(args.prompt, args.prompt_file)
    api_key = _get_api_key(args.api_key)
    output_paths = _build_output_paths(args.out, args.out_dir, args.n)

    try:
        source_image_paths = tuple(validate_source_image_paths(args.source_image))
        response = execute_image_generation(
            ImageGenerationRequest(
                workflow=args.workflow,
                prompt=prompt,
                api_key=api_key,
                base_url=args.base_url.rstrip("/"),
                model=args.model,
                compat_profile_id=args.compat_profile,
                output_profile_id=args.output_profile,
                size=args.size,
                quality=args.quality,
                count=args.n,
                output_paths=output_paths,
                source_image_paths=source_image_paths,
            ),
            status_callback=_print_status,
        )
    except Exception as exc:
        _die(normalize_generation_error(str(exc)))

    if response.task_id:
        print(f"task_id={response.task_id}", file=sys.stderr)
    for path in response.saved_paths:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
