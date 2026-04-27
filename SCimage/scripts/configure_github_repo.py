#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_VERSION = "2026-03-10"
SKIPPED_HINTS: list[str] = []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="配置 GitHub 仓库可见性与安全设置。")
    parser.add_argument("repo", help="GitHub 仓库，格式为 owner/repo")
    parser.add_argument(
        "--default-branch",
        default="main",
        help="需要保护的默认分支名，默认是 main。",
    )
    parser.add_argument(
        "--visibility",
        choices=("private", "public"),
        default="private",
        help="目标仓库可见性，默认会改成 private。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ensure_gh_ready()

    repo = args.repo.strip()
    default_branch = args.default_branch.strip()

    set_repository_basics(repo=repo, visibility=args.visibility)
    enable_dependency_alerts(repo)
    enable_automated_security_fixes(repo)
    enable_immutable_releases(repo)
    enable_security_and_analysis(repo)
    if args.visibility == "public":
        enable_private_vulnerability_reporting(repo)
    protect_default_branch(repo=repo, branch=default_branch)
    print_skipped_hints()

    print(f"GitHub 仓库配置完成：{repo}")
    return 0


def ensure_gh_ready() -> None:
    if shutil_which("gh") is None:
        raise SystemExit("未找到 gh，请先安装 GitHub CLI。")
    result = run_command(["gh", "auth", "status"], check=False, capture_output=True)
    if result.returncode != 0:
        raise SystemExit("gh 尚未登录。请先执行 gh auth login。")


def set_repository_basics(*, repo: str, visibility: str) -> None:
    payload = {
        "visibility": visibility,
        "private": visibility == "private",
        "delete_branch_on_merge": True,
        "has_wiki": False,
        "web_commit_signoff_required": True,
    }
    gh_api("PATCH", f"repos/{repo}", payload, strict=True)


def enable_dependency_alerts(repo: str) -> None:
    gh_api("PUT", f"repos/{repo}/vulnerability-alerts", strict=False)


def enable_automated_security_fixes(repo: str) -> None:
    gh_api("PUT", f"repos/{repo}/automated-security-fixes", strict=False)


def enable_immutable_releases(repo: str) -> None:
    gh_api("PUT", f"repos/{repo}/immutable-releases", strict=False)


def enable_private_vulnerability_reporting(repo: str) -> None:
    gh_api("PUT", f"repos/{repo}/private-vulnerability-reporting", strict=False)


def enable_security_and_analysis(repo: str) -> None:
    payload = {
        "security_and_analysis": {
            "secret_scanning": {"status": "enabled"},
            "secret_scanning_push_protection": {"status": "enabled"},
            "secret_scanning_ai_detection": {"status": "enabled"},
            "secret_scanning_non_provider_patterns": {"status": "enabled"},
            "code_security": {"status": "enabled"},
        }
    }
    gh_api("PATCH", f"repos/{repo}", payload, strict=False)


def protect_default_branch(*, repo: str, branch: str) -> None:
    payload = {
        "required_status_checks": None,
        "enforce_admins": True,
        "required_pull_request_reviews": {
            "dismiss_stale_reviews": True,
            "require_code_owner_reviews": False,
            "required_approving_review_count": 1,
            "require_last_push_approval": True,
        },
        "restrictions": None,
        "required_linear_history": True,
        "allow_force_pushes": False,
        "allow_deletions": False,
        "block_creations": False,
        "required_conversation_resolution": True,
        "lock_branch": False,
        "allow_fork_syncing": True,
    }
    gh_api("PUT", f"repos/{repo}/branches/{branch}/protection", payload, strict=False)


def gh_api(method: str, path: str, payload: dict | None = None, *, strict: bool) -> None:
    command = [
        "gh",
        "api",
        "--method",
        method,
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        f"X-GitHub-Api-Version: {API_VERSION}",
        path,
    ]

    temp_path: Path | None = None
    if payload is not None:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as temp_file:
            json.dump(payload, temp_file, ensure_ascii=False)
            temp_path = Path(temp_file.name)
        command.extend(["--input", str(temp_path)])

    try:
        result = run_command(command, check=False, capture_output=True)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()

    if result.returncode == 0:
        return

    message = (result.stderr or result.stdout or "").strip()
    if strict:
        raise SystemExit(f"GitHub API 调用失败：{path}\n{message}")
    hint = format_nonfatal_hint(path=path, message=message)
    if hint:
        SKIPPED_HINTS.append(hint)
    print(f"[跳过] {path}\n{message}\n", file=sys.stderr)


def format_nonfatal_hint(*, path: str, message: str) -> str | None:
    if "Advanced Security is enabled" in message:
        return "当前 GitHub 套餐不支持私有仓库直接启用 Code Security 或 Secret Scanning；仓库公开后或升级套餐后，可重新执行该脚本。"
    if "Upgrade to GitHub Pro or make this repository public to enable this feature." in message:
        if "/branches/" in path:
            return "当前私有仓库在现有 GitHub 套餐下无法启用分支保护；仓库公开后或升级套餐后，可重新执行该脚本。"
        return "当前 GitHub 套餐对该安全能力有限制；仓库公开后或升级套餐后，可重新执行该脚本。"
    return None


def print_skipped_hints() -> None:
    if not SKIPPED_HINTS:
        return
    print("\n附加说明：")
    for hint in dict.fromkeys(SKIPPED_HINTS):
        print(f"- {hint}")


def run_command(command: list[str], *, check: bool, capture_output: bool):
    return subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        check=check,
        text=True,
        encoding="utf-8",
        capture_output=capture_output,
    )


def shutil_which(name: str) -> str | None:
    from shutil import which

    return which(name)


if __name__ == "__main__":
    raise SystemExit(main())
