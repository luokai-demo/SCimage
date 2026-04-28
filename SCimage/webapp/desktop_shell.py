from __future__ import annotations

from dataclasses import dataclass, field
from http.server import ThreadingHTTPServer
import platform
import threading
import time
from urllib.error import URLError
from urllib.parse import urlunsplit
from urllib.request import urlopen

from brand_assets import resolve_desktop_window_icon_path
from config import HOST
from desktop_bridge import DesktopBridge
from runtime_paths import APP_NAME, RUNTIME_PATHS
from server import create_server, prepare_runtime_environment, serve_server, shutdown_server

try:
    import webview
except ImportError:  # pragma: no cover - handled at runtime
    webview = None


WINDOW_WIDTH = 1440
WINDOW_HEIGHT = 960
WINDOW_MIN_SIZE = (1120, 760)
SERVER_READY_TIMEOUT_SECONDS = 15
SERVER_READY_POLL_INTERVAL_SECONDS = 0.2
WINDOW_BACKGROUND_COLOR = "#0b0b0b"
WEBVIEW2_RUNTIME_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"


@dataclass
class DesktopServerHandle:
    server: ThreadingHTTPServer
    thread: threading.Thread
    url: str
    stopped: threading.Event = field(default_factory=threading.Event)


def run_desktop_app() -> int:
    handle: DesktopServerHandle | None = None
    try:
        _require_desktop_dependencies()
        _ensure_desktop_prerequisites()
        handle = start_desktop_server()
        _launch_window(handle)
    except Exception as exc:
        _show_error_dialog(APP_NAME, str(exc))
        return 1
    finally:
        if handle is not None:
            stop_desktop_server(handle)
    return 0


def start_desktop_server() -> DesktopServerHandle:
    prepare_runtime_environment()
    server = create_server(host=HOST, port=0)
    host, port = server.server_address[:2]
    handle = DesktopServerHandle(
        server=server,
        thread=threading.Thread(target=serve_server, args=(server,), name="scimage-server", daemon=True),
        url=urlunsplit(("http", f"{host}:{port}", "", "", "")),
    )
    handle.thread.start()
    try:
        _wait_for_server_ready(handle.url)
    except Exception:
        stop_desktop_server(handle)
        raise
    return handle


def stop_desktop_server(handle: DesktopServerHandle) -> None:
    if handle.stopped.is_set():
        return
    handle.stopped.set()
    if handle.thread.is_alive():
        shutdown_server(handle.server)
    else:
        handle.server.server_close()
    handle.thread.join(timeout=3)


def _launch_window(handle: DesktopServerHandle) -> None:
    assert webview is not None

    bridge = DesktopBridge(base_url=handle.url)
    window = webview.create_window(
        APP_NAME,
        handle.url,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        min_size=WINDOW_MIN_SIZE,
        background_color=WINDOW_BACKGROUND_COLOR,
        js_api=bridge,
    )
    bridge.attach_window(window)
    window.events.closed += lambda: stop_desktop_server(handle)

    start_kwargs = {"debug": False}
    gui_name = "edgechromium" if platform.system() == "Windows" else None
    if gui_name:
        start_kwargs["gui"] = gui_name

    icon_path = resolve_desktop_window_icon_path()
    if icon_path is not None:
        start_kwargs["icon"] = str(icon_path)

    webview.start(**start_kwargs)


def _require_desktop_dependencies() -> None:
    if webview is None:
        raise RuntimeError("缺少 pywebview 依赖，无法启动 SCimage 桌面窗口。")


def _ensure_desktop_prerequisites() -> None:
    _ensure_runtime_data_root()
    _ensure_windows_webview2_runtime()


def _ensure_runtime_data_root() -> None:
    try:
        RUNTIME_PATHS.data_root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise RuntimeError(f"无法创建本地数据目录：{RUNTIME_PATHS.data_root}。{exc}") from exc


def _ensure_windows_webview2_runtime() -> None:
    if platform.system() != "Windows":
        return

    try:
        import winreg
    except ImportError as exc:  # pragma: no cover - Windows only
        raise RuntimeError("无法检查 WebView2 Runtime，请确认系统组件可用。") from exc

    subkeys = [
        rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_RUNTIME_GUID}",
        rf"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_RUNTIME_GUID}",
    ]
    hives = [winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE]
    for hive in hives:
        for subkey in subkeys:
            try:
                with winreg.OpenKey(hive, subkey) as key:
                    version, _ = winreg.QueryValueEx(key, "pv")
                if str(version).strip():
                    return
            except OSError:
                continue

    raise RuntimeError(
        "未检测到 Microsoft Edge WebView2 Runtime，SCimage 桌面版无法启动。请先安装 WebView2 Runtime。"
    )


def _wait_for_server_ready(base_url: str) -> None:
    deadline = time.monotonic() + SERVER_READY_TIMEOUT_SECONDS
    last_error = ""
    healthcheck_url = f"{base_url}/api/jobs"

    while time.monotonic() < deadline:
        try:
            with urlopen(healthcheck_url, timeout=1) as response:
                if 200 <= response.status < 500:
                    return
        except URLError as exc:
            last_error = str(exc)
            time.sleep(SERVER_READY_POLL_INTERVAL_SECONDS)
            continue
        except OSError as exc:
            last_error = str(exc)
            time.sleep(SERVER_READY_POLL_INTERVAL_SECONDS)
            continue

    detail = f" 最后错误：{last_error}" if last_error else ""
    raise RuntimeError(f"本地服务启动超时，SCimage 无法打开主窗口。{detail}")


def _show_error_dialog(title: str, message: str) -> None:
    try:
        from tkinter import Tk, messagebox

        root = Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showerror(title, message, parent=root)
        root.destroy()
    except Exception:
        print(f"{title}: {message}")
