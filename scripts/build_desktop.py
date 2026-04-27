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
APP_NAME = "SCimage"
APP_VERSION = (PROJECT_ROOT / "VERSION").read_text(encoding="utf-8").strip()
WINDOWS_TARGET = "windows"
MACOS_TARGET = "macos"
TARGET_TO_SYSTEM = {
    WINDOWS_TARGET: "Windows",
    MACOS_TARGET: "Darwin",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the SCimage desktop bundle.")
    parser.add_argument("--target", choices=(WINDOWS_TARGET, MACOS_TARGET), required=True)
    parser.add_argument("--internal-generate-assets", action="store_true")
    parser.add_argument("--assets-dir")
    return parser.parse_args()


def main() -> int:
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
    from PIL import Image, ImageDraw

    assets_dir.mkdir(parents=True, exist_ok=True)
    canvas = Image.new("RGBA", (1024, 1024), "#050505")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((112, 112, 912, 912), radius=180, fill="#101010", outline="#e8e8e8", width=24)
    draw.rectangle((252, 238, 772, 760), outline="#f4f4f4", width=24)
    draw.ellipse((332, 314, 460, 442), fill="#f4f4f4")
    draw.polygon(((244, 708), (420, 516), (548, 644), (662, 538), (780, 662), (780, 760), (244, 760)), fill="#f4f4f4")
    draw.line((670, 266, 806, 266, 806, 402), fill="#f4f4f4", width=28)
    draw.polygon(((732, 214), (670, 278), (794, 278)), fill="#f4f4f4")

    if target == WINDOWS_TARGET:
        canvas.save(
            assets_dir / "SCimage.ico",
            sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
        )
        (assets_dir / "windows-version-info.txt").write_text(build_windows_version_info(), encoding="utf-8")
        return

    if target == MACOS_TARGET:
        build_macos_icns(canvas, assets_dir / "SCimage.icns")


def build_macos_icns(canvas, target: Path) -> None:
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
        resized = canvas.resize((size, size))
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
