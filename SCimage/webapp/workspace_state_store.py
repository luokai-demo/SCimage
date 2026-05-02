from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from uuid import uuid4

from config import LOCAL_STATE_DIR, WORKSPACE_STATE_PATH
from output_options import DEFAULT_QUALITY, DEFAULT_SIZE_OPTION
from workflows import DEFAULT_WORKFLOW, IMAGE_TO_IMAGE_WORKFLOW, normalize_workflow


WORKFLOW_IDS = (DEFAULT_WORKFLOW, IMAGE_TO_IMAGE_WORKFLOW)
GALLERY_FILTER_IDS = ("all", "tasks", "prompts")
DEFAULT_GALLERY_FILTER = "all"


class WorkspaceStateStore:
    def __init__(self, path: Path = WORKSPACE_STATE_PATH) -> None:
        self._path = path
        self._lock = Lock()

    def get_state(self) -> dict:
        with self._lock:
            return self._load_unlocked()

    def replace_state(self, payload: dict) -> dict:
        with self._lock:
            state = _normalize_state_payload(payload)
            self._write_unlocked(state)
            return state

    def _load_unlocked(self) -> dict:
        if not self._path.exists():
            return _default_state()

        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return _default_state()

        normalized = _normalize_state_payload(payload)
        if payload != normalized:
            self._write_unlocked(normalized)
        return normalized

    def _write_unlocked(self, state: dict) -> None:
        LOCAL_STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _default_form() -> dict:
    return {
        "prompt": "",
        "size": DEFAULT_SIZE_OPTION,
        "quality": DEFAULT_QUALITY,
        "count": "1",
    }


def _default_state() -> dict:
    return {
        "active_workflow": DEFAULT_WORKFLOW,
        "forms": {workflow: _default_form() for workflow in WORKFLOW_IDS},
        "prompt_bank": {workflow: [] for workflow in WORKFLOW_IDS},
        "ui": {
            "gallery": {
                "filter": DEFAULT_GALLERY_FILTER,
            }
        },
    }


def _normalize_state_payload(payload: object) -> dict:
    state = _default_state()
    if not isinstance(payload, dict):
        return state

    state["active_workflow"] = normalize_workflow(payload.get("active_workflow"), fallback=DEFAULT_WORKFLOW)

    raw_forms = payload.get("forms")
    if isinstance(raw_forms, dict):
        for workflow in WORKFLOW_IDS:
            state["forms"][workflow] = _normalize_form(raw_forms.get(workflow))

    raw_prompt_bank = payload.get("prompt_bank")
    if isinstance(raw_prompt_bank, dict):
        for workflow in WORKFLOW_IDS:
            state["prompt_bank"][workflow] = _normalize_prompt_bank(raw_prompt_bank.get(workflow), workflow)

    state["ui"] = _normalize_ui_state(payload.get("ui"))

    return state


def _normalize_ui_state(payload: object) -> dict:
    raw_ui = payload if isinstance(payload, dict) else {}
    raw_gallery = raw_ui.get("gallery") if isinstance(raw_ui.get("gallery"), dict) else {}
    return {
        "gallery": {
            "filter": _normalize_gallery_filter(raw_gallery.get("filter")),
        }
    }


def _normalize_gallery_filter(value: object) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in GALLERY_FILTER_IDS:
        return normalized
    return DEFAULT_GALLERY_FILTER


def _normalize_form(payload: object) -> dict:
    raw_form = payload if isinstance(payload, dict) else {}
    return {
        "prompt": str(raw_form.get("prompt", "")),
        "size": str(raw_form.get("size") or DEFAULT_SIZE_OPTION).strip().lower(),
        "quality": str(raw_form.get("quality") or DEFAULT_QUALITY).strip().lower(),
        "count": str(_normalize_count(raw_form.get("count"), as_string=True)),
    }


def _normalize_prompt_bank(payload: object, fallback_workflow: str) -> list[dict]:
    if not isinstance(payload, list):
        return []

    entries: list[dict] = []
    seen_ids: set[str] = set()
    for raw_entry in payload:
        entry = _normalize_prompt_entry(raw_entry, fallback_workflow)
        if entry is None:
            continue
        if entry["id"] in seen_ids:
            entry["id"] = _create_id()
        seen_ids.add(entry["id"])
        entries.append(entry)
    return entries


def _normalize_prompt_entry(payload: object, fallback_workflow: str) -> dict | None:
    if not isinstance(payload, dict):
        return None

    prompt = str(payload.get("prompt", "")).strip()
    if not prompt:
        return None

    created_at = _normalize_timestamp(payload.get("createdAt") or payload.get("created_at"))
    updated_at = _normalize_timestamp(payload.get("updatedAt") or payload.get("updated_at"), fallback=created_at)
    return {
        "id": str(payload.get("id", "")).strip() or _create_id(),
        "workflow": normalize_workflow(payload.get("workflow"), fallback=fallback_workflow),
        "prompt": prompt,
        "outputProfileId": str(payload.get("outputProfileId") or payload.get("output_profile_id") or "").strip(),
        "size": str(payload.get("size") or DEFAULT_SIZE_OPTION).strip().lower(),
        "quality": str(payload.get("quality") or DEFAULT_QUALITY).strip().lower(),
        "count": _normalize_count(payload.get("count")),
        "createdAt": created_at,
        "updatedAt": updated_at,
    }


def _normalize_count(value: object, *, as_string: bool = False) -> int | str:
    try:
        normalized = max(1, int(value))
    except (TypeError, ValueError):
        normalized = 1
    return str(normalized) if as_string else normalized


def _normalize_timestamp(value: object, *, fallback: str | None = None) -> str:
    normalized = str(value or "").strip()
    if normalized:
        return normalized
    return fallback or ""


def _create_id() -> str:
    return uuid4().hex[:12]
