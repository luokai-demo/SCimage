from __future__ import annotations

import json
import re
import subprocess

from image_gateway_errors import GatewayFatalError, GatewayRetryableError, is_retryable_message, normalize_message


HTTP_IMAGE_URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)


def parse_gateway_response(result: subprocess.CompletedProcess[str]) -> dict:
    if result.returncode != 0:
        message = normalize_message(result.stderr or result.stdout or "curl request failed.")
        if is_retryable_message(message):
            raise GatewayRetryableError(message)
        raise GatewayFatalError(message)

    body = result.stdout
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        if "Extra data" in str(exc):
            try:
                return _parse_last_json_document(body)
            except json.JSONDecodeError:
                pass

        sse_payload = _parse_sse_response(body)
        if sse_payload is not None:
            return sse_payload

        snippet = normalize_message(body[:400])
        message = f"Gateway returned non-JSON content: {exc}. Snippet: {snippet}"
        if is_retryable_message(message):
            raise GatewayRetryableError(message)
        raise GatewayFatalError(message)


def extract_image_data(response: dict) -> list[dict]:
    data = response.get("data")
    if isinstance(data, list):
        return normalize_image_items(data)

    choices = response.get("choices")
    if not isinstance(choices, list):
        return []

    items = []
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        for payload_key in ("message", "delta"):
            payload = choice.get(payload_key)
            if isinstance(payload, dict):
                items.extend(_extract_image_items_from_content(payload.get("content")))
    return normalize_image_items(items)


def normalize_image_items(items: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("url"):
            key = ("url", str(item["url"]))
            if key not in seen:
                seen.add(key)
                normalized.append({"url": str(item["url"])})
        elif item.get("data_url"):
            key = ("data_url", str(item["data_url"]))
            if key not in seen:
                seen.add(key)
                normalized.append({"data_url": str(item["data_url"])})
        elif item.get("b64_json"):
            key = ("b64_json", str(item["b64_json"]))
            if key not in seen:
                seen.add(key)
                normalized.append({"b64_json": str(item["b64_json"])})
    return normalized


def _parse_last_json_document(body: str) -> dict:
    decoder = json.JSONDecoder()
    index = 0
    last_obj = None

    while index < len(body):
        while index < len(body) and body[index].isspace():
            index += 1
        if index >= len(body):
            break
        obj, next_index = decoder.raw_decode(body, index)
        last_obj = obj
        index = next_index

    if not isinstance(last_obj, dict):
        raise json.JSONDecodeError("Last JSON document is not an object", body, 0)
    return last_obj


def _parse_sse_response(body: str) -> dict | None:
    events: list[dict] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith(":") or not line.startswith("data:"):
            continue
        payload = line.removeprefix("data:").strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)

    if not events:
        return None

    for event in reversed(events):
        if event.get("error"):
            return {"error": event["error"]}

    items: list[dict] = []
    for event in events:
        items.extend(extract_image_data(event))
    if items:
        return {"data": normalize_image_items(items)}

    return events[-1]


def _extract_image_items_from_content(content: object) -> list[dict]:
    if isinstance(content, list):
        items: list[dict] = []
        for block in content:
            items.extend(_extract_image_items_from_block(block))
        return items

    if isinstance(content, dict):
        data = content.get("data")
        if isinstance(data, list):
            return normalize_image_items(data)
        choices = content.get("choices")
        if isinstance(choices, list):
            return extract_image_data(content)
        return _extract_image_items_from_block(content)

    if not isinstance(content, str):
        return []

    stripped = content.strip()
    if not stripped:
        return []
    if stripped.startswith("data:image/"):
        return [{"data_url": stripped}]

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return [{"url": url.rstrip(".,)")} for url in HTTP_IMAGE_URL_PATTERN.findall(stripped)]
    return _extract_image_items_from_content(payload)


def _extract_image_items_from_block(block: object) -> list[dict]:
    items: list[dict] = []
    if isinstance(block, dict):
        if block.get("b64_json"):
            items.append({"b64_json": str(block["b64_json"])})
        if block.get("base64"):
            items.append({"b64_json": str(block["base64"])})
        if block.get("data_url"):
            items.append({"data_url": str(block["data_url"])})

        _append_url_item(items, block.get("url"))
        image_url = block.get("image_url")
        if isinstance(image_url, dict):
            _append_url_item(items, image_url.get("url"))
        else:
            _append_url_item(items, image_url)

        text = block.get("text")
        if isinstance(text, str) and text.strip():
            items.extend(_extract_image_items_from_content(text))

    elif isinstance(block, str):
        items.extend(_extract_image_items_from_content(block))

    return items


def _append_url_item(items: list[dict], raw_url: object) -> None:
    if not isinstance(raw_url, str) or not raw_url.strip():
        return
    normalized_url = raw_url.strip()
    if normalized_url.startswith("data:image/"):
        items.append({"data_url": normalized_url})
    else:
        items.append({"url": normalized_url})
