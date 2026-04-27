from __future__ import annotations

from pathlib import Path
import sys


WEBAPP_DIR = Path(__file__).resolve().parents[1] / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

import image_gateway_client as _gateway  # noqa: E402


GatewayConfig = _gateway.GatewayConfig
GatewayFatalError = _gateway.GatewayFatalError
GatewayRetryableError = _gateway.GatewayRetryableError
IMAGE_PAYLOAD_FIELDS = _gateway.IMAGE_PAYLOAD_FIELDS
_is_retryable_message = _gateway._is_retryable_message


def request_generation(*args, **kwargs):
    return _gateway.request_generation(*args, **kwargs)


def request_edit(*args, **kwargs):
    return _gateway.request_edit(*args, **kwargs)


def request_chat_completion_images(*args, **kwargs):
    return _gateway.request_chat_completion_images(*args, **kwargs)


def download_file(*args, **kwargs):
    return _gateway.download_file(*args, **kwargs)


def save_image_item(*args, **kwargs):
    original_download_file = _gateway.download_file
    _gateway.download_file = download_file
    try:
        return _gateway.save_image_item(*args, **kwargs)
    finally:
        _gateway.download_file = original_download_file
