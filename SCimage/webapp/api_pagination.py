from __future__ import annotations

from config import DEFAULT_JOBS_PAGE_SIZE, MAX_JOBS_PAGE_SIZE


def parse_int_query_value(query: dict[str, list[str]], key: str, *, default: int) -> int:
    values = query.get(key) or []
    if not values:
        return default
    try:
        return int(str(values[0]).strip())
    except (TypeError, ValueError):
        return default


def build_jobs_page_payload(store, query: dict[str, list[str]]) -> dict:
    offset = max(0, parse_int_query_value(query, "offset", default=0))
    limit = parse_int_query_value(query, "limit", default=DEFAULT_JOBS_PAGE_SIZE)
    cursor = str((query.get("cursor") or [""])[0]).strip()
    limit = min(MAX_JOBS_PAGE_SIZE, max(1, limit))
    return store.list_page(offset=offset, limit=limit, cursor=cursor)


def build_gallery_images_payload(store, query: dict[str, list[str]]) -> dict:
    limit = parse_int_query_value(query, "limit", default=DEFAULT_JOBS_PAGE_SIZE)
    cursor = str((query.get("cursor") or [""])[0]).strip()
    sort = str((query.get("sort") or ["desc"])[0]).strip().lower()
    group_by = str((query.get("group_by") or [""])[0]).strip().lower()
    group_key = str((query.get("group_key") or [""])[0]).strip()
    limit = min(MAX_JOBS_PAGE_SIZE, max(1, limit))
    return store.list_gallery_images(
        limit=limit,
        cursor=cursor,
        sort_asc=sort == "asc",
        group_by=group_by,
        group_key=group_key,
    )


def build_gallery_groups_payload(store, query: dict[str, list[str]]) -> dict:
    limit = parse_int_query_value(query, "limit", default=DEFAULT_JOBS_PAGE_SIZE)
    cursor = str((query.get("cursor") or [""])[0]).strip()
    sort = str((query.get("sort") or ["desc"])[0]).strip().lower()
    group_by = str((query.get("group_by") or ["task"])[0]).strip().lower()
    limit = min(MAX_JOBS_PAGE_SIZE, max(1, limit))
    return store.list_gallery_groups(
        group_by="prompt" if group_by in {"prompt", "prompts"} else "task",
        limit=limit,
        cursor=cursor,
        sort_asc=sort == "asc",
    )
