#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import platform
import plistlib
from pathlib import Path
import shutil
import subprocess
import sys
import textwrap


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_ROOT = PROJECT_ROOT / "webapp"
if str(WEBAPP_ROOT) not in sys.path:
    sys.path.insert(0, str(WEBAPP_ROOT))

from brand_assets import load_logo_canvas, logo_source_path, resize_rgba_canvas, save_windows_icon


APP_NAME = "SCimage"
APP_VERSION = (PROJECT_ROOT / "VERSION").read_text(encoding="utf-8").strip()
LOGO_SOURCE_PATH = logo_source_path()
WINDOWS_TARGET = "windows"
MACOS_TARGET = "macos"
TARGET_TO_SYSTEM = {
    WINDOWS_TARGET: "Windows",
    MACOS_TARGET: "Darwin",
}


def configure_console_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the SCimage desktop bundle.")
    parser.add_argument("--target", choices=(WINDOWS_TARGET, MACOS_TARGET), required=True)
    parser.add_argument("--internal-generate-assets", action="store_true")
    parser.add_argument("--assets-dir")
    return parser.parse_args()


def main() -> int:
    configure_console_encoding()
    args = parse_args()
    if args.internal_generate_assets:
        if not args.assets_dir:
            raise SystemExit("--assets-dir is required for --internal-generate-assets")
        generate_packaging_assets(target=args.target, assets_dir=Path(args.assets_dir))
        return 0

    validate_host_platform(args.target)
    build_root = PROJECT_ROOT / "build" / args.target
    dist_root = PROJECT_ROOT / "dist" / args.target
    venv_dir = PROJECT_ROOT / f".build-venv-{args.target}"
    assets_dir = build_root / "assets"
    spec_dir = build_root / "spec"
    work_dir = build_root / "pyinstaller"

    reset_build_dirs(build_root=build_root, dist_root=dist_root)
    venv_python = ensure_build_venv(venv_dir)
    install_build_dependencies(venv_python)
    generate_assets_with_venv(venv_python, target=args.target, assets_dir=assets_dir)
    build_with_pyinstaller(
        venv_python=venv_python,
        target=args.target,
        dist_root=dist_root,
        work_dir=work_dir,
        spec_dir=spec_dir,
        assets_dir=assets_dir,
    )
    finalize_bundle(target=args.target, dist_root=dist_root)
    print(f"SCimage {args.target} 打包完成：{dist_root}")
    return 0


def validate_host_platform(target: str) -> None:
    current_system = platform.system()
    expected_system = TARGET_TO_SYSTEM[target]
    if current_system != expected_system:
        raise SystemExit(
            f"{target} 产物只能在 {expected_system} 上构建，当前系统是 {current_system}。"
        )


def reset_build_dirs(*, build_root: Path, dist_root: Path) -> None:
    shutil.rmtree(build_root, ignore_errors=True)
    shutil.rmtree(dist_root, ignore_errors=True)
    build_root.mkdir(parents=True, exist_ok=True)
    dist_root.mkdir(parents=True, exist_ok=True)


def ensure_build_venv(venv_dir: Path) -> Path:
    venv_python = venv_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python3")
    if venv_python.exists():
        return venv_python
    run([sys.executable, "-m", "venv", str(venv_dir)])
    if not venv_python.exists():
        raise SystemExit(f"虚拟环境创建失败：{venv_python}")
    return venv_python


def install_build_dependencies(venv_python: Path) -> None:
    run([str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "wheel"])
    run([str(venv_python), "-m", "pip", "install", "-r", str(PROJECT_ROOT / "requirements-desktop.txt")])


def generate_assets_with_venv(venv_python: Path, *, target: str, assets_dir: Path) -> None:
    run(
        [
            str(venv_python),
            str(Path(__file__).resolve()),
            "--target",
            target,
            "--internal-generate-assets",
            "--assets-dir",
            str(assets_dir),
        ]
    )


def build_with_pyinstaller(
    *,
    venv_python: Path,
    target: str,
    dist_root: Path,
    work_dir: Path,
    spec_dir: Path,
    assets_dir: Path,
) -> None:
    add_data_sep = ";" if target == WINDOWS_TARGET else ":"
    static_mapping = f"{PROJECT_ROOT / 'webapp' / 'static'}{add_data_sep}webapp/static"
    command = [
        str(venv_python),
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--windowed",
        "--name",
        APP_NAME,
        "--distpath",
        str(dist_root),
        "--workpath",
        str(work_dir),
        "--specpath",
        str(spec_dir),
        "--paths",
        str(PROJECT_ROOT / "webapp"),
        "--add-data",
        static_mapping,
        "--collect-submodules",
        "webview",
        "--collect-data",
        "webview",
        str(PROJECT_ROOT / "desktop_app.py"),
    ]

    icon_path = assets_dir / ("SCimage.ico" if target == WINDOWS_TARGET else "SCimage.icns")
    if icon_path.exists():
        command.extend(["--icon", str(icon_path)])
    if target == WINDOWS_TARGET:
        version_file = assets_dir / "windows-version-info.txt"
        if version_file.exists():
            command.extend(["--version-file", str(version_file)])
    if target == MACOS_TARGET:
        command.extend(["--osx-bundle-identifier", "com.scimage.desktop"])

    run(command)


def finalize_bundle(*, target: str, dist_root: Path) -> None:
    if target != MACOS_TARGET:
        return

    app_bundle = dist_root / f"{APP_NAME}.app"
    sibling_directory_bundle = dist_root / APP_NAME
    info_plist = app_bundle / "Contents" / "Info.plist"
    if not info_plist.exists():
        return

    with info_plist.open("rb") as fh:
        payload = plistlib.load(fh)
    payload["CFBundleName"] = APP_NAME
    payload["CFBundleDisplayName"] = APP_NAME
    payload["CFBundleShortVersionString"] = APP_VERSION
    payload["CFBundleVersion"] = APP_VERSION
    with info_plist.open("wb") as fh:
        plistlib.dump(payload, fh)

    if sibling_directory_bundle.exists() and sibling_directory_bundle.is_dir():
        shutil.rmtree(sibling_directory_bundle)


def generate_packaging_assets(*, target: str, assets_dir: Path) -> None:
    from PIL import Image

    assets_dir.mkdir(parents=True, exist_ok=True)
    try:
        canvas = load_logo_canvas(Image, source_path=LOGO_SOURCE_PATH)
    except FileNotFoundError as exc:
        raise SystemExit(str(exc)) from exc

    if target == WINDOWS_TARGET:
        save_windows_icon(Image, canvas, assets_dir / "SCimage.ico")
        (assets_dir / "windows-version-info.txt").write_text(build_windows_version_info(), encoding="utf-8")
        return

    if target == MACOS_TARGET:
        build_macos_icns(canvas, assets_dir / "SCimage.icns")


def build_macos_icns(canvas, target: Path) -> None:
    from PIL import Image

    iconset_dir = target.parent / "SCimage.iconset"
    shutil.rmtree(iconset_dir, ignore_errors=True)
    iconset_dir.mkdir(parents=True, exist_ok=True)
    icon_specs = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for filename, size in icon_specs.items():
        resized = resize_rgba_canvas(Image, canvas, size)
        resized.save(iconset_dir / filename)
    run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(target)])


def build_windows_version_info() -> str:
    return textwrap.dedent(
        f"""
        VSVersionInfo(
          ffi=FixedFileInfo(
            filevers=(1, 0, 0, 0),
            prodvers=(1, 0, 0, 0),
            mask=0x3f,
            flags=0x0,
            OS=0x40004,
            fileType=0x1,
            subtype=0x0,
            date=(0, 0)
          ),
          kids=[
            StringFileInfo([
              StringTable(
                '040904B0',
                [
                  StringStruct('CompanyName', 'SCimage'),
                  StringStruct('FileDescription', 'SCimage Desktop'),
                  StringStruct('FileVersion', '{APP_VERSION}'),
                  StringStruct('InternalName', '{APP_NAME}'),
                  StringStruct('OriginalFilename', '{APP_NAME}.exe'),
                  StringStruct('ProductName', '{APP_NAME}'),
                  StringStruct('ProductVersion', '{APP_VERSION}')
                ]
              )
            ]),
            VarFileInfo([VarStruct('Translation', [1033, 1200])])
          ]
        )
        """
    ).strip()


def run(command: list[str]) -> None:
    print("$", " ".join(command))
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)


if __name__ == "__main__":
    raise SystemExit(main())
