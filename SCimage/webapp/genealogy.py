from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Iterable


def build_genealogy_graph(jobs: Iterable[dict]) -> dict:
    normalized_jobs = [job for job in jobs if isinstance(job, dict)]
    nodes: dict[str, dict] = {}
    edges: dict[tuple[str, str], dict] = {}

    for job in normalized_jobs:
        for image in _list_payload(job.get("images")):
            node_id = _image_node_id(job.get("id"), image.get("slot"))
            if not node_id:
                continue
            nodes[node_id] = _generated_node(node_id, job, image)

    for job in normalized_jobs:
        output_ids = [
            _image_node_id(job.get("id"), image.get("slot"))
            for image in _list_payload(job.get("images"))
        ]
        output_ids = [node_id for node_id in output_ids if node_id]
        if not output_ids:
            continue

        for source in _list_payload(job.get("source_images")):
            source_id = _source_node_id(job, source)
            if not source_id:
                continue
            if source_id not in nodes:
                nodes[source_id] = _source_node(source_id, job, source)
            for output_id in output_ids:
                edges[(source_id, output_id)] = {
                    "from": source_id,
                    "to": output_id,
                    "job_id": str(job.get("id") or ""),
                }

    outgoing: dict[str, set[str]] = defaultdict(set)
    incoming: dict[str, set[str]] = defaultdict(set)
    for edge in edges.values():
        outgoing[edge["from"]].add(edge["to"])
        incoming[edge["to"]].add(edge["from"])

    families = _build_families(nodes, outgoing, incoming)
    return {
        "families": families,
        "nodes": sorted(nodes.values(), key=lambda item: (_timestamp(item.get("updated_at")), item["id"]), reverse=True),
        "edges": sorted(edges.values(), key=lambda item: (item["from"], item["to"])),
    }


def _build_families(
    nodes: dict[str, dict],
    outgoing: dict[str, set[str]],
    incoming: dict[str, set[str]],
) -> list[dict]:
    roots = [
        node_id
        for node_id, node in nodes.items()
        if not incoming[node_id] and (outgoing[node_id] or node.get("type") == "source" or node.get("workflow") == "image-to-image")
    ]

    families: list[dict] = []
    for root_id in roots:
        visited: set[str] = set()
        depths = {root_id: 0}
        queue: deque[str] = deque([root_id])
        while queue:
            node_id = queue.popleft()
            if node_id in visited:
                continue
            visited.add(node_id)
            for child_id in sorted(outgoing[node_id]):
                next_depth = depths[node_id] + 1
                if child_id not in depths or next_depth < depths[child_id]:
                    depths[child_id] = next_depth
                queue.append(child_id)

        family_nodes = [nodes[node_id] for node_id in visited if node_id in nodes]
        if not family_nodes:
            continue
        root = nodes[root_id]
        families.append(
            {
                "root_id": root_id,
                "title": _node_title(root),
                "prompt": str(root.get("prompt") or ""),
                "cover_url": str(root.get("preview_url") or root.get("url") or ""),
                "image_count": len([node for node in family_nodes if node.get("type") == "generated"]),
                "node_count": len(family_nodes),
                "generation_count": max(depths.values(), default=0) + 1,
                "latest_updated_at": max((str(node.get("updated_at") or "") for node in family_nodes), default=""),
                "has_multi_source": any(len(incoming[node_id]) > 1 for node_id in visited),
                "root_type": str(root.get("type") or "generated"),
            }
        )

    families.sort(key=lambda item: (_timestamp(item.get("latest_updated_at")), item["root_id"]), reverse=True)
    return families


def _generated_node(node_id: str, job: dict, image: dict) -> dict:
    preview = image.get("preview") if isinstance(image.get("preview"), dict) else {}
    return {
        "id": node_id,
        "type": "generated",
        "job_id": str(job.get("id") or ""),
        "slot": _to_positive_int(image.get("slot"), 0),
        "url": str(image.get("url") or ""),
        "preview_url": str(preview.get("url") or image.get("preview_url") or image.get("url") or ""),
        "filename": str(image.get("name") or ""),
        "prompt": str(job.get("prompt") or ""),
        "workflow": str(job.get("workflow") or ""),
        "status": str(job.get("status") or ""),
        "model": str(job.get("model") or ""),
        "compat_profile_id": str(job.get("compat_profile_id") or ""),
        "output_profile_id": str(job.get("output_profile_id") or ""),
        "quality": str(job.get("quality") or ""),
        "size": str(job.get("size") or ""),
        "created_at": str(job.get("created_at") or ""),
        "updated_at": str(job.get("updated_at") or job.get("created_at") or ""),
    }


def _source_node(node_id: str, job: dict, source: dict) -> dict:
    origin = source.get("origin") if isinstance(source.get("origin"), dict) else {}
    return {
        "id": node_id,
        "type": "source",
        "job_id": str(origin.get("job_id") or ""),
        "slot": _to_positive_int(origin.get("slot"), 0),
        "url": str(origin.get("url") or source.get("url") or ""),
        "preview_url": str(origin.get("url") or source.get("url") or ""),
        "filename": str(origin.get("filename") or source.get("name") or ""),
        "prompt": str(origin.get("prompt") or job.get("prompt") or ""),
        "workflow": "source",
        "status": "source",
        "model": str(origin.get("model") or job.get("model") or ""),
        "compat_profile_id": str(job.get("compat_profile_id") or ""),
        "output_profile_id": str(job.get("output_profile_id") or ""),
        "quality": str(job.get("quality") or ""),
        "size": str(job.get("size") or ""),
        "created_at": str(job.get("created_at") or ""),
        "updated_at": str(job.get("created_at") or ""),
    }


def _source_node_id(job: dict, source: dict) -> str:
    origin = source.get("origin") if isinstance(source.get("origin"), dict) else {}
    origin_node_id = _image_node_id(origin.get("job_id"), origin.get("slot"))
    if origin_node_id:
        return origin_node_id
    job_id = str(job.get("id") or "").strip()
    slot = _to_positive_int(source.get("slot"), 0)
    if not job_id or not slot:
        return ""
    return f"source:{job_id}:{slot}"


def _image_node_id(job_id: object, slot: object) -> str:
    normalized_job_id = str(job_id or "").strip()
    normalized_slot = _to_positive_int(slot, 0)
    if not normalized_job_id or not normalized_slot:
        return ""
    return f"{normalized_job_id}:{normalized_slot}"


def _node_title(node: dict) -> str:
    prompt = str(node.get("prompt") or "").strip()
    if prompt:
        return prompt
    filename = str(node.get("filename") or "").strip()
    if filename:
        return filename
    return str(node.get("id") or "未命名族谱")


def _list_payload(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _timestamp(value: object) -> float:
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0


def _to_positive_int(value: object, default: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return default
    return normalized if normalized > 0 else default
