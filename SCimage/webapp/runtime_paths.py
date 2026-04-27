from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import platform
import sys


APP_NAME = "SCimage"
MACOS_DOCUMENTS_DIRNAME = "Documents"


@dataclass(frozen=True)
class RuntimePaths:
    app_name: str
    platform_system: str
    is_frozen: bool
    resource_root: Path
    executable_dir: Path
    data_root: Path
    static_dir: Path
    generated_dir: Path
    local_state_dir: Path
    provider_profiles_path: Path
    job_records_path: Path


def resolve_runtime_paths(
    *,
    app_name: str = APP_NAME,
    platform_system: str | None = None,
    is_frozen: bool | None = None,
    module_file: str | Path | None = None,
    executable_path: str | Path | None = None,
    resource_root: str | Path | None = None,
    home_dir: str | Path | None = None,
    windows_d_drive_exists: bool | None = None,
) -> RuntimePaths:
    resolved_platform = (platform_system or platform.system()).strip() or "Unknown"
    resolved_module_file = Path(module_file or __file__).resolve()
    development_root = resolved_module_file.parents[1]
    resolved_is_frozen = bool(getattr(sys, "frozen", False)) if is_frozen is None else bool(is_frozen)

    runtime_resource_root = Path(resource_root).resolve() if resource_root else _resolve_resource_root(
        development_root=development_root,
        is_frozen=resolved_is_frozen,
    )
    runtime_executable_dir = Path(executable_path).resolve().parent if executable_path else _resolve_executable_dir(
        fallback=development_root,
        is_frozen=resolved_is_frozen,
    )
    runtime_data_root = _resolve_data_root(
        app_name=app_name,
        development_root=development_root,
        executable_dir=runtime_executable_dir,
        platform_system=resolved_platform,
        is_frozen=resolved_is_frozen,
        home_dir=home_dir,
        windows_d_drive_exists=windows_d_drive_exists,
    )
    local_state_dir = runtime_data_root / ".local"

    return RuntimePaths(
        app_name=app_name,
        platform_system=resolved_platform,
        is_frozen=resolved_is_frozen,
        resource_root=runtime_resource_root,
        executable_dir=runtime_executable_dir,
        data_root=runtime_data_root,
        static_dir=runtime_resource_root / "webapp" / "static",
        generated_dir=runtime_data_root / "generated",
        local_state_dir=local_state_dir,
        provider_profiles_path=local_state_dir / "provider-profiles.json",
        job_records_path=local_state_dir / "job-records.json",
    )


def ensure_runtime_data_dirs(paths: RuntimePaths | None = None) -> RuntimePaths:
    resolved_paths = paths or RUNTIME_PATHS
    resolved_paths.data_root.mkdir(parents=True, exist_ok=True)
    resolved_paths.generated_dir.mkdir(parents=True, exist_ok=True)
    resolved_paths.local_state_dir.mkdir(parents=True, exist_ok=True)
    return resolved_paths


def _resolve_resource_root(*, development_root: Path, is_frozen: bool) -> Path:
    if is_frozen:
        return Path(getattr(sys, "_MEIPASS", development_root)).resolve()
    return development_root


def _resolve_executable_dir(*, fallback: Path, is_frozen: bool) -> Path:
    if is_frozen:
        return Path(sys.executable).resolve().parent
    return fallback


def _resolve_data_root(
    *,
    app_name: str,
    development_root: Path,
    executable_dir: Path,
    platform_system: str,
    is_frozen: bool,
    home_dir: str | Path | None,
    windows_d_drive_exists: bool | None,
) -> Path:
    if not is_frozen:
        return development_root

    normalized_platform = platform_system.lower()
    if normalized_platform == "windows":
        d_drive_available = Path("D:/").exists() if windows_d_drive_exists is None else bool(windows_d_drive_exists)
        if d_drive_available:
            return Path("D:/") / app_name
        return executable_dir / app_name

    if normalized_platform == "darwin":
        resolved_home = Path(home_dir).expanduser() if home_dir else Path.home()
        return resolved_home / MACOS_DOCUMENTS_DIRNAME / app_name

    return executable_dir / app_name


RUNTIME_PATHS = resolve_runtime_paths()
