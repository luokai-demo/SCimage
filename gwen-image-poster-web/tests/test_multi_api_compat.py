from __future__ import annotations

import base64
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBAPP_DIR = PROJECT_ROOT / "webapp"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

for candidate in (WEBAPP_DIR, SCRIPTS_DIR):
    candidate_text = str(candidate)
    if candidate_text not in sys.path:
        sys.path.insert(0, candidate_text)

from gateway_client import GatewayConfig, GatewayFatalError, _is_retryable_message, save_image_item
from output_options import (
    OUTPUT_PROFILE_ASPECT_V1,
    OUTPUT_PROFILE_PIXEL_V1,
    normalize_quality,
    normalize_size_value,
    resolve_api_size_value,
)
from provider_compat import OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID
from provider_profiles import ProviderProfileStore


class OutputOptionsTests(unittest.TestCase):
    def test_pixel_profile_maps_legacy_quality_and_aspect(self) -> None:
        self.assertEqual(
            normalize_quality("medium", output_profile_id=OUTPUT_PROFILE_PIXEL_V1),
            "hd",
        )
        self.assertEqual(
            normalize_size_value("9:16", quality="hd", output_profile_id=OUTPUT_PROFILE_PIXEL_V1),
            "1440x2560",
        )

    def test_aspect_profile_accepts_pixel_size_and_resolves_api_dimensions(self) -> None:
        self.assertEqual(
            normalize_size_value("1440x2560", output_profile_id=OUTPUT_PROFILE_ASPECT_V1),
            "9:16",
        )
        self.assertEqual(
            resolve_api_size_value("9:16", "medium", output_profile_id=OUTPUT_PROFILE_ASPECT_V1),
            "1152x2048",
        )


class ProviderProfileStoreTests(unittest.TestCase):
    def test_store_persists_compat_profile_and_returns_registry(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = ProviderProfileStore(Path(temp_dir) / "provider-profiles.json")
            state = store.create_profile(
                name="newcoding",
                base_url="https://example.com/v1",
                model="gpt-image-1",
                api_key="secret-key",
                compat_profile_id=OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID,
            )

            self.assertEqual(
                state["active_profile"]["compat_profile_id"],
                OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID,
            )
            self.assertTrue(
                any(profile["id"] == OPENAI_CHAT_EDITS_COMPAT_PROFILE_ID for profile in state["compat_profiles"])
            )


class GatewayPayloadFallbackTests(unittest.TestCase):
    def test_upstream_error_is_retryable(self) -> None:
        self.assertTrue(_is_retryable_message('{"message":"Upstream request failed","type":"upstream_error"}'))

    def test_save_image_item_falls_back_to_base64_payload(self) -> None:
        payload = base64.b64encode(b"fallback-image-bytes").decode("ascii")
        with TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "image.png"
            with patch(
                "gateway_client.download_file",
                side_effect=GatewayFatalError("primary url failed"),
            ) as mocked_download:
                payload_type = save_image_item(
                    item={
                        "url": "https://example.com/primary.png",
                        "b64_json": payload,
                    },
                    target=target,
                    base_url="https://example.com/v1",
                    config=GatewayConfig(),
                )

            self.assertEqual(payload_type, "b64_json")
            self.assertEqual(target.read_bytes(), b"fallback-image-bytes")
            mocked_download.assert_called_once()


if __name__ == "__main__":
    unittest.main()
