from __future__ import annotations

from pathlib import Path
from shutil import copy2
from urllib.parse import unquote, urlsplit

from config import GENERATED_DIR


def resolve_generated_path(url: str, *, base_url: str) -> Path | None:
    raw_url = str(url or "").strip()
    if not raw_url:
        return None

    parsed = urlsplit(raw_url)
    if parsed.scheme or parsed.netloc:
        base = urlsplit(base_url)
        if parsed.scheme != base.scheme or parsed.netloc != base.netloc:
            return None

    path = unquote(parsed.path or "")
    if not path.startswith("/generated/"):
        return None

    relative = path.removeprefix("/generated/").lstrip("/")
    if not relative:
        return None

    generated_root = GENERATED_DIR.resolve()
    candidate = (generated_root / relative).resolve()
    try:
        candidate.relative_to(generated_root)
    except ValueError:
        return None
    return candidate


class DesktopBridge:
    def __init__(self, *, base_url: str) -> None:
        self._base_url = base_url
        self._window = None

    def attach_window(self, window) -> None:
        self._window = window

    def download_file(self, url: str, filename: str) -> dict:
        source = resolve_generated_path(url, base_url=self._base_url)
        if source is None or not source.is_file():
            return {"ok": False, "error": "图片文件不存在，无法下载。"}

        if self._window is None:
            return {"ok": False, "error": "桌面窗口尚未就绪，请稍后再试。"}

        target_path = self._prompt_target_path(filename or source.name)
        if target_path is None:
            return {"ok": False, "canceled": True}

        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            copy2(source, target_path)
        except OSError as exc:
            return {"ok": False, "error": f"保存图片失败：{exc}"}

        return {"ok": True, "path": str(target_path)}

    def _prompt_target_path(self, filename: str) -> Path | None:
        import webview

        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=filename or "image.png",
        )
        if not result:
            return None

        if isinstance(result, (list, tuple)):
            target = result[0] if result else ""
        else:
            target = result
        target_text = str(target or "").strip()
        if not target_text:
            return None
        return Path(target_text)
