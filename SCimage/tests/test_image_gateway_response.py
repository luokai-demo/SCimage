from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from image_gateway_errors import GatewayRetryableError  # noqa: E402
from image_gateway_response import extract_image_data, parse_gateway_response  # noqa: E402


class ImageGatewayResponseTests(unittest.TestCase):
    def test_extracts_images_from_chat_content_json_string(self) -> None:
        response = {
            "choices": [
                {
                    "message": {
                        "content": '{"data":[{"url":"https://example.com/image.png"},{"b64_json":"ZmFrZQ=="}]}',
                    },
                },
            ],
        }

        self.assertEqual(
            extract_image_data(response),
            [
                {"url": "https://example.com/image.png"},
                {"b64_json": "ZmFrZQ=="},
            ],
        )

    def test_parse_sse_response_normalizes_image_events(self) -> None:
        result = subprocess.CompletedProcess(
            args=["curl"],
            returncode=0,
            stdout=(
                ": connected\n\n"
                'data: {"choices":[{"delta":{"content":"https://example.com/one.png"}}]}\n\n'
                'data: {"data":[{"data_url":"data:image/png;base64,ZmFrZQ=="}]}\n\n'
                "data: [DONE]\n\n"
            ),
            stderr="",
        )

        self.assertEqual(
            parse_gateway_response(result),
            {
                "data": [
                    {"url": "https://example.com/one.png"},
                    {"data_url": "data:image/png;base64,ZmFrZQ=="},
                ],
            },
        )

    def test_html_response_is_retryable(self) -> None:
        result = subprocess.CompletedProcess(
            args=["curl"],
            returncode=0,
            stdout="<html><title>504 gateway timeout</title></html>",
            stderr="",
        )

        with self.assertRaises(GatewayRetryableError):
            parse_gateway_response(result)


if __name__ == "__main__":
    unittest.main()
