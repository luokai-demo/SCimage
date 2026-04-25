from __future__ import annotations

DEFAULT_WORKFLOW = "generate"
IMAGE_TO_IMAGE_WORKFLOW = "image-to-image"

SUPPORTED_WORKFLOWS = {
    DEFAULT_WORKFLOW,
    IMAGE_TO_IMAGE_WORKFLOW,
}

WORKFLOW_LABELS = {
    DEFAULT_WORKFLOW: "文生图",
    IMAGE_TO_IMAGE_WORKFLOW: "图生图",
}


def normalize_workflow(value: object, *, fallback: str = DEFAULT_WORKFLOW) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in SUPPORTED_WORKFLOWS:
        return normalized
    return fallback


def validate_workflow(value: object) -> str:
    normalized = normalize_workflow(value, fallback="")
    if normalized:
        return normalized
    supported = "、".join(sorted(SUPPORTED_WORKFLOWS))
    raise ValueError(f"工作流无效，可选值：{supported}。")


def requires_source_images(workflow: object) -> bool:
    return normalize_workflow(workflow) == IMAGE_TO_IMAGE_WORKFLOW


def workflow_label(workflow: object) -> str:
    normalized = normalize_workflow(workflow)
    return WORKFLOW_LABELS.get(normalized, WORKFLOW_LABELS[DEFAULT_WORKFLOW])
