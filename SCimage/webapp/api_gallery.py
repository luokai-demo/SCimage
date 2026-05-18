from __future__ import annotations

import io
import zipfile

from generated_assets import (
    cleanup_empty_job_output_dir,
    job_output_dir,
    remove_job_image_file,
    remove_job_output_dir,
    remove_obsolete_preview_dir,
)


def normalize_batch_selections(raw_items: object) -> list[dict]:
    if not isinstance(raw_items, list):
        return []
    selections = []
    seen = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        job_id = str(item.get("job_id") or item.get("jobId") or "").strip()
        try:
            slot = int(item.get("slot", 0))
        except (TypeError, ValueError):
            slot = 0
        key = (job_id, slot)
        if not job_id or slot <= 0 or key in seen:
            continue
        seen.add(key)
        selections.append({"job_id": job_id, "slot": slot})
    return selections


def remove_image_assets(job_id: str, image: dict, *, deleted_job: bool) -> None:
    remove_job_image_file(job_id, str(image.get("name", "")).strip())
    remove_obsolete_preview_dir(job_id)
    if deleted_job:
        remove_job_output_dir(job_id)
    else:
        cleanup_empty_job_output_dir(job_id)


def batch_delete_images(store, raw_items: object) -> dict:
    selections = normalize_batch_selections(raw_items)
    if not selections:
        raise ValueError("请先选择要删除的图片。")
    result = store.remove_images(selections)
    for item in result["removed"]:
        job_id = item["job_id"]
        remove_image_assets(
            job_id,
            item["image"],
            deleted_job=job_id in result["deleted_jobs"],
        )
    return {
        "ok": True,
        "removed_count": len(result["removed"]),
        "deleted_jobs": result["deleted_jobs"],
        "missing": result["missing"],
    }


def batch_download_images_archive(store, raw_items: object) -> bytes:
    selections = normalize_batch_selections(raw_items)
    if not selections:
        raise ValueError("请先选择要下载的图片。")
    buffer = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for selection in selections:
            snapshot = store.snapshot(selection["job_id"])
            if not snapshot:
                continue
            image = next(
                (
                    item for item in snapshot.get("images", [])
                    if int(item.get("slot", 0)) == selection["slot"]
                ),
                None,
            )
            if not image:
                continue
            image_name = str(image.get("name", "")).strip()
            image_path = (job_output_dir(selection["job_id"]) / image_name).resolve()
            try:
                image_path.relative_to(job_output_dir(selection["job_id"]).resolve())
            except ValueError:
                continue
            if not image_path.exists() or not image_path.is_file():
                continue
            archive.write(image_path, f"{selection['job_id']}/{image_name}")
            added += 1
    if added == 0:
        raise FileNotFoundError("选中的图片文件不存在，无法下载。")
    return buffer.getvalue()
